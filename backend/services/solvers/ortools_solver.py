from typing import List
from ortools.constraint_solver import routing_enums_pb2, pywrapcp
from models.waypoints import Waypoint
from models.fleet import Vehicle
from models.matrix import MatrixResult
from models.solvers import SolveResult, Route
from core.interfaces import SolverInterface


class OrToolsSolver(SolverInterface):
    def solve(self, waypoints: List[Waypoint], fleet: Vehicle, matrix: MatrixResult) -> SolveResult:
        num_locations = len(waypoints)
        num_vehicles = len(fleet.id)
        depot_index = next((i for i, wp in enumerate(waypoints) if wp.type == "depot"), 0)

        manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, depot_index)
        routing = pywrapcp.RoutingModel(manager)

        # Distance callback
        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(matrix["distances"][from_node][to_node] * 1000)

        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

        # Time constraint
        if "durations" in matrix:
            def time_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                return int(matrix["distances"][from_node][to_node])

            time_callback_index = routing.RegisterTransitCallback(time_callback)

            routing.AddDimension(
                time_callback_index,
                30,  # allow waiting time
                24 * 3600,  # max time per vehicle
                False,
                "Time"
            )
            time_dimension = routing.GetDimensionOrDie("Time")

            for idx, wp in enumerate(waypoints):
                if wp.time_window:
                    index = manager.NodeToIndex(idx)
                    start, end = wp.time_window
                    time_dimension.CumulVar(index).SetRange(start, end)

        # Pickup and delivery
        for i, wp in enumerate(waypoints):
            if wp.pickup_delivery_id:
                paired_index = next((j for j, other in enumerate(waypoints)
                                     if other.pickup_delivery_id == wp.pickup_delivery_id and j != i), None)
                if paired_index is not None:
                    pickup_index = manager.NodeToIndex(min(i, paired_index))
                    delivery_index = manager.NodeToIndex(max(i, paired_index))
                    routing.AddPickupAndDelivery(pickup_index, delivery_index)
                    routing.solver().Add(
                        routing.VehicleVar(pickup_index) == routing.VehicleVar(delivery_index)
                    )
                    routing.solver().Add(
                        time_dimension.CumulVar(pickup_index) <= time_dimension.CumulVar(delivery_index)
                    )

        # Capacity (if used)
        if any(wp.demand for wp in waypoints):
            demands = [wp.demand or 0 for wp in waypoints]

            def demand_callback(from_index):
                from_node = manager.IndexToNode(from_index)
                return demands[from_node]

            demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)

            routing.AddDimensionWithVehicleCapacity(
                demand_callback_index,
                0,  # null capacity slack
                [v.capacity or 0 for v in fleet.vehicles],
                True,
                "Capacity"
            )

        # Emission cost (as penalty to distance)
        if any(wp.emissions for wp in waypoints):
            emissions = [wp.emissions or 0 for wp in waypoints]

            def emission_cost_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                return int((matrix["distances"][from_node][to_node] * 1000) +
                           (emissions[from_node] + emissions[to_node]) / 2)

            emission_index = routing.RegisterTransitCallback(emission_cost_callback)
            routing.SetArcCostEvaluatorOfAllVehicles(emission_index)

        # Search parameters
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = 10

        # Solve
        solution = routing.SolveWithParameters(search_parameters)
        if not solution:
            raise RuntimeError("OR-Tools solver failed to find a solution.")

        # Parse solution
        routes = []
        for vehicle_id in range(num_vehicles):
            index = routing.Start(vehicle_id)
            stops = []
            while not routing.IsEnd(index):
                node_index = manager.IndexToNode(index)
                stops.append(waypoints[node_index])
                index = solution.Value(routing.NextVar(index))
            node_index = manager.IndexToNode(index)
            stops.append(waypoints[node_index])

            if len(stops) > 1:
                routes.append(Route(
                    vehicle_id=vehicle_id,
                    waypoints=stops
                ))

        return SolveResult(status="success", routes=routes)