from fastapi import APIRouter, HTTPException
from models.solvers import SolveRequest, SolveResult
from services.solver_factory import get_solver

router = APIRouter()

@router.post("/")
async def solve_vrp(request: SolveRequest):
    try:
        solver = get_solver(request.solver)
        result = solver.solve(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
