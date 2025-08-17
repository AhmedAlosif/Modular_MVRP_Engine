# core/capabilities.py
from __future__ import annotations
from typing import Dict, List, Any

# Static capability catalog (machine-readable but still simple)
# Keep keys lowercase to match registry list() calls.
_SOLVER_CAPS: Dict[str, Dict[str, Any]] = {
    "ortools": {
        "vrp_types": {
            "TSP":   { "required": ["matrix.distances","fleet>=1","depot_index"],
                       "optional": ["matrix.durations","weights"] },
            "CVRP":  { "required": ["matrix.distances","fleet>=1","demands","depot_index"],
                       "optional": ["matrix.durations","node_service_times","weights"] },
            "VRPTW": { "required": ["matrix.durations","node_time_windows","fleet>=1","depot_index"],
                       "optional": ["matrix.distances","node_service_times","weights"] },
            "PDPTW": { "required": ["matrix.durations","node_time_windows","pickup_delivery_pairs",
                                     "demands","fleet>=1","depot_index"],
                       "optional": ["matrix.distances","node_service_times","weights"] },
        }
    },
    "pyomo": {
        "vrp_types": {
            "TSP":   { "required": ["matrix.distances","fleet>=1","depot_index"], "optional": [] },
            "CVRP":  { "required": ["matrix.distances","fleet>=1","demands","depot_index"], "optional": [] },
            "VRPTW": { "required": ["matrix.durations","node_time_windows","fleet>=1","depot_index"], "optional": [] },
        }
    },
    "vroom": {
        "vrp_types": {
            # Our wrapper supports 1 vehicle in index/coordinate mode
            "TSP": { "required": ["waypoints|matrix","fleet==1","depot_index"],
                     "optional": ["weights"] }
        }
    },
}

_ADAPTER_CAPS: Dict[str, Dict[str, Any]] = {
    "haversine":      { "provides": ["matrix.distances"] },
    "osm_graph":      { "provides": ["matrix.distances","matrix.durations"] },
    "openrouteservice": { "provides": ["matrix.distances","matrix.durations"] },
    "google":         { "provides": ["matrix.distances","matrix.durations"] },
    "google_routes":  { "provides": ["matrix.distances","matrix.durations"] },
}

def filter_registered(
    registered_solvers: List[str],
    registered_adapters: List[str],
) -> Dict[str, Any]:
    solvers = []
    for name in sorted(set(registered_solvers)):
        caps = _SOLVER_CAPS.get(name)
        if caps:
            solvers.append({"name": name, **caps})

    adapters = []
    for name in sorted(set(registered_adapters)):
        caps = _ADAPTER_CAPS.get(name)
        if caps:
            adapters.append({"name": name, **caps})

    return {"solvers": solvers, "adapters": adapters}
