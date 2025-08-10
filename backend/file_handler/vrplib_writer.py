from pathlib import Path
from models.waypoints import Waypoint
from models.fleet import Fleet

def write_vrplib(path: str | Path, waypoints: list[Waypoint], fleet: Fleet, name: str = "INSTANCE") -> None:
    """
    Emit a simple CVRPLIB-like .vrp (nodes, demands, depot, capacity).
    Extend for Solomon sections if you need TW/service times.
    """
    p = Path(path)
    lines = []
    lines += [f"NAME : {name}", "TYPE : CVRP", "DIMENSION : {}".format(len(waypoints)), f"CAPACITY : {fleet.vehicles[0].capacity[0]}"]
    lines += ["NODE_COORD_SECTION"]
    for i, wp in enumerate(waypoints, start=1):
        lines.append(f"{i} {wp.lat:.6f} {wp.lon:.6f}")
    lines += ["DEMAND_SECTION"]
    for i, wp in enumerate(waypoints, start=1):
        lines.append(f"{i} {wp.demand or 0}")
    lines += ["DEPOT_SECTION", "1", "-1", "EOF"]
    p.write_text("\n".join(lines), encoding="utf-8")
