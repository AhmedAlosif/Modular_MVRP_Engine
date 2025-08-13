# api/solver_routes.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from models.solvers import SolveRequest, Routes
from models.distance_matrix import MatrixResult
from models.fleet import Fleet, Vehicle
from services.solver_factory import get_solver
from services.metrics import enrich_routes_with_metrics

router = APIRouter()

def _as_vehicle_list(fleet_or_list) -> List[Vehicle]:
    return fleet_or_list.vehicles if isinstance(fleet_or_list, Fleet) else list(fleet_or_list)

def _as_matrix_result(matrix_like) -> MatrixResult:
    if isinstance(matrix_like, MatrixResult):
        return matrix_like
    if hasattr(matrix_like, "model_dump"):
        return MatrixResult(**matrix_like.model_dump())
    return MatrixResult(**matrix_like)

@router.post("/solver")
def solve(req: SolveRequest):
    try:
        solver = get_solver(req.solver)

        # Normalize fleet -> list[Vehicle]
        fleet_list: List[Vehicle] = (
            _as_vehicle_list(req.fleet) if isinstance(req.fleet, Fleet) else req.fleet  # type: ignore
        )

        # Normalize matrix -> MatrixResult (ONLY if present)
        matrix: Optional[MatrixResult] = None
        if req.matrix is not None:
            matrix = _as_matrix_result(req.matrix)

        s = req.solver.lower().strip()
        if s in ("ortools", "pyomo"):
            if matrix is None or not matrix.distances:
                raise HTTPException(status_code=400, detail=f"matrix is required for solver '{req.solver}'")
        elif s == "vroom":
            if not req.waypoints and matrix is None:
                raise HTTPException(status_code=400, detail="vroom requires either 'waypoints' (coordinate mode) or 'matrix'")

        # Build kwargs common to modern solvers
        call_kwargs = dict(
            fleet=fleet_list,
            matrix=matrix,  # <— pass the normalized MatrixResult (may be None for vroom coord mode)
            depot_index=req.depot_index,
            demands=req.demands,
            node_time_windows=req.node_time_windows,
            node_service_times=req.node_service_times,
            pickup_delivery_pairs=req.pickup_delivery_pairs,
            weights=(req.weights.model_dump() if req.weights else None),
        )
        # Only vroom gets waypoints
        if s == "vroom":
            call_kwargs["waypoints"] = req.waypoints

        try:
            routes: Routes = solver.solve(**call_kwargs)
        except TypeError:
            # Legacy signature (e.g. VroomSolver(request))
            routes: Routes = solver.solve(req)  # type: ignore

        # Enrich only if we actually have a matrix
        if matrix is not None:
            routes = enrich_routes_with_metrics(
                routes=routes,
                matrix=matrix,
                fleet=fleet_list,
                depot_index=req.depot_index,
            )

        data = routes.model_dump() if hasattr(routes, "model_dump") else routes
        return {"status": routes.status, "message": routes.message, "data": data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")
