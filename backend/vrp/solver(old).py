from fastapi import FastAPI, Request
from pydantic import BaseModel
from geopy.distance import geodesic
from ortools.constraint_solver import pywrapcp
from ortools.constraint_solver import routing_enums_pb2

def solve_vrp(data):
    # Convert to OR-Tools format
    # Solve with constraints
    # Return list of routes
    return {
        "routes": [
            {"vehicle_id": "v1", "path": [
                "depot", "a", "b"], "distance_km": 12.3}
        ]
    }

solver = FastAPI()

def distance_matrix(locations):
    size = len(locations)
    matrix = []
    for i in range(size):
        row = []
        for j in range(size):
            dist = geodesic(locations[i], locations[j]).km
            row.append(int(dist * 1000))
        matrix.append(row)
    return matrix

def ortools_solver(distance_matrix, num_vehicles, depot_index=0):
    manager = pywrapcp.RoutingIndexManager(
        len(distance_matrix), num_vehicles, depot_index)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return distance_matrix[from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC

    solution = routing.SolveWithParameters(search_parameters)
    return routing, manager, solution

def get_routes(routing, manager, solution, num_vehicles):
    routes = []
    for vehicle_id in range(num_vehicles):
        index = routing.Start(vehicle_id)
        route = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            route.append(node)
            index = solution.Value(routing.NextVar(index))
        route.append(manager.IndexToNode(index))  # Add the final stop
        routes.append(route)
    return routes
