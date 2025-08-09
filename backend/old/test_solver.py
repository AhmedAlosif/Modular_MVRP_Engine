from vrp.solver import solve_vrp

coordinates = [
    (49.41461, 8.681495),
    (49.420318, 8.687872),
    (49.409465, 8.692803)
]
demands = [0, 1, 1]
vehicle_capacities = [2]
depot_index = 0
api_key = ""

result = solve_vrp(coordinates, demands, vehicle_capacities, depot_index, api_key)
print(result)