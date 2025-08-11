# models/solvers.py
from __future__ import annotations
from typing import List, Optional, Union
from pydantic import BaseModel
from models.distance_matrix import MatrixRequest, MatrixResult
from models.fleet import Vehicle, Fleet

MatrixInput = Union[MatrixResult, MatrixRequest]

class Route(BaseModel):
    vehicle_id: str
    waypoint_ids: List[str]
    total_distance: Optional[float] = None  # km
    total_duration: Optional[int] = None    # s
    emissions: Optional[float] = None       # kg CO2e
    metadata: Optional[dict] = None

class Routes(BaseModel):
    status: str = "success"
    message: Optional[str] = None
    routes: List[Route] = []

class SolveRequest(BaseModel):
    solver: str
    matrix: MatrixInput
    # Accept either a Fleet object or a plain list of Vehicle
    fleet: Union[List[Vehicle], Fleet]
    depot_index: int = 0

    # Optional per-node info aligned with matrix nodes (0..n-1)
    demands: Optional[List[int]] = None                     # demand at each node (0 for depot)
    node_time_windows: Optional[List[Optional[List[int]]]] = None  # [ [start,end], None, ... ] in seconds
    node_service_times: Optional[List[int]] = None          # seconds spent at node (0 if none)
