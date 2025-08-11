from __future__ import annotations
from typing import List
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
            vehicles: List[Vehicle] = _as_vehicle_list(request.fleet)
            n = len(matrix.distances)
            if n == 0:
                return Routes(status="error", message="Empty matrix", routes=[])

            num_vehicles = max(1, len(vehicles))
            depot_index = int(request.depot_index or 0)

            starts = []
            ends = []
            for v in vehicles:
                starts.append(int(getattr(v, "start", depot_index)))
                ends.append(int(getattr(v, "end", depot_index)))
            if not starts:
                starts = [depot_index] * num_vehicles
                ends = [depot_index] * num_vehicles

            manager = pywrapcp.RoutingIndexManager(n, num_vehicles, starts, ends)
            routing = pywrapcp.RoutingModel(manager)

            def distance_cb(from_index, to_index):
                f = manager.IndexToNode(from_index)
                t = manager.IndexToNode(to_index)
                return int(round(matrix.distances[f][t] * 1000))

            transit = routing.RegisterTransitCallback(distance_cb)
            routing.SetArcCostEvaluatorOfAllVehicles(transit)

            demands = getattr(request, "demands", None)
            any_cap = any((v.capacity or []) for v in vehicles)
            if demands and any_cap:
                if len(demands) != n:
                    raise SolverRequestError("Length of demands must match number of matrix nodes.")
                demand_idx = routing.RegisterUnaryTransitCallback(
                    lambda i: int(demands[manager.IndexToNode(i)]))
                caps = [int((v.capacity or [10**12])[0]) for v in vehicles]
                routing.AddDimensionWithVehicleCapacity(demand_idx, 0, caps, True, "Capacity")

            search = pywrapcp.DefaultRoutingSearchParameters()
            search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
            search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
            search.time_limit.FromSeconds(5)

            solution = routing.SolveWithParameters(search)
            if not solution:
                return Routes(status="error", message="No solution found", routes=[])

            out_routes: List[Route] = []
            for v in range(num_vehicles):
                idx = routing.Start(v)
                path_idx = []
                while not routing.IsEnd(idx):
                    node = manager.IndexToNode(idx)
                    path_idx.append(node)
                    idx = solution.Value(routing.NextVar(idx))
                path_idx.append(manager.IndexToNode(idx))
                out_routes.append(
                    Route(vehicle_id=str(getattr(vehicles[v], "id", v)),
                          waypoint_ids=[str(i) for i in path_idx])
                )

            return Routes(status="success", routes=out_routes)
        except SolverRequestError:
            raise
        except Exception as e:
            raise SolverRequestError(f"OR-Tools failed: {e}")
