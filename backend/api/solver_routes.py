from __future__ import annotations
from fastapi import APIRouter, HTTPException
from core.adapter_factory_registry import AdapterFactoryRegistry
from services.solver_factory import get_solver
from core.exceptions import DistanceMatrixRequestError, SolverRequestError
from models.solvers import SolveRequest
from models.distance_matrix import MatrixRequest

router = APIRouter(prefix="/solver", tags=["solver"])

@router.post("")
async def solve_route(req: SolveRequest):
    try:
        # If req.matrix looks like a request (has .adapter/origins), resolve it to MatrixResult
        matrix_obj = req.matrix
        if isinstance(matrix_obj, MatrixRequest) or getattr(matrix_obj, "adapter", None):
            adapter_name = matrix_obj.adapter
            adapter = AdapterFactoryRegistry.get(adapter_name)
            matrix_obj = await adapter.get_matrix(matrix_obj)
            # rebuild SolveRequest with resolved matrix
            req = req.model_copy(update={"matrix": matrix_obj})

        solver = get_solver(req.solver)
        result = solver.solve(req)
        return {"status": "success", "data": result.model_dump() if hasattr(result, "model_dump") else result}
    except (DistanceMatrixRequestError, SolverRequestError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}" )
