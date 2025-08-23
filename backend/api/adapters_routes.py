# api/adapters_routes.py
import os
import asyncio
from typing import List, Optional, Dict, Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from adapters.adapter_factory import create_adapter
from adapters.online.openrouteservice_adapter import ORSDistanceMatrixAdapter
from core.exceptions import DistanceMatrixRequestError
from models.distance_matrix import MatrixRequest, MatrixResult

router = APIRouter()

# ───────────────────────── legacy / generic entrypoint ─────────────────────────
@router.post("/distance-matrix", summary="Compute a distance/duration matrix via adapter")
async def get_distance_matrix(req: MatrixRequest):
    """
    Backward-compatible route that accepts a full MatrixRequest (including `adapter`).
    Use this if you're already sending a MatrixRequest from the client.
    """
    try:
        adapter = create_adapter(req.adapter)

        # Call adapter (works whether get_matrix is async or sync)
        result = adapter.get_matrix(req)
        if asyncio.iscoroutine(result):
            result = await result

        # Normalize to MatrixResult for consistent serialization
        if not isinstance(result, MatrixResult):
            result = MatrixResult(**result)

        return {
            "status": "success",
            "data": {"matrix": result.model_dump()}
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": f"Internal server error: {e}"}
        )

# ───────────────────────── simple ORS entrypoint (coords only) ─────────────────────────

class Coordinate(BaseModel):
    lat: float
    lon: float

class ORSMatrixBody(BaseModel):
    """
    Minimal, frontend-friendly body:
      - plain coordinates (no Waypoints)
      - destinations optional; if omitted, origins will be mirrored
    """
    origins: List[Coordinate]
    destinations: Optional[List[Coordinate]] = None
    mode: Literal["driving", "cycling", "walking"] = "driving"
    parameters: Dict[str, Any] = Field(
        default_factory=lambda: {"metrics": ["distance", "duration"], "units": "m"}
    )

@router.post(
    "/distance-matrix/ors",
    summary="Compute a distance/duration matrix via OpenRouteService (coords-only request)"
)
async def ors_matrix(body: ORSMatrixBody):
    """
    New route intended for the frontend. Accepts plain coords and handles the
    ORS adapter + MatrixRequest construction internally.
    """
    api_key = os.getenv("ORS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ORS not configured (missing ORS_API_KEY).")

    try:
        adapter = ORSDistanceMatrixAdapter(api_key=api_key)

        # Build the internal MatrixRequest (MatrixRequest requires an adapter field in many setups)
        req = MatrixRequest(
            adapter="openrouteservice",  # value is not used by ORS adapter but satisfies schema
            origins=[c.model_dump() for c in body.origins],
            destinations=[c.model_dump() for c in (body.destinations or body.origins)],
            mode=body.mode,
            parameters=body.parameters,
        )

        result = adapter.get_matrix(req)
        if asyncio.iscoroutine(result):
            result = await result

        if not isinstance(result, MatrixResult):
            result = MatrixResult(**result)

        return {
            "status": "success",
            "data": {"matrix": {"distances": result.distances, "durations": result.durations}}
        }

    except DistanceMatrixRequestError as e:
        # Bad request to ORS (e.g., invalid coords/params)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")
