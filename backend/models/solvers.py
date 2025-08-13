from __future__ import annotations
from typing import List, Optional, Union
from pydantic import BaseModel, Field
from models.distance_matrix import MatrixResult  # <- important: solver consumes a MatrixResult
from models.fleet import Vehicle, Fleet
from models.waypoints import Waypoint

class PickupDeliveryPair(BaseModel):
    pickup: int                 # node index in the matrix
    delivery: int               # node index in the matrix
    quantity: Optional[int] = None  # optional; demands[] controls load

class Route(BaseModel):
    vehicle_id: str
    waypoint_ids: List[str]
    total_distance: Optional[float] = None
    total_duration: Optional[int] = None
    emissions: Optional[float] = None
    metadata: Optional[dict] = None

class Routes(BaseModel):
    status: str = "success"
    message: Optional[str] = None
    routes: List[Route] = Field(default_factory=list)  # avoid shared mutable default

class ObjectiveWeights(BaseModel):
    distance: float = 1.0
    time: float = 0.0
    emissions: float = 0.0
    reliability: float = 0.0

class SolveRequest(BaseModel):
    # For /solver/solve: the matrix must already be computed
    solver: str
    matrix: Optional[MatrixResult] = None                       # <— was Union[MatrixResult, MatrixRequest]; keep this simple
    fleet: Union[List[Vehicle], Fleet]
    depot_index: int = 0

    # Optional per-node info
    demands: Optional[List[int]] = None
    node_time_windows: Optional[List[Optional[List[int]]]] = None
    node_service_times: Optional[List[int]] = None

    # Pickup & delivery pairs
    pickup_delivery_pairs: Optional[List[PickupDeliveryPair]] = None

    # Objective weights for multi-objective solvers
    weights: Optional[ObjectiveWeights] = None

    #coordinate-mode payload for VROOM
    waypoints: Optional[List[Waypoint]] = None