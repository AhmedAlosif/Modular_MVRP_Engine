from pydantic import BaseModel
from typing import List, Tuple

class Location(BaseModel):
    id: str
    coordinates: Tuple[float, float]
    time_window: Tuple[int, int]
    demand: int = 0

class Vehicle(BaseModel):
    id: str
    capacity: int
    type: str
    cost_per_km: float 
    fixed_cost: float   

class VRPRequest(BaseModel):
    depot: Location
    start_depots: List[int]
    end_depots: List[int]
    vehicles: List[Vehicle]
    stops: List[Location]
    api_key: str

class Route(BaseModel):
    vehicle_id: str
    path: List[str]
    distance_km: float

class VRPResponse(BaseModel):
    routes: List[Route]
    co2: float