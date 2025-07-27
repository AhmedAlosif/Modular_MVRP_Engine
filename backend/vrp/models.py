from pydantic import BaseModel
from typing import List, Tuple

class Location(BaseModel):
    id: str
    coordinates: Tuple[float, float]
    demand: int = 0

class Vehicle(BaseModel):
    id: str
    capacity: int
    type: str

class VRPRequest(BaseModel):
    depot: Location
    vehicles: List[Vehicle]
    stops: List[Location]

class Route(BaseModel):
    vehicle_id: str
    path: List[str]
    distance_km: float

class VRPResponse(BaseModel):
    routes: List[Route]
    co2: float