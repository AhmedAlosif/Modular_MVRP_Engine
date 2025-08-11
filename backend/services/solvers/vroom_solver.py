# services/solvers/vroom_solver.py
from __future__ import annotations

from typing import List, Optional, Union
from core.interfaces import VRPSolver
from core.exceptions import SolverRequestError
from models.solvers import SolveRequest, Routes, Route
from models.distance_matrix import MatrixResult

try:
    from vroom import Vehicle as VroomVehicle, Job as VroomJob, Input as VroomInput
    _HAS_VROOM = True
except Exception:
    VroomVehicle = VroomJob = VroomInput = None  # type: ignore
    _HAS_VROOM = False


def _vehicles(fleet_obj) -> List:
    return fleet_obj.vehicles if hasattr(fleet_obj, "vehicles") else fleet_obj


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


class VroomSolver(VRPSolver):
    def solve(self, request: SolveRequest) -> Routes:
        matrix: MatrixResult = request.matrix
        dist = matrix.distances
        n = len(dist)
        if n == 0:
            return Routes(status="error", message="Empty matrix", routes=[])

        vehicles = _vehicles(request.fleet)
        if len(vehicles) != 1:
            raise SolverRequestError("VroomSolver currently supports exactly 1 vehicle.")
        v0 = vehicles[0]

        depot = int(request.depot_index or 0)
        if not (0 <= depot < n):
            raise SolverRequestError(f"Invalid depot_index {depot} for matrix size {n}.")

        # If pyvroom not present, fallback to NN
        if not _HAS_VROOM:
            path = _nn_path(dist, depot)
            td, tt, em = _route_totals(path, matrix, getattr(v0, "emissions_per_km", None))
            return Routes(
                status="success",
                message="Fallback NN solution (pyvroom not available)",
                routes=[Route(vehicle_id=str(v0.id), waypoint_ids=[str(i) for i in path],
                              total_distance=td, total_duration=tt, emissions=em)]
            )

        # Try pyvroom with multiple constructor shapes
        try:
            inp = VroomInput()

            start_idx = int(getattr(v0, "start", depot))
            end_idx = int(getattr(v0, "end", depot))
            cap = getattr(v0, "capacity", []) or []

            vehicle_added = False
            try:
                # Common signature
                inp.add_vehicle(VroomVehicle(0, start_index=start_idx, end_index=end_idx, capacity=cap))
                vehicle_added = True
            except TypeError:
                try:
                    # Fallback minimal signature
                    inp.add_vehicle(VroomVehicle(0))
                    vehicle_added = True
                except Exception as e:
                    raise SolverRequestError(f"pyvroom Vehicle ctor failed: {e}")

            # Jobs: all non-depot nodes (typical vroom pattern)
            for loc in range(n):
                # avoid double-adding the start/end if vroom treats them implicitly
                if loc == start_idx or loc == end_idx:
                    continue
                inp.add_job(VroomJob(loc, location_index=loc))

            # Costs
            if not hasattr(inp, "set_costs"):
                raise SolverRequestError("pyvroom Input.set_costs() not available in this build.")
            durations = matrix.durations if matrix.durations is not None else [[0.0] * n for _ in range(n)]
            inp.set_costs(dist, durations)

            sol = inp.solve(exploration_level=5)

            # If solution empty, fall back
            if not hasattr(sol, "routes") or not sol.routes:
                path = _nn_path(dist, depot)
                td, tt, em = _route_totals(path, matrix, getattr(v0, "emissions_per_km", None))
                return Routes(
                    status="success",
                    message="VROOM returned empty; fallback NN used",
                    routes=[Route(vehicle_id=str(v0.id), waypoint_ids=[str(i) for i in path],
                                  total_distance=td, total_duration=tt, emissions=em)]
                )

            # Build path from route steps (best effort)
            route0 = sol.routes[0]
            path = [start_idx]
            for st in getattr(route0, "steps", []):
                li = getattr(st, "location_index", None)
                if li is not None and li != start_idx:
                    path.append(li)
            path.append(end_idx)
            td, tt, em = _route_totals(path, matrix, getattr(v0, "emissions_per_km", None))
            return Routes(
                status="success",
                message="VROOM solution",
                routes=[Route(vehicle_id=str(v0.id), waypoint_ids=[str(i) for i in path],
                              total_distance=td, total_duration=tt, emissions=em)]
            )

        except SolverRequestError:
            raise
        except Exception as e:
            # Absolute last resort
            path = _nn_path(dist, depot)
            td, tt, em = _route_totals(path, matrix, getattr(v0, "emissions_per_km", None))
            return Routes(
                status="success",
                message=f"pyvroom error: {e}; fallback NN used",
                routes=[Route(vehicle_id=str(v0.id), waypoint_ids=[str(i) for i in path],
                              total_distance=td, total_duration=tt, emissions=em)]
            )
