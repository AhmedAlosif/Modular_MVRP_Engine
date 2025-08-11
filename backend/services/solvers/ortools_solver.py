# services/solvers/ortools_solver.py
from __future__ import annotations

from typing import List, Optional

from ortools.constraint_solver import routing_enums_pb2, pywrapcp

from core.interfaces import VRPSolver
from core.exceptions import SolverRequestError
from models.solvers import SolveRequest, Routes, Route
from models.fleet import Vehicle
from models.distance_matrix import MatrixResult


def _as_vehicle_list(fleet_obj) -> List[Vehicle]:
    if hasattr(fleet_obj, "vehicles"):
        return list(fleet_obj.vehicles)
    if isinstance(fleet_obj, list):
        return fleet_obj
    raise SolverRequestError("Invalid fleet: expected Fleet or List[Vehicle].")


class OrToolsSolver(VRPSolver):
    def solve(self, request: SolveRequest) -> Routes:
        try:
            matrix: MatrixResult = request.matrix
            dist_km = matrix.distances
            n = len(dist_km)
            if n == 0:
                return Routes(status="error", message="Empty matrix", routes=[])

            vehicles: List[Vehicle] = _as_vehicle_list(request.fleet)
            num_vehicles = max(1, len(vehicles))
            depot = int(request.depot_index or 0)

            # Starts/ends
            starts = [int(getattr(v, "start", depot)) for v in vehicles] or [depot] * num_vehicles
            ends   = [int(getattr(v, "end", depot))   for v in vehicles] or [depot] * num_vehicles

            manager = pywrapcp.RoutingIndexManager(n, num_vehicles, starts, ends)
            routing = pywrapcp.RoutingModel(manager)

            # --- Distance cost (km -> meters int) ---
            def distance_cb(from_index, to_index):
                f = manager.IndexToNode(from_index)
                t = manager.IndexToNode(to_index)
                return int(round(dist_km[f][t] * 1000))
            transit_distance = routing.RegisterTransitCallback(distance_cb)
            routing.SetArcCostEvaluatorOfAllVehicles(transit_distance)

            # --- Capacity (optional) ---
            demands = request.demands
            any_cap = any((v.capacity or []) for v in vehicles)
            if demands and any_cap:
                if len(demands) != n:
                    raise SolverRequestError("Length of demands must match number of nodes.")
                demand_idx = routing.RegisterUnaryTransitCallback(lambda i: int(demands[manager.IndexToNode(i)]))
                caps = [int((v.capacity or [10**12])[0]) for v in vehicles]
                routing.AddDimensionWithVehicleCapacity(demand_idx, 0, caps, True, "Capacity")

            # --- Time windows (optional) ---
            node_tw = request.node_time_windows  # List[ [start,end] | None ]
            service_times = request.node_service_times or [0] * n
            durations = matrix.durations  # seconds, if provided

            use_time = bool(node_tw) or any(getattr(v, "time_window", None) for v in vehicles)
            if use_time:
                def time_cb(from_index, to_index):
                    f = manager.IndexToNode(from_index)
                    t = manager.IndexToNode(to_index)
                    if durations is not None:
                        base = float(durations[f][t])
                    else:
                        speed_kmh = 40.0  # fallback speed
                        base = (dist_km[f][t] / max(speed_kmh, 1e-6)) * 3600.0
                    base += float(service_times[f] or 0)  # service at FROM
                    return int(round(base))

                transit_time = routing.RegisterTransitCallback(time_cb)
                horizon = 24 * 3600
                routing.AddDimension(
                    transit_time,
                    slack_max=3600,     # 1h waiting
                    capacity=horizon,   # max cumul
                    fix_start_cumul_to_zero=True,
                    name="Time",
                )
                time_dim = routing.GetDimensionOrDie("Time")

                # Vehicle time windows at starts/ends (+ optional max_duration)
                for v_idx, v in enumerate(vehicles):
                    start = 0
                    end = horizon
                    tw = getattr(v, "time_window", None)
                    if isinstance(tw, (list, tuple)) and len(tw) == 2:
                        start, end = int(tw[0]), int(tw[1])
                    time_dim.CumulVar(routing.Start(v_idx)).SetRange(start, end)
                    time_dim.CumulVar(routing.End(v_idx)).SetRange(0, horizon)
                    max_dur = getattr(v, "max_duration", None)
                    if max_dur:
                        time_dim.CumulVar(routing.End(v_idx)).SetRange(0, int(max_dur))

                # Node time windows
                if node_tw:
                    for node in range(n):
                        tw = node_tw[node] if node < len(node_tw) else None
                        if tw and len(tw) == 2:
                            start, end = int(tw[0]), int(tw[1])
                            index = manager.NodeToIndex(node)
                            time_dim.CumulVar(index).SetRange(start, end)

            # Search
            search = pywrapcp.DefaultRoutingSearchParameters()
            search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
            search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
            search.time_limit.FromSeconds(5)

            solution = routing.SolveWithParameters(search)
            if not solution:
                return Routes(status="error", message="No solution found", routes=[])

            # Build routes + totals
            out_routes: List[Route] = []
            objective = solution.ObjectiveValue() if hasattr(solution, "ObjectiveValue") else None

            for v in range(num_vehicles):
                idx = routing.Start(v)
                path_idx: List[int] = []
                while not routing.IsEnd(idx):
                    node = manager.IndexToNode(idx)
                    path_idx.append(node)
                    idx = solution.Value(routing.NextVar(idx))
                path_idx.append(manager.IndexToNode(idx))

                total_dist_km = 0.0
                total_dur_s: Optional[float] = 0.0 if (durations is not None or use_time) else None
                for a, b in zip(path_idx, path_idx[1:]):
                    total_dist_km += float(dist_km[a][b])
                    if total_dur_s is not None:
                        if durations is not None:
                            total_dur_s += float(durations[a][b]) + float(service_times[a] or 0)
                        else:
                            speed_kmh = 40.0
                            total_dur_s += (dist_km[a][b] / speed_kmh) * 3600.0 + float(service_times[a] or 0)

                veh = vehicles[v]
                ef = float(getattr(veh, "emissions_per_km", 0.0) or 0.0)  # kg/km
                emissions_kg = ef * total_dist_km if ef else None

                out_routes.append(
                    Route(
                        vehicle_id=str(getattr(veh, "id", v)),
                        waypoint_ids=[str(i) for i in path_idx],
                        total_distance=total_dist_km,
                        total_duration=int(total_dur_s) if isinstance(total_dur_s, (int, float)) else None,
                        emissions=emissions_kg,
                        metadata={"objective": objective} if objective is not None else None,
                    )
                )

            return Routes(status="success", message="Solution found", routes=out_routes)
        except SolverRequestError:
            raise
        except Exception as e:
            raise SolverRequestError(f"OR-Tools failed: {e}")
