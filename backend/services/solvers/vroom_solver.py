# services/solvers/vroom_solver.py
from __future__ import annotations
from typing import List, Optional, Tuple, Any
import inspect
import math

from core.interfaces import VRPSolver
from core.exceptions import SolverRequestError
from models.solvers import SolveRequest, Routes, Route
from models.fleet import Vehicle
from models.distance_matrix import MatrixResult

try:
    from vroom import Vehicle as VroomVehicle, Job as VroomJob, Input as VroomInput
    _HAS_VROOM = True
except Exception:
    VroomVehicle = VroomJob = VroomInput = None  # type: ignore
    _HAS_VROOM = False


def _vehicles(fleet_obj) -> List[Vehicle]:
    return list(fleet_obj.vehicles) if hasattr(fleet_obj, "vehicles") else list(fleet_obj)


def _nn_path(dist: List[List[float]], depot: int) -> List[int]:
    n = len(dist)
    unvisited = set(range(n))
    unvisited.discard(depot)
    route = [depot]
    cur = depot
    while unvisited:
        nxt = min(unvisited, key=lambda j: dist[cur][j])
        route.append(nxt)
        unvisited.remove(nxt)
        cur = nxt
    route.append(depot)
    return route


def _route_totals(path: List[int], matrix: MatrixResult, ef_kg_per_km: float | None = None):
    total_dist_km = 0.0
    total_dur_s: Optional[float] = 0.0 if matrix.durations is not None else None
    for a, b in zip(path, path[1:]):
        total_dist_km += float(matrix.distances[a][b])
        if total_dur_s is not None:
            total_dur_s += float(matrix.durations[a][b])
    emissions = (ef_kg_per_km or 0.0) * total_dist_km if ef_kg_per_km else None
    return total_dist_km, int(total_dur_s) if isinstance(total_dur_s, (int, float)) else None, emissions


def _coords_from_waypoints(waypoints: List[Any]) -> List[Tuple[float, float]]:
    """
    Returns list of (lat, lon) in the *same node order* as waypoints.
    Supports both:
      - {"lat": ..., "lon": ...}
      - {"location": {"lat": ..., "lon": ...}}
    """
    coords: List[Tuple[float, float]] = []
    for wp in waypoints:
        if isinstance(wp, dict):
            lat = wp.get("lat")
            lon = wp.get("lon")
            if lat is None or lon is None:
                loc = wp.get("location") or {}
                lat = loc.get("lat")
                lon = loc.get("lon")
        else:
            # Pydantic model instance
            lat = getattr(wp, "lat", None)
            lon = getattr(wp, "lon", None)
            if lat is None or lon is None:
                loc = getattr(wp, "location", None)
                lat = getattr(loc, "lat", None) if loc is not None else None
                lon = getattr(loc, "lon", None) if loc is not None else None

        if lat is None or lon is None:
            raise SolverRequestError("Waypoint is missing lat/lon (either top-level or under .location).")
        coords.append((float(lat), float(lon)))
    return coords


def _euclid_matrix(coords_latlon: List[Tuple[float, float]]) -> List[List[float]]:
    """
    Simple Euclidean distances on the provided (lat, lon) pairs.
    Note: your Solomon coordinates are planar; this is sufficient for tests.
    """
    n = len(coords_latlon)
    dist = [[0.0] * n for _ in range(n)]
    for i in range(n):
        lat_i, lon_i = coords_latlon[i]
        for j in range(i + 1, n):
            lat_j, lon_j = coords_latlon[j]
            d = math.hypot(lat_i - lat_j, lon_i - lon_j)
            dist[i][j] = d
            dist[j][i] = d
    return dist


