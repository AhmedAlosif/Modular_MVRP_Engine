from typing import Literal, List, Dict, Optional
from pydantic import BaseModel

class Coordinate(BaseModel):
    lat: float
    lon: float

class MatrixRequest(BaseModel):
    # Used by /distance-matrix endpoint (adapters)
    adapter: str
    origins: List[Coordinate]
    destinations: List[Coordinate]
    mode: Literal["driving", "walking", "cycling"]
    parameters: Optional[Dict] = None

class MatrixResult(BaseModel):
    # Used by /solver/solve endpoint (solvers)
    # Distances in **kilometers**, durations in **seconds**
    distances: List[List[float]]
    durations: Optional[List[List[float]]] = None
    emissions: Optional[List[List[float]]] = None
    costs: Optional[List[List[float]]] = None
    # Optional coordinates aligned with matrix indices: [[lon, lat], ...]
    coordinates: Optional[List[List[float]]] = None

    @classmethod
    def from_ors(cls, data: Dict) -> "MatrixResult":
        # ORS returns distances in meters by default; convert to km
        raw_d = data.get("distances")
        raw_t = data.get("durations")
        distances_km = (
            [[(v or 0) / 1000.0 for v in row] for row in raw_d] if raw_d is not None else []
        )
        return cls(
            distances=distances_km,
            durations=raw_t if raw_t is not None else None,
        )

    @classmethod
    def from_google(cls, data: Dict) -> "MatrixResult":
        # Google Distance Matrix returns meters/seconds; convert meters -> km
        distances_km: List[List[float]] = []
        durations_s: List[List[float]] = []
        for row in data.get("rows", []):
            drow: List[float] = []
            trow: List[float] = []
            for element in row.get("elements", []):
                if element.get("status") == "OK":
                    drow.append(float(element["distance"]["value"]) / 1000.0)  # km
                    trow.append(float(element["duration"]["value"]))           # s
                else:
                    drow.append(float("inf"))
                    trow.append(float("inf"))
            distances_km.append(drow)
            durations_s.append(trow)
        return cls(distances=distances_km, durations=durations_s)
