# api/adapters_routes.py
from fastapi import APIRouter, HTTPException
from adapters.adapter_factory import create_adapter
from models.distance_matrix import MatrixRequest, MatrixResult
import asyncio

router = APIRouter()

@router.post("/distance-matrix", summary="Compute a distance/duration matrix via adapter")
async def get_distance_matrix(req: MatrixRequest):
    try:
        adapter = create_adapter(req.adapter)

        # Call adapter (works whether get_matrix is async or sync)
        result = adapter.get_matrix(req)
        if asyncio.iscoroutine(result):
            result = await result

        # Normalize to MatrixResult for consistent serialization
        if not isinstance(result, MatrixResult):
            result = MatrixResult(**result)

        # Return plain dict to avoid pydantic trying to serialize exotic types
        return {
            "status": "success",
            "data": {"matrix": result.model_dump()}
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": f"Internal server error: {e}"}
        )
