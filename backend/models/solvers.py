from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from models.distance_matrix import MatrixResult
from models.fleet import Vehicle

class SolveRequest(BaseModel):
    matrix: MatrixResult
    fleet: List[Vehicle]
    depot_index: Optional[int] = 0
    solver: str = "ortools"

class SolveResult(BaseModel):
    routes: List[List[int]]

class Route(BaseModel):
    vehicle_id: str
    waypoint_ids: List[str]
    total_distance: Optional[float] = None
    total_duration: Optional[float] = None
    emissions: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class Routes(BaseModel):
    status: str = "success"
    message: str = "Solution found"
    routes: List[Route]