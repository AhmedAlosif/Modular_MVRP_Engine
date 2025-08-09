from ortools.constraint_solver import pywrapcp, routing_enums_pb2
from typing import List, Tuple
from geo.distance_matrix import ORSDistanceMatrixAdapter


def solve_vrp(
    coordinates: List[Tuple[float, float]],
    demands: List[int],
    vehicle_capacities: List[int],
    depot_index: int,
    ors_api_key: str
):
    # Get matrix from ORS
    adapter = ORSDistanceMatrixAdapter(api_key=ors_api_key)
    matrix_data = adapter.compute_matrix(coordinates)
    cost_matrix = matrix_data["durations"]  # You can use 'distances' instead

    # Setup OR-Tools VRP
    num_locations = len(coordinates)
    num_vehicles = len(vehicle_capacities)

    manager = pywrapcp.RoutingIndexManager(num_locations, num_vehicles, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(cost_matrix[from_node][to_node])  # ORS gives seconds

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Add capacity constraint
    def demand_callback(from_index):
        return demands[manager.IndexToNode(from_index)]

    demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,  # null capacity slack
        vehicle_capacities,
        True,
        "Capacity"
    )

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )

    solution = routing.SolveWithParameters(search_parameters)
    if not solution:
        return {"routes": [], "status": "No solution found"}

    # Format result
    routes = []
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        route = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route.append(node)
            index = solution.Value(routing.NextVar(index))
        route.append(manager.IndexToNode(index))  # end
        routes.append(route)

    return {"routes": routes, "status": "OK"}
