from fastapi import APIRouter, HTTPException
from adapters.adapter_factory import create_adapter
from api.status import success_response, error_response
from core.exceptions import DistanceMatrixRequestError
from models.distance_matrix import MatrixRequest

router = APIRouter()

@router.post("/")
async def get_distance_matrix(req: MatrixRequest):
    try:
        adapter = create_adapter(req.adapter)
        matrix = await adapter.get_matrix(req)
        return success_response(data={"matrix": matrix})
    except DistanceMatrixRequestError as e:
        raise HTTPException(status_code=400, detail=error_response("Matrix computation failed", str(e)))
    except Exception as e:
        raise HTTPException(status_code=500, detail=error_response("Internal server error", str(e)))
