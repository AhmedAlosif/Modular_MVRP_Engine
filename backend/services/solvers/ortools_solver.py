# services/solvers/ortools_solver.py
from __future__ import annotations
from typing import List, Optional, Dict, Any
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from core.interfaces import VRPSolver
from core.exceptions import SolverError
from models.distance_matrix import MatrixResult
from models.fleet import Vehicle
from models.solvers import Routes, Route, PickupDeliveryPair


class OrToolsSolver(VRPSolver):
    """
    CVRP / VRPTW / PDPTW using OR-Tools.
    - Arc cost: weighted distance + optional time
    - Capacities
    - Time windows (node & optional vehicle TWs)
    - Service times (added at the 'from' node)
    - Pickup & delivery (same-vehicle + precedence)
    - Optional "allow_drop": permits dropping customers with a penalty
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
        **kwargs: Any,
    ) -> Routes:

        # ----------------- Validate & normalize inputs -----------------
        if not matrix or not matrix.distances:
            raise SolverError("OR-Tools: 'matrix.distances' is required.")

        n = len(matrix.distances)
        if n == 0 or any(len(row) != n for row in matrix.distances):
            raise SolverError("OR-Tools: distance matrix must be non-empty and square.")

        if demands and len(demands) != n:
            raise SolverError("OR-Tools: 'demands' length must match matrix size.")

        if node_time_windows and len(node_time_windows) != n:
            raise SolverError("OR-Tools: 'node_time_windows' length must match matrix size.")

        if node_service_times and len(node_service_times) != n:
            raise SolverError("OR-Tools: 'node_service_times' length must match matrix size.")

        if not fleet:
            raise SolverError("OR-Tools: at least one vehicle is required.")

        # Defaults / options
        weights = weights or {}
        w_dist = float(weights.get("distance", 1.0))
        w_time = float(weights.get("time", 0.0))
        vehicle_fixed_cost = float(weights.get("vehicle_fixed_cost", 100.0))  # in "distance" units

        allow_drop = bool(kwargs.get("allow_drop", False))
        drop_penalty = kwargs.get("drop_penalty", None)  # int
        # robust, very large default – discourages dropping unless truly infeasible
        if allow_drop and (drop_penalty is None):
            # scale by a very large factor of max arc cost we can estimate
            max_d = max(max(r) for r in matrix.distances)
            max_t = max(max(r) for r in (matrix.durations or matrix.distances))
            est_arc = (w_dist * max_d) + (w_time * (max_t / 3600.0 if matrix.durations else max_t))
            drop_penalty = int(max(10**9, round(est_arc * 10**6)))

        time_limit = int(kwargs.get("time_limit", 60))
        first_solution = str(kwargs.get("first_solution", "PATH_CHEAPEST_ARC")).upper()
        metaheuristic = str(kwargs.get("metaheuristic", "GUIDED_LOCAL_SEARCH")).upper()
        log_search = bool(kwargs.get("log_search", False))

        # If no durations provided but TWs are present, we will use distances as "time units"
        durations = matrix.durations

        # ----------------- Build index manager & model -----------------
        starts = [v.start if v.start is not None else depot_index for v in fleet]
        ends = [v.end if v.end is not None else depot_index for v in fleet]

        manager = pywrapcp.RoutingIndexManager(n, len(fleet), starts, ends)
        routing = pywrapcp.RoutingModel(manager)

        # ----------------- Transit / cost callbacks -----------------
        COST_SCALE = 1000  # keep arc cost integer

        def cost_callback(from_index: int, to_index: int) -> int:
            i = manager.IndexToNode(from_index)
            j = manager.IndexToNode(to_index)
            d = float(matrix.distances[i][j])
            t_hr = 0.0
            if durations:
                t_hr = float(durations[i][j]) / 3600.0
            cost = (w_dist * d) + (w_time * t_hr)
            return int(round(cost * COST_SCALE))

        cost_index = routing.RegisterTransitCallback(cost_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(cost_index)

        # Encourage fewer vehicles (can be overridden via weights.vehicle_fixed_cost)
        routing.SetFixedCostOfAllVehicles(int(round(vehicle_fixed_cost * COST_SCALE)))

        # ----------------- Capacity dimension -----------------
        if demands:
            caps = [int(v.capacity[0]) if (v.capacity and len(v.capacity) > 0) else 10**9 for v in fleet]

            def demand_cb(from_index: int) -> int:
                i = manager.IndexToNode(from_index)
                return int(demands[i])

            demand_index = routing.RegisterUnaryTransitCallback(demand_cb)
            routing.AddDimensionWithVehicleCapacity(
                demand_index,
                0,       # no slack
                caps,
                True,    # start at 0
                "Capacity",
            )

        # ----------------- Time dimension -----------------
        time_dimension = None
        if durations or node_time_windows:
            service = node_service_times if node_service_times else [0] * n

            if durations:
                def time_cb(from_index: int, to_index: int) -> int:
                    i = manager.IndexToNode(from_index)
                    j = manager.IndexToNode(to_index)
                    travel = int(round(durations[i][j]))
                    return int(travel + (service[i] or 0))
            else:
                def time_cb(from_index: int, to_index: int) -> int:
                    i = manager.IndexToNode(from_index)
                    j = manager.IndexToNode(to_index)
                    travel = int(round(matrix.distances[i][j]))
                    return int(travel + (service[i] or 0))

            time_index = routing.RegisterTransitCallback(time_cb)

            # Choose a reasonable horizon from TWs if provided
            horizon = None
            if node_time_windows:
                highs = [int(tw[1]) for tw in node_time_windows if tw and len(tw) == 2]
                horizon = max(highs) if highs else None

            routing.AddDimension(
                time_index,
                10**9,                 # waiting slack allowed (big)
                int(horizon or 10**9), # max cumul
                True,                  # fix starts to zero
                "Time",
            )
            time_dimension = routing.GetDimensionOrDie("Time")

            # Apply node time windows
            if node_time_windows:
                for node, tw in enumerate(node_time_windows):
                    if not tw:
                        continue
                    start, end = int(tw[0]), int(tw[1])
                    time_dimension.CumulVar(manager.NodeToIndex(node)).SetRange(start, end)

            # Optional: if vehicles had their own TWs
            for v_id, v in enumerate(fleet):
                if getattr(v, "time_window", None):
                    vs, ve = int(v.time_window[0]), int(v.time_window[1])
                    time_dimension.CumulVar(routing.Start(v_id)).SetRange(vs, ve)
                    time_dimension.CumulVar(routing.End(v_id)).SetRange(vs, ve)

            # Finalizers help feasibility on large VRPTW
            for v_id in range(len(fleet)):
                routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.Start(v_id)))
                routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.End(v_id)))

        # ----------------- Pickup & Delivery -----------------
        if pickup_delivery_pairs:
            for pair in pickup_delivery_pairs:
                p_idx = manager.NodeToIndex(int(pair.pickup))
                d_idx = manager.NodeToIndex(int(pair.delivery))
                routing.AddPickupAndDelivery(p_idx, d_idx)
                # same vehicle
                routing.solver().Add(routing.VehicleVar(p_idx) == routing.VehicleVar(d_idx))
                # precedence via time
                if time_dimension is not None:
                    routing.solver().Add(
                        time_dimension.CumulVar(p_idx) <= time_dimension.CumulVar(d_idx)
                    )

        # ----------------- Allow drop (via disjunctions) -----------------
        if allow_drop:
            # treat "customers" as all nodes except the depot_index (common Solomon convention)
            for node in range(n):
                if node == depot_index:
                    continue
                routing.AddDisjunction([manager.NodeToIndex(node)], int(drop_penalty))

        # ----------------- Search parameters -----------------
        search = pywrapcp.DefaultRoutingSearchParameters()
        # First solution
        fs_map = {k: getattr(routing_enums_pb2.FirstSolutionStrategy, k) for k in dir(routing_enums_pb2.FirstSolutionStrategy) if not k.startswith("_")}
        search.first_solution_strategy = fs_map.get(first_solution, routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC)

        # Metaheuristic
        mh_map = {k: getattr(routing_enums_pb2.LocalSearchMetaheuristic, k) for k in dir(routing_enums_pb2.LocalSearchMetaheuristic) if not k.startswith("_")}
        search.local_search_metaheuristic = mh_map.get(metaheuristic, routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH)

        search.time_limit.FromSeconds(int(time_limit))
        if log_search:
            search.log_search = True

        # --- Solve ---
        solution = routing.SolveWithParameters(search)

        # Map OR-Tools status id -> name (fallback: if we got a solution, call it SUCCESS)
        status_id = routing.status() if hasattr(routing, "status") else None
        status_map = {
            0: "ROUTING_NOT_SOLVED",
            1: "ROUTING_SUCCESS",
            2: "ROUTING_FAIL",
            3: "ROUTING_FAIL_TIMEOUT",
            4: "ROUTING_INVALID",
        }
        status_name = status_map.get(status_id, "ROUTING_SUCCESS" if solution is not None else f"UNKNOWN_STATUS_{status_id}")

        if solution is None:
            # Keep the helpful diag you already build:
            raise SolverError(f"No feasible solution found. OR-Tools status={status_id} ({status_name}).")

        # ----------- Extract routes -----------
        routes: List[Route] = []
        served_customers = set()
        total_km_all, total_sec_all = 0.0, 0.0

        for v_id, veh in enumerate(fleet):
            index = routing.Start(v_id)
            path_nodes: List[int] = []
            total_km = 0.0
            total_sec = 0.0

            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                path_nodes.append(node)

                nxt = solution.Value(routing.NextVar(index))
                if not routing.IsEnd(nxt):
                    i = node
                    j = manager.IndexToNode(nxt)
                    total_km += float(matrix.distances[i][j]) if matrix.distances else 0.0
                    if matrix.durations:
                        total_sec += float(matrix.durations[i][j])
                index = nxt

            end_node = manager.IndexToNode(index)
            path_nodes.append(end_node)

            # Count served (exclude depot)
            for n in path_nodes:
                if n != (starts[v_id] if isinstance(starts, list) else depot_index):
                    served_customers.add(n)

            # Skip depot-only routes
            depot_node = starts[v_id] if isinstance(starts, list) else depot_index
            only_depot = all(n == depot_node for n in path_nodes)
            if only_depot and total_km == 0 and (not matrix.durations or total_sec == 0):
                continue

            total_km_all += total_km
            total_sec_all += total_sec

            routes.append(
                Route(
                    vehicle_id=str(veh.id),
                    waypoint_ids=[str(n) for n in path_nodes],
                    total_distance=total_km,
                    total_duration=int(round(total_sec)) if total_sec else None,
                    emissions=(total_km * float(getattr(veh, "emissions_per_km", 0.0) or 0.0)) or None,
                    metadata={"status": status_name},
                )
            )

        # Dropped = all non-depot nodes that never appear in any route
        all_nodes = set(range(len(matrix.distances or [])))
        maybe_customers = all_nodes - {depot_index}
        dropped = sorted(maybe_customers - served_customers)

        message = (
            f"status={status_name}; vehicles_used={len(routes)}/{len(fleet)}; "
            f"served={len(served_customers)}/{len(maybe_customers)}; dropped={len(dropped)}; "
            f"total_distance≈{total_km_all:.3f}; total_duration≈{int(round(total_sec_all))}"
        )

        return Routes(status="success", message=message, routes=routes)
