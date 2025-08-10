# services/file_loader/vrplib_loader.py
from typing import List, Tuple, Optional, Dict
import math
import re
from pathlib import Path

# --- Adjust these to your project layout ---
from models.waypoints import Waypoint
from models.fleet import Vehicle, Fleet
from models.matrix import DistanceMatrix


class VRPInstance:
    """Container returned by the loader."""
    def __init__(
        self,
        waypoints: List[Waypoint],
        fleet: Fleet,
        depot_index: int,
        matrix: Optional[DistanceMatrix] = None,
        meta: Optional[Dict] = None,
    ):
        self.waypoints = waypoints
        self.fleet = fleet
        self.depot_index = depot_index
        self.matrix = matrix
        self.meta = meta or {}


# -----------------------------
# Helpers
# -----------------------------

def _euclidean(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    dx = p1[0] - p2[0]
    dy = p1[1] - p2[1]
    return math.hypot(dx, dy)

def _build_distance_matrix_xy(coords: List[Tuple[float, float]]) -> List[List[float]]:
    n = len(coords)
    m = [[0.0] * n for _ in range(n)]
    for i in range(n):
        xi = coords[i]
        for j in range(i + 1, n):
            d = _euclidean(xi, coords[j])
            m[i][j] = d
            m[j][i] = d
    return m

def _is_solomon(contents: str) -> bool:
    # Solomon instances usually have TIME WINDOWS and SERVICE TIMES sections
    return "TIME_WINDOW_SECTION" in contents or "TIME WINDOWS" in contents

def _tokenize_lines(text: str) -> List[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]

def _read_sections(lines: List[str]) -> Dict[str, List[str]]:
    """Crude section splitter by well-known VRPLIB tags."""
    sections: Dict[str, List[str]] = {}
    current = None
    for ln in lines:
        upper = ln.upper()
        if upper.endswith("_SECTION") or upper in ("NODE_COORD_SECTION", "DEMAND_SECTION", "DEPOT_SECTION"):
            current = upper
            sections[current] = []
        elif upper.startswith("SERVICE_TIME"):
            current = "SERVICE_TIME_SECTION"
            sections[current] = []
        elif upper.startswith("TIME_WINDOW"):
            current = "TIME_WINDOW_SECTION"
            sections[current] = []
        elif upper.startswith("EOF"):
            break
        elif current:
            sections[current].append(ln)
    return sections

def _parse_vehicle_header(lines: List[str]) -> Tuple[int, int]:
    """
    Look for vehicle number & capacity in typical headers like:
      VEHICLE
      NUMBER     CAPACITY
      25         200
    or VRPLIB header like:
      CAPACITY : 200
    """
    num = None
    cap = None
    txt = "\n".join(lines).upper()

    # Solomon style
    m = re.search(r"\bVEHICLE\b.*?NUMBER\s+CAPACITY\s+(\d+)\s+(\d+)", txt, re.S)
    if m:
        num = int(m.group(1))
        cap = int(m.group(2))

    # CVRPLIB style
    if cap is None:
        m2 = re.search(r"CAPACITY\s*:\s*(\d+)", txt)
        if m2:
            cap = int(m2.group(1))
        m3 = re.search(r"VEHICLES?\s*:\s*(\d+)", txt)
        if m3:
            num = int(m3.group(1))

    # Fallback
    if num is None:
        num = 1
    if cap is None:
        cap = 999999
    return num, cap

def _parse_node_coord_section(lines: List[str]) -> List[Tuple[int, float, float]]:
    """Return list of (idx, x, y). Indexes are 1-based in files typically."""
    nodes: List[Tuple[int, float, float]] = []
    for ln in lines:
        # formats like: 1  10  20  OR  1 10.0 20.0
        parts = ln.split()
        if len(parts) >= 3 and parts[0].isdigit():
            i = int(parts[0])
            x = float(parts[1])
            y = float(parts[2])
            nodes.append((i, x, y))
    return nodes

def _parse_demand_section(lines: List[str]) -> Dict[int, int]:
    demands: Dict[int, int] = {}
    for ln in lines:
        parts = ln.split()
        if len(parts) >= 2 and parts[0].isdigit():
            idx = int(parts[0])
            dem = int(float(parts[1]))
            demands[idx] = dem
    return demands

def _parse_time_window_section(lines: List[str]) -> Dict[int, Tuple[int, int]]:
    tw: Dict[int, Tuple[int, int]] = {}
    for ln in lines:
        parts = ln.split()
        if len(parts) >= 3 and parts[0].isdigit():
            idx = int(parts[0])
            start = int(float(parts[1]))
            end = int(float(parts[2]))
            tw[idx] = (start, end)
    return tw

def _parse_service_time_section(lines: List[str]) -> Dict[int, int]:
    st: Dict[int, int] = {}
    for ln in lines:
        parts = ln.split()
        if len(parts) >= 2 and parts[0].isdigit():
            idx = int(parts[0])
            sv = int(float(parts[1]))
            st[idx] = sv
    return st

def _parse_depot_section(lines: List[str]) -> List[int]:
    depots: List[int] = []
    for ln in lines:
        ln = ln.strip()
        if ln == "-1":
            break
        if ln and ln.lstrip("+-").isdigit():
            depots.append(int(ln))
    return depots


# -----------------------------
# Main loaders
# -----------------------------

def load_vrplib(file_path: str | Path, compute_matrix: bool = True) -> VRPInstance:
    """
    Auto-detect Solomon vs CVRPLIB and parse into internal models.
    Assumes single depot or picks the first depot if multiple.
    Coordinates are treated as planar (Euclidean).
    """
    p = Path(file_path)
    contents = p.read_text(encoding="utf-8", errors="ignore")
    lines = _tokenize_lines(contents)
    sections = _read_sections(lines)

    # Vehicle header
    vehicles_num, capacity = _parse_vehicle_header(lines)

    # Coordinates
    coord_lines = sections.get("NODE_COORD_SECTION", [])
    nodes = _parse_node_coord_section(coord_lines)
    if not nodes:
        raise ValueError("NODE_COORD_SECTION not found or empty.")

    # Demands
    dem_lines = sections.get("DEMAND_SECTION", [])
    demands = _parse_demand_section(dem_lines)

    # Time windows & service times (Solomon)
    tw_lines = sections.get("TIME_WINDOW_SECTION", [])
    st_lines = sections.get("SERVICE_TIME_SECTION", [])
    time_windows = _parse_time_window_section(tw_lines) if tw_lines else {}
    service_times = _parse_service_time_section(st_lines) if st_lines else {}

    # Depots
    depot_lines = sections.get("DEPOT_SECTION", [])
    depots = _parse_depot_section(depot_lines)
    depot_idx_1based = depots[0] if depots else 1  # default to node 1
    # Convert to 0-based index in our internal arrays
    depot_index = depot_idx_1based - 1

    # Build waypoints (convert planar x,y to lat/lon-like fields; your Waypoint likely expects lat/lon)
    # We'll place x->lat, y->lon to reuse the fields; these are *planar*, not geographic.
    waypoints: List[Waypoint] = []
    # nodes are list of (id_1based, x, y)
    # Ensure sorting by index to align with matrix indices
    nodes_sorted = sorted(nodes, key=lambda t: t[0])
    for idx1, x, y in nodes_sorted:
        demand = demands.get(idx1, 0)
        tw = time_windows.get(idx1, None)
        service = service_times.get(idx1, 0)
        wp = Waypoint(
            id=str(idx1),
            lat=x,
            lon=y,
            demand=demand,
            service_time=service,
            time_window=list(tw) if tw else None,
            depot=(idx1 - 1) == depot_index,
        )
        waypoints.append(wp)

    # Fleet
    vehicles: List[Vehicle] = []
    for v_idx in range(vehicles_num):
        vehicles.append(
            Vehicle(
                id=f"veh-{v_idx+1}",
                start_index=depot_index,
                end_index=depot_index,
                capacity=[capacity],  # single-dimension capacity by default
                skills=[],
                time_window=None,
                max_distance=None,
                max_duration=None,
                speed=None,
                emissions_per_km=None,
            )
        )
    fleet = Fleet(vehicles=vehicles)

    # Optional distance matrix (Euclidean on planar coords)
    matrix: Optional[DistanceMatrix] = None
    if compute_matrix:
        coords_xy = [(wp.lat, wp.lon) for wp in waypoints]  # remember: planar
        distances = _build_distance_matrix_xy(coords_xy)
        # durations: crude assumption — 1 unit distance == 1 unit time
        durations = [[distances[i][j] for j in range(len(distances))] for i in range(len(distances))]
        matrix = DistanceMatrix(distances=distances, durations=durations)

    meta = {
        "source": str(p),
        "type": "solomon" if _is_solomon(contents) else "cvrplib",
        "vehicles": vehicles_num,
        "capacity": capacity,
        "depot_index": depot_index,
    }

    return VRPInstance(
        waypoints=waypoints,
        fleet=fleet,
        depot_index=depot_index,
        matrix=matrix,
        meta=meta,
    )
