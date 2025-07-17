def estimate_emissions(solution):
    total_km = sum(route["distance_km"] for route in solution["routes"])
    co2_per_km = 0.35  # adjust per vehicle type
    return total_km * co2_per_km
