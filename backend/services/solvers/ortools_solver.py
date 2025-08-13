# services/solvers/ortools_solver.py
from __future__ import annotations
from typing import List, Optional
from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from core.interfaces import VRPSolver
from core.exceptions import SolverError
from models.distance_matrix import MatrixResult
from models.fleet import Vehicle
from models.solvers import Routes, Route, PickupDeliveryPair

class OrToolsSolver(VRPSolver):
    """
    CVRP/VRPTW/PDPTW using OR-Tools.
    - Weighted arc cost: distance + time (optional)
    - Capacity constraints
    - Node time windows + vehicle start/end TW
    - Service times (added at the 'from' node)
    - Pickup & Delivery pairs (same-vehicle + precedence)
    """

    def solve(
        self,
        fleet: List[Vehicle],
        matrix: MatrixResult,
        depot_index: int = 0,
        demands: Optional[List[int]] = None,
        node_time_windows: Optional[List[Optional[List[int]]]] = None,
        node_service_times: Optional[List[int]] = None,
        pickup_delivery_pairs: Optional[List[PickupDeliveryPair]] = None,
        weights: Optional[dict] = None,
    ) -> Routes:
        # ----------- Validate inputs -----------
        if not matrix or not matrix.distances:
            raise SolverError("OrToolsSolver: 'matrix.distances' is required.")
        n = len(matrix.distances)
        if any(len(row) != n for row in matrix.distances):
            raise SolverError("OrToolsSolver: distance matrix must be square.")

        if demands and len(demands) != n:
            raise SolverError("OrToolsSolver: 'demands' length must match matrix size.")

        if node_time_windows and len(node_time_windows) != n:
            raise SolverError("OrToolsSolver: 'node_time_windows' length must match matrix size.")

        if node_service_times and len(node_service_times) != n:
            raise SolverError("OrToolsSolver: 'node_service_times' length must match matrix size.")

        if not fleet or len(fleet) == 0:
            raise SolverError("OrToolsSolver: at least one vehicle is required.")

        # ----------- Index manager & model -----------
        starts = [v.start if v.start is not None else depot_index for v in fleet]
        ends = [v.end if v.end is not None else depot_index for v in fleet]

        manager = pywrapcp.RoutingIndexManager(n, len(fleet), starts, ends)
        routing = pywrapcp.RoutingModel(manager)

        # ----------- Weights for arc cost -----------
        w_dist = float(weights.get("distance", 1.0)) if weights else 1.0
        w_time = float(weights.get("time", 0.0)) if weights else 0.0
        COST_SCALE = 1000  # keep integer evaluator

        # ----------- Transit callbacks -----------
        # Distance (km) + optional time (hr) weighted
        def cost_callback(from_index: int, to_index: int) -> int:
            i = manager.IndexToNode(from_index)
            j = manager.IndexToNode(to_index)
            d_km = float(matrix.distances[i][j])
            t_hr = 0.0
            if matrix.durations:
                # durations expected in seconds
                t_sec = float(matrix.durations[i][j])
                t_hr = t_sec / 3600.0
            cost = (w_dist * d_km) + (w_time * t_hr)
            return int(round(cost * COST_SCALE))

        cost_index = routing.RegisterTransitCallback(cost_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(cost_index)

        # Favor fewer vehicles: default fixed cost; overridable via weights['vehicle_fixed_cost'] (in "distance units").
        vehicle_fixed_cost = None
        if weights and isinstance(weights.get("vehicle_fixed_cost"), (int, float)):
            vehicle_fixed_cost = float(weights["vehicle_fixed_cost"])
        else:
            # A reasonable default: ~100 "km" worth of cost per extra vehicle
            vehicle_fixed_cost = 100.0

        routing.SetFixedCostOfAllVehicles(int(round(vehicle_fixed_cost * COST_SCALE)))

        # ----------- Time dimension (if we have durations or TWs) -----------
        time_dimension = None
        if matrix.durations or node_time_windows:
            service_times = node_service_times if node_service_times else [0] * n

            if matrix.durations:
                # Use given durations (assumed consistent units with TWs and service times)
                def time_callback(from_index: int, to_index: int) -> int:
                    i = manager.IndexToNode(from_index)
                    j = manager.IndexToNode(to_index)
                    travel = float(matrix.durations[i][j])
                    return int(round(travel + (service_times[i] or 0)))
            else:
                # No durations: use distance as time unit to match instance TWs/service times
                def time_callback(from_index: int, to_index: int) -> int:
                    i = manager.IndexToNode(from_index)
                    j = manager.IndexToNode(to_index)
                    travel = float(matrix.distances[i][j])
                    return int(round(travel + (service_times[i] or 0)))

            time_index = routing.RegisterTransitCallback(time_callback)

            # Allow waiting; give a large horizon so TWs can be satisfied
            routing.AddDimension(
                time_index,
                #slack_max=0,               # no waiting slack here; add if you want waiting allowed
                slack_max=10**9,           # allow waiting so fewer vehicles can serve TWs
                capacity=10**9,            # large horizon
                fix_start_cumul_to_zero=True,
                name="Time",
            )
            time_dimension = routing.GetDimensionOrDie("Time")
        # ----------- Capacity dimension -----------
        if demands:
            # per-vehicle capacity (first capacity dim; default huge if missing)
            caps = [int(v.capacity[0]) if (v.capacity and len(v.capacity) > 0) else 10**9 for v in fleet]

            def demand_cb(from_index: int) -> int:
                i = manager.IndexToNode(from_index)
                return int(demands[i])

            demand_index = routing.RegisterUnaryTransitCallback(demand_cb)
            routing.AddDimensionWithVehicleCapacity(
                demand_index,  # demand callback
                0,             # no slack
                caps,          # vehicle capacities
                True,          # start cumul to zero
                "Capacity",
            )

        # ----------- Node time windows -----------
        if time_dimension and node_time_windows:
            for node, tw in enumerate(node_time_windows):
                if not tw:
                    continue
                start, end = int(tw[0]), int(tw[1])
                cumul = time_dimension.CumulVar(manager.NodeToIndex(node))
                cumul.SetRange(start, end)

        # Vehicle start/end time windows (if provided)
        if time_dimension:
            for v_id, v in enumerate(fleet):
                if getattr(v, "time_window", None):
                    vs, ve = int(v.time_window[0]), int(v.time_window[1])
                    time_dimension.CumulVar(routing.Start(v_id)).SetRange(vs, ve)
                    time_dimension.CumulVar(routing.End(v_id)).SetRange(vs, ve)

        # ----------- Pickup & Delivery -----------
        if pickup_delivery_pairs:
            for pair in pickup_delivery_pairs:
                p_idx = manager.NodeToIndex(int(pair.pickup))
                d_idx = manager.NodeToIndex(int(pair.delivery))
                routing.AddPickupAndDelivery(p_idx, d_idx)
                # same vehicle
                routing.solver().Add(routing.VehicleVar(p_idx) == routing.VehicleVar(d_idx))
                # precedence in time (if time dim exists)
                if time_dimension is not None:
                    routing.solver().Add(
                        time_dimension.CumulVar(p_idx) <= time_dimension.CumulVar(d_idx)
                    )

        # ----------- Search parameters -----------
        search = pywrapcp.DefaultRoutingSearchParameters()
        search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        search.time_limit.FromSeconds(10)

        # ----------- Solve -----------
        solution = routing.SolveWithParameters(search)
        # NOTE: routing_enums_pb2.RoutingStatus does not exist in Python bindings.
        # Use presence of 'solution' (success), and optionally routing.status() for an int.
        if solution is None:
            status = routing.status() if hasattr(routing, "status") else None
            # quick infeasibility hints
            caps = [int(v.capacity[0]) if v.capacity else 0 for v in fleet]
            total_cap = sum(caps)
            raise SolverError("No feasible solution found.")
        # ----------- Extract routes -----------
        routes: List[Route] = []
        # build quick helper for emissions cost per vehicle
        def _emissions_per_km(v: Vehicle) -> float:
            return float(getattr(v, "emissions_per_km", 0.0) or 0.0)

        for v_id, veh in enumerate(fleet):
            index = routing.Start(v_id)
            path_nodes: List[int] = []
            total_km = 0.0
            total_sec = 0.0

            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                path_nodes.append(node)

                next_index = solution.Value(routing.NextVar(index))
                if not routing.IsEnd(next_index):
                    i = node
                    j = manager.IndexToNode(next_index)
                    # accumulate from the matrix
                    total_km += float(matrix.distances[i][j])
                    if matrix.durations:
                        total_sec += float(matrix.durations[i][j])

                index = next_index

            # add the end node
            end_node = manager.IndexToNode(index)
            path_nodes.append(end_node)


            # --- NEW: filter out depot-only / unused routes
            depot_node = starts[v_id]  # original node index of this vehicle's start
            only_depot = all(n == depot_node for n in path_nodes)
            if only_depot and total_km == 0 and (not matrix.durations or total_sec == 0):
                continue
            # ---

            # emissions (simple: per-vehicle factor * route km)
            emissions = total_km * _emissions_per_km(veh)

            routes.append(
                Route(
                    vehicle_id=str(veh.id),
                    waypoint_ids=[str(n) for n in path_nodes],
                    total_distance=total_km,
                    total_duration=int(total_sec) if total_sec else None,
                    emissions=emissions if emissions else None,
                    metadata=None,
                )
            )

        return Routes(status="success", message="Solution found", routes=routes)
