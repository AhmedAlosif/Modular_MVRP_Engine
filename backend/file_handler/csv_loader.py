
# services/file_loader/csv_loader.py
import csv
from models.waypoints import Waypoint

def load_csv_points(path: str) -> list[Waypoint]:
    wps: list[Waypoint] = []
    with open(path, newline="", encoding="utf-8") as f:
        rdr = csv.DictReader(f)
        for i, row in enumerate(rdr, start=1):
            wps.append(Waypoint(
                id=str(row.get("id", i)),
                lat=float(row["lat"]),
                lon=float(row["lon"]),
                demand=int(row.get("demand", 0) or 0),
                service_time=int(row.get("service_time", 0) or 0),
                time_window=(
                    [int(row["tw_start"]), int(row["tw_end"])]
                    if row.get("tw_start") and row.get("tw_end") else None
                ),
                depot=row.get("depot", "false").lower() == "true",
            ))
    return wps