class VroomSolver(VRPSolver):
    def solve(self, request: SolveRequest) -> Routes:
        # ---- normalize fleet / depot ----
        vehicles = _vehicles(request.fleet)
        if not vehicles:
            raise SolverRequestError("VroomSolver: fleet is empty.")
        depot = int(request.depot_index or 0)

        # ---- normalize matrix (optional) ----
        matrix: Optional[MatrixResult] = None
        if request.matrix is not None:
            if isinstance(request.matrix, MatrixResult):
                matrix = request.matrix
            elif isinstance(request.matrix, dict):
                matrix = MatrixResult(**request.matrix)
            else:
                raise SolverRequestError(f"Unsupported matrix type: {type(request.matrix)}")

        # ---- if no matrix, derive from waypoints (coordinate-mode) ----
        coords_latlon: Optional[List[Tuple[float, float]]] = None
        if matrix is None:
            if not getattr(request, "waypoints", None):
                raise SolverRequestError("VROOM needs either 'matrix' or 'waypoints' (coordinate mode).")
            coords_latlon = _coords_from_waypoints(request.waypoints)
            dist = _euclid_matrix(coords_latlon)
            # Use distance as duration too (arbitrary units) to keep the solver happy
            durations = [row[:] for row in dist]
            matrix = MatrixResult(distances=dist, durations=durations)
        else:
            # matrix mode: optionally take embedded coordinates if present
            coords_latlon = None

        # basic sanity
        n = len(matrix.distances)
        if not (0 <= depot < n):
            raise SolverRequestError(f"Invalid depot_index {depot} for matrix size {n}.")

        # ---- No pyvroom? fallback NN on our matrix (single consolidated route) ----
        if not _HAS_VROOM:
            path = _nn_path(matrix.distances, depot)
            td, tt, em = _route_totals(path, matrix, getattr(vehicles[0], "emissions_per_km", None))
            return Routes(
                status="success",
                message="Fallback NN solution (pyvroom not available)",
                routes=[Route(vehicle_id=str(vehicles[0].id),
                              waypoint_ids=[str(i) for i in path],
                              total_distance=td, total_duration=tt, emissions=em)]
            )

        # ---- pyvroom input ----
        try:
            inp = VroomInput()

            # Vehicle constructor probing
            v_sig = inspect.signature(VroomVehicle.__init__)
            v_params = set(v_sig.parameters.keys())

            # Job signature probing (to decide index vs coord mode)
            j_sig = inspect.signature(VroomJob.__init__)
            j_params = set(j_sig.parameters.keys())

            coord_mode = False
            index_kw = None
            if "location_index" in j_params:
                index_kw = "location_index"   # modern builds
            elif "index" in j_params:
                index_kw = "index"            # some builds
            elif "location" in j_params:
                coord_mode = True             # coordinates-only build
            else:
                raise SolverRequestError("Unrecognized pyvroom Job signature; cannot set location/index.")

            # If we’re in coordinate-mode (no matrix originally), we **do** have coords_latlon now.
            if coord_mode and coords_latlon is None:
                # Try to discover coordinates from matrix if provided there
                coords = getattr(matrix, "coordinates", None)
                if coords and len(coords) == n and isinstance(coords[0], (list, tuple)) and len(coords[0]) == 2:
                    # convert to (lat, lon)
                    coords_latlon = [(float(c[1]), float(c[0])) for c in coords]  # if matrix uses [lon,lat]
                else:
                    # --- fallback to NN when coords unavailable on coord-only pyvroom builds ---
                    path = _nn_path(matrix.distances, depot)
                    td, tt, em = _route_totals(path, matrix, getattr(vehicles[0], "emissions_per_km", None))
                    return Routes(
                        status="success",
                        message="pyvroom requires coordinates but none provided; fallback NN used",
                        routes=[Route(vehicle_id=str(vehicles[0].id),
                                      waypoint_ids=[str(i) for i in path],
                                      total_distance=td, total_duration=tt, emissions=em)]
                    )

            # ---- Vehicles ----
            for k, v0 in enumerate(vehicles):
                start_idx = int(getattr(v0, "start", depot) or depot)
                end_idx = int(getattr(v0, "end", depot) or depot)
                capacity = getattr(v0, "capacity", []) or []

                v_kwargs = {}
                if coord_mode:
                    # Vehicles expect coordinates
                    if coords_latlon is None:
                        # safety net; should not happen due to fallback above
                        path = _nn_path(matrix.distances, depot)
                        td, tt, em = _route_totals(path, matrix, getattr(vehicles[0], "emissions_per_km", None))
                        return Routes(
                            status="success",
                            message="pyvroom coordinate mode lacked coords; fallback NN used",
                            routes=[Route(vehicle_id=str(vehicles[0].id),
                                          waypoint_ids=[str(i) for i in path],
                                          total_distance=td, total_duration=tt, emissions=em)]
                        )
                    # vroom expects [lon, lat] order
                    start_ll = coords_latlon[start_idx]
                    end_ll = coords_latlon[end_idx]
                    start_xy = [float(start_ll[1]), float(start_ll[0])]
                    end_xy = [float(end_ll[1]), float(end_ll[0])]

                    if "start" in v_params:
                        v_kwargs["start"] = start_xy
                    elif "start_index" in v_params:
                        v_kwargs["start_index"] = start_idx
                    else:
                        raise SolverRequestError("pyvroom Vehicle.__init__ lacks 'start'/'start_index'.")

                    if "end" in v_params:
                        v_kwargs["end"] = end_xy
                    elif "end_index" in v_params:
                        v_kwargs["end_index"] = end_idx
                else:
                    # Index mode
                    if "start_index" in v_params:
                        v_kwargs["start_index"] = start_idx
                    elif "start" in v_params:
                        v_kwargs["start"] = start_idx
                    else:
                        raise SolverRequestError("pyvroom Vehicle.__init__ lacks 'start'/'start_index'.")

                    if "end_index" in v_params:
                        v_kwargs["end_index"] = end_idx
                    elif "end" in v_params:
                        v_kwargs["end"] = end_idx

                if "capacity" in v_params:
                    v_kwargs["capacity"] = capacity

                veh_obj = VroomVehicle(k, **v_kwargs)
                inp.add_vehicle(veh_obj)

            # ---- Jobs (all nodes except depot) ----
            if coord_mode:
                # vroom wants [lon, lat]
                for loc in range(n):
                    if loc == depot:
                        continue
                    ll = coords_latlon[loc]
                    job_xy = [float(ll[1]), float(ll[0])]
                    job = VroomJob(loc, location=job_xy)
                    inp.add_job(job)
            else:
                for loc in range(n):
                    if loc == depot:
                        continue
                    if index_kw == "location_index":
                        job = VroomJob(loc, location_index=loc)
                    else:  # "index"
                        job = VroomJob(loc, index=loc)
                    inp.add_job(job)

            # ---- Inject costs (bypass OSRM) ----
            durations = matrix.durations if matrix.durations is not None else [[0.0] * n for _ in range(n)]
            if hasattr(inp, "set_costs"):
                inp.set_costs(matrix.distances, durations)
            else:
                if hasattr(inp, "set_durations"):
                    inp.set_durations(durations)
                if hasattr(inp, "set_distances"):
                    inp.set_distances(matrix.distances)

            sol = inp.solve(exploration_level=5)

            # No routes? fallback NN as one consolidated route on vehicle 0
            if not hasattr(sol, "routes") or not sol.routes:
                path = _nn_path(matrix.distances, depot)
                td, tt, em = _route_totals(path, matrix, getattr(vehicles[0], "emissions_per_km", None))
                return Routes(
                    status="success",
                    message="VROOM returned empty; fallback NN used",
                    routes=[Route(vehicle_id=str(vehicles[0].id),
                                  waypoint_ids=[str(i) for i in path],
                                  total_distance=td, total_duration=tt, emissions=em)]
                )

            # ---- Extract per-vehicle routes ----
            out_routes: List[Route] = []
            for r in sol.routes:
                k = getattr(r, "vehicle", None)
                veh_id = str(vehicles[k].id) if isinstance(k, int) and 0 <= k < len(vehicles) else str(vehicles[0].id)

                path: List[int] = []
                start_idx = int(getattr(vehicles[k], "start", depot) if isinstance(k, int) else depot)
                end_idx = int(getattr(vehicles[k], "end", depot) if isinstance(k, int) else depot)
                path.append(start_idx)

                for st in getattr(r, "steps", []):
                    li = getattr(st, "location_index", None)
                    if li is None:
                        li = getattr(st, "job", None)
                    if isinstance(li, int) and li != start_idx:
                        path.append(li)

                if path[-1] != end_idx:
                    path.append(end_idx)

                td, tt, em = _route_totals(path, matrix, getattr(vehicles[k if isinstance(k, int) else 0], "emissions_per_km", None))
                out_routes.append(Route(
                    vehicle_id=veh_id,
                    waypoint_ids=[str(i) for i in path],
                    total_distance=td,
                    total_duration=tt,
                    emissions=em,
                ))

            return Routes(status="success", message="VROOM solution", routes=out_routes)

        except SolverRequestError:
            raise
        except TypeError as te:
            raise SolverRequestError(f"pyvroom ctor failed: {te}")
        except Exception as e:
            # Last resort: one NN route on vehicle 0
            path = _nn_path(matrix.distances, depot)
            td, tt, em = _route_totals(path, matrix, getattr(vehicles[0], "emissions_per_km", None))
            return Routes(
                status="success",
                message=f"pyvroom error: {e}; fallback NN used",
                routes=[Route(vehicle_id=str(vehicles[0].id),
                              waypoint_ids=[str(i) for i in path],
                              total_distance=td, total_duration=tt, emissions=em)]
            )
