# file_handler/vrplib_lib_wrapper.py
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import math

try:
    import vrplib as _vrplib
    VRPLIB_AVAILABLE = True
except Exception:
    VRPLIB_AVAILABLE = False


def _euclid_mtx(coords: List[tuple[float, float]]) -> List[List[float]]:
    n = len(coords)
    mtx = [[0.0]*n for _ in range(n)]
    for i in range(n):
        xi, yi = coords[i]
        for j in range(i+1, n):
            xj, yj = coords[j]
            d = math.hypot(xi - xj, yi - yj)
            mtx[i][j] = d
            mtx[j][i] = d
    return mtx


def load_with_vrplib(path: str | Path, compute_matrix: bool = True) -> Dict[str, Any]:
    if not VRPLIB_AVAILABLE:
        raise RuntimeError("vrplib not installed")

    inst = _vrplib.read_instance(str(path))

    # Coordinates OR explicit matrix
    coords = inst.get("coordinates") or inst.get("node_coords")
    edge_mtx = inst.get("edge_weight")

    if coords is None and edge_mtx is None:
        raise ValueError("vrplib: instance has neither coordinates nor edge_weight matrix")

    # Basic counts
    n = len(coords) if coords is not None else len(edge_mtx)
    if n is None or n <= 0:
        raise ValueError("vrplib: could not derive node count")

    # Depot (1-based or list)
    depot = inst.get("depot", 1)
    if isinstance(depot, (list, tuple)):
        depot_index = int(depot[0]) - 1
    else:
        depot_index = int(depot) - 1
    depot_index = max(0, min(depot_index, n-1))

    # Demands / TW / service
    demands = inst.get("demands") or [0]*n
    if len(demands) < n:
        demands = list(demands) + [0]*(n - len(demands))
    demands = [int(x or 0) for x in demands[:n]]

    # normalize arrays to lists of length n
    def _as_list(v, fill=0):
        if v is None:
            return [fill]*n
        vv = list(v)
        if len(vv) < n:
            vv = vv + [fill]*(n - len(vv))
        return vv[:n]

    ready = _as_list(inst.get("ready_time"), 0)
    due   = _as_list(inst.get("due_time"),   10**9)
    service = _as_list(inst.get("service_time"), 0)

    # fix inverted windows and give depot a broad window
    for i in range(n):
        if due[i] < ready[i]:
            ready[i], due[i] = due[i], ready[i]

    # depot window: ensure it's not tighter than customers
    max_due = max(due) if due else 10**9
    ready[depot_index] = min(ready[depot_index], 0)
    due[depot_index]   = max(due[depot_index], max_due)

    # Build waypoints (planar convention lat=x, lon=y to match the rest of your stack)
    waypoints: List[Dict[str, Any]] = []
    if coords is not None:
        for i, (x, y) in enumerate(coords, start=1):
            waypoints.append({
                "id": str(i),
                "lat": float(x),
                "lon": float(y),
                "demand": int(demands[i-1] if i-1 < len(demands) else 0),
                "service_time": int(service[i-1]),
                "time_window": [int(ready[i-1]), int(due[i-1])],
                "depot": (i-1) == depot_index,
            })
    else:
        for i in range(n):
            waypoints.append({
                "id": str(i+1),
                "lat": float(i),
                "lon": 0.0,
                "demand": int(demands[i]),
                "service_time": int(service[i]),
                "time_window": [int(ready[i]), int(due[i])],
                "depot": i == depot_index,
            })

    # Fleet size: try multiple possible keys (Solomon exposes vehicle count)
    veh_count = (
        inst.get("vehicles")
        or inst.get("num_vehicles")
        or inst.get("vehicle_number")
        or inst.get("nb_vehicles")
        or inst.get("vehicle_num")
        or inst.get("number_vehicles")
        or inst.get("number")
        or inst.get("vehicle")
        or 1
    )
    try:
        veh_count = int(veh_count)
    except Exception:
        veh_count = 1

    # Solomon heuristic: if the file looks like Solomon and we still have 1 vehicle, bump to 25
    pstr = str(path).lower()
    if veh_count <= 1 and pstr.endswith(".txt") and ("solomon" in pstr or "/solomon/" in pstr):
        veh_count = 25
    
    # Fleet (simple identical vehicles; capacity if present)
    cap = int(inst.get("capacity", 10**9))

    # --- NEW: demand-based fallback if vehicle count is missing/too small
    total_demand = sum(int(max(0, d)) for d in demands)
    if cap > 0:
        needed = max(1, math.ceil(total_demand / cap))
        # Don’t exceed number of nodes; keep at least veh_count if file specified it
        veh_count = max(veh_count, min(needed, n))
    else:
        # No capacity info; keep at least one vehicle
        veh_count = max(veh_count, 1)

    vehicles = [
        {
            "id": f"veh-{i+1}",
            "start": depot_index,
            "end": depot_index,
            "capacity": [cap],
            "skills": [],
            "time_window": None,
            "max_distance": None,
            "max_duration": None,
            "speed": None,
            "emissions_per_km": None,
        }
        for i in range(veh_count)
    ]
    # Matrix
    distances: Optional[List[List[float]]] = None
    if edge_mtx is not None:
        # vrplib may give numpy arrays; convert to lists
        distances = [[float(x) for x in row] for row in edge_mtx]
    elif compute_matrix and coords is not None:
        distances = _euclid_mtx([(float(x), float(y)) for (x, y) in coords])

    matrix = None
    if distances is not None:
        matrix = {
            "distances": distances,
            "durations": [[d for d in row] for row in distances],
        }

    return {
        "waypoints": waypoints,
        "fleet": {"vehicles": vehicles},
        "depot_index": depot_index,
        "matrix": matrix,
        "meta": {
            "source": str(path),
            "format": "vrplib",
            "capacity": cap,
        },
    }
