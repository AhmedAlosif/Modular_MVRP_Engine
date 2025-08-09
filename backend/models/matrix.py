from typing import List, Optional
from pydantic import BaseModel


class MatrixData(BaseModel):
    distances: List[List[float]]
    durations: Optional[List[List[float]]] = None
    emissions: Optional[List[List[float]]] = None  # for eco-VRP
    costs: Optional[List[List[float]]] = None      # for multi-objective VRP


class MatrixRequest(BaseModel):
    adapter: str
    origins: List[dict]  # {"lat": ..., "lon": ...}
    destinations: List[dict]
    mode: Optional[str] = "driving"
    metrics: Optional[List[str]] = ["distance", "duration"]


class MatrixResult(BaseModel):
    matrix: MatrixData
