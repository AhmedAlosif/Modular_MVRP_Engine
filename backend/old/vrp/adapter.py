import os
from vrp.config import API_KEY
from geo.distance_matrix import create_distance_matrix
from vrp.core_solver import ortools_solver, get_routes
from dotenv import load_dotenv
from vrp.models import VRPRequest

load_dotenv()
API_key = os.getenv("API_KEY")

def adapter(data: VRPRequest):
    # Convert to OR-Tools format
    locations =  [data.depot] + data.stops
    demands = [data.depot.demand] + [stop.demand for stop in data.stops]
    capacities = [v.capacity for v in data.vehicles]
    num_vehicles = len(data.vehicles)
    depot_start_index = data.start_depots
    depot_end_index = data.end_depots
    
    
    if len(data.start_depots) != num_vehicles or len(data.end_depots) != num_vehicles:
        raise ValueError("Length of start_depots and end_depots must equal number of vehicles.")

    # Solve with constraints
    data_model = {
    "distance_matrix": create_distance_matrix(locations, API_key),
    "demands": demands,
    "vehicle_capacities": capacities,
    "num_vehicles": num_vehicles,
    "start_depots": data.start_depots,
    "end_depots": data.end_depots,
    "vehicle_time_limits": [40] * num_vehicles
}
    print("✅ Sending this to ortools_solver:")
    print(data_model.keys())  # or json.dumps(data_model, indent=2) if serializable
    
    routing, manager, solution = ortools_solver(data_model)
    
    # Return list of routes
    routes = get_routes(routing, manager, solution, num_vehicles)
    return {"routes": routes}
