from typing import List, Optional
from pydantic import BaseModel, Field


class Location(BaseModel):
    lat: float
    lon: float


class TimeWindow(BaseModel):
    start: int  # seconds from midnight
    end: int    # seconds from midnight


class Waypoint(BaseModel):
    id: str
    location: Location
    type: Optional[str] = Field(
        default="customer",
        description="e.g. 'depot', 'pickup', 'delivery', 'customer'"
    )
    
    demand: Optional[List[int]] = Field(
        default=None,
        description="e.g., [weight, volume] for multi-capacity VRPs"
    )

    service_duration: Optional[int] = Field(
        default=0,
        description="Duration of service at this waypoint in seconds"
    )

    time_window: Optional[TimeWindow] = None

    skills_required: Optional[List[str]] = None

    pickup_delivery_id: Optional[str] = None
    # For pickup & delivery
    paired_with: Optional[str] = Field(
        default=None,
        description="Waypoint ID of paired pickup or delivery"
    )

    priority: Optional[int] = Field(
        default=1,
        description="Higher means more important (for soft constraints or heuristics)"
    )

    emissions: Optional[float] = None  # for eco-routing


class WaypointsRequest(BaseModel):
    waypoints: List[Waypoint]
