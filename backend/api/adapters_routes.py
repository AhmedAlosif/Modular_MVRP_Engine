# api/adapters_routes.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from core.adapter_factory_registry import AdapterFactoryRegistry
from core.exceptions import DistanceMatrixRequestError
from models.distance_matrix import MatrixRequest, MatrixResult

router = APIRouter(prefix="/distance-matrix", tags=["distance-matrix"])

@router.post("")
async def get_distance_matrix(req: MatrixRequest):
    try:
        adapter = AdapterFactoryRegistry.get(req.adapter)
        result: MatrixResult = await adapter.get_matrix(req)
        # Unified, simple response (no legacy success_response/error_response)
        return {"status": "success", "message": "OK", "data": {"matrix": result.model_dump()}}
    except DistanceMatrixRequestError as e:
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Matrix failed", "details": str(e)})
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"status": "error", "message": "Adapter not found", "details": str(e)})
    except Exception as e:
        raise HTTPException(status_code=500, detail={"status": "error", "message": "Internal error", "details": str(e)})
