from typing import Literal, List, Dict, Optional
from pydantic import BaseModel

class Coordinate(BaseModel):
    lat: float
    lon: float

class MatrixRequest(BaseModel):
    adapter: str
    origins: list[Coordinate]
    destinations: list[Coordinate]
    mode: Literal["driving", "walking", "cycling"]
    parameters: Optional[Dict] = None 

class MatrixResult(BaseModel):
    distances: List[List[float]]
    durations: Optional[List[List[float]]] = None

    @classmethod
    def from_ors(cls, data: Dict) -> "MatrixResult":
        return cls(
            distances=data.get("distances", []),
            durations=data.get("durations", [])
        )

    @classmethod
    def from_google(cls, data: Dict) -> "MatrixResult":
        distances = []
        durations = []

        for row in data["rows"]:
            dist_row = []
            dur_row = []
            for element in row["elements"]:
                if element["status"] == "OK":
                    dist_row.append(element["distance"]["value"])  # meters
                    dur_row.append(element["duration"]["value"])   # seconds
                else:
                    dist_row.append(float("inf"))
                    dur_row.append(float("inf"))
            distances.append(dist_row)
            durations.append(dur_row)

        return cls(distances=distances, durations=durations)
