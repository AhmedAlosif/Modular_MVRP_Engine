# file_handler/solomon_loader.py
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import math
import re

def _euclid_mtx(coords: List[Tuple[float, float]]) -> List[List[float]]:
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

def _find_vehicle_block(lines: List[str]) -> Tuple[int, int]:
    """Return (vehicles, capacity) or (1, 10**9) if not found."""
    veh, cap = 1, 10**9
    for i, ln in enumerate(lines[:30]):
        if re.search(r"\bVEHICLE\b", ln, re.I):
            # look ahead a few lines for two integers (NUMBER CAPACITY)
            for j in range(i, min(i+6, len(lines))):
                nums = re.findall(r"-?\d+", lines[j])
                if len(nums) >= 2:
                    try:
                        veh, cap = int(nums[0]), int(nums[1])
                        return veh, cap
                    except Exception:
                        pass
            break
    return veh, cap

def _find_data_start(lines: List[str]) -> Optional[int]:
    """
    Locate the first data row line (after headers like 'CUSTOMER' and 'CUST NO. ...').
    Returns the index of the first possible data line.
    """
    for i, ln in enumerate(lines):
        u = ln.upper()
        # common two-line header: 'CUSTOMER' then columns
        if u.startswith("CUSTOMER"):
            # next non-empty line should be the column header
            k = i + 1
            while k < len(lines) and not lines[k].strip():
                k += 1
            if k < len(lines) and re.search(r"CUST\s*NO\.", lines[k], re.I):
                # data begins after the header line
                return k + 1
        # single header line that already contains columns
        if re.search(r"CUST\s*NO\.", ln, re.I) and re.search(r"XCOORD", ln, re.I):
            return i + 1
    return None

def load_solomon_txt(path: str | Path, compute_matrix: bool = True) -> Dict[str, Any]:
    p = Path(path)
    text = p.read_text(encoding="utf-8", errors="ignore")
    lines_raw = text.splitlines()
    # normalize spacing (keep original for error msg if needed)
    lines = [ln.rstrip("\r\n") for ln in lines_raw]

    vehicles, capacity = _find_vehicle_block(lines)
    start = _find_data_start(lines)

    rows: List[Dict[str, Any]] = []
    if start is not None:
        for ln in lines[start:]:
            if not ln.strip():
                continue
            # Extract numbers robustly (floats allowed)
            nums = re.findall(r"-?\d+(?:\.\d+)?", ln)
            # Expect at least: id, x, y, demand, ready, due, service  => 7 numeric tokens
            if len(nums) < 7:
                continue
            cid, x, y, dem, ready, due, service = nums[:7]
            try:
                rows.append({
                    "id": int(float(cid)),
                    "x": float(x),
                    "y": float(y),
                    "demand": int(float(dem)),
                    "ready": int(float(ready)),
                    "due": int(float(due)),
                    "service": int(float(service)),
                })
            except Exception:
                # skip malformed lines
                continue

    if not rows:
        # Give a concise diagnostic to help future debugging
        head = [ln.strip() for ln in lines[:8]]
        raise ValueError(
            f"Solomon parser: no rows parsed from {p}. "
            f"Header? -> {head}"
        )

    # Build arrays indexed by customer id (assumes depot id 0 present; if not, we’ll still work)
    max_id = max(r["id"] for r in rows)
    n = max_id + 1
    coords = [(0.0, 0.0)] * n
    demands = [0] * n
    ready = [0] * n
    due = [10**9] * n
    service = [0] * n

    for r in rows:
        i = r["id"]
        if 0 <= i < n:
            coords[i] = (r["x"], r["y"])
            demands[i] = r["demand"]
            ready[i] = r["ready"]
            due[i] = max(ready[i], r["due"])  # ensure not inverted
            service[i] = r["service"]

    depot_index = 0 if any(r["id"] == 0 for r in rows) else (min(r["id"] for r in rows) if rows else 0)
    # Make depot window broad
    max_due = max(due) if due else 10**9
    if 0 <= depot_index < n:
        ready[depot_index] = min(ready[depot_index], 0)
        due[depot_index] = max(due[depot_index], max_due)

    # Build waypoints (planar: lat=x, lon=y)
    waypoints: List[Dict[str, Any]] = []
    for i, (x, y) in enumerate(coords):
        waypoints.append({
            "id": str(i),
            "lat": float(x),
            "lon": float(y),
            "demand": int(demands[i]),
            "service_time": int(service[i]),
            "time_window": [int(ready[i]), int(due[i])],
            "depot": (i == depot_index),
        })

    # Fleet: identical vehicles with parsed capacity
    vehicles_list = [{
        "id": f"veh-{k+1}",
        "start": depot_index,
        "end": depot_index,
        "capacity": [int(capacity)],
        "skills": [],
        "time_window": None,
        "max_distance": None,
        "max_duration": None,
        "speed": None,
        "emissions_per_km": None,
    } for k in range(max(1, int(vehicles)))]

    # Matrix
    matrix = None
    if compute_matrix and n > 0:
        distances = _euclid_mtx([(float(x), float(y)) for (x, y) in coords])
        matrix = {"distances": distances, "durations": [[d for d in row] for row in distances]}

    return {
        "waypoints": waypoints,
        "fleet": {"vehicles": vehicles_list},
        "depot_index": depot_index,
        "matrix": matrix,
        "meta": {
            "source": str(p),
            "format": "solomon_txt",
            "capacity": int(capacity),
            "vehicles": int(vehicles),
        },
    }
