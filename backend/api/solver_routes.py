# api/solver_routes.py
import inspect
import math
from typing import List, Optional, Any, Dict

from fastapi import APIRouter, HTTPException

from models.distance_matrix import MatrixResult
from models.fleet import Fleet, Vehicle
from models.solvers import SolveRequest, Routes
from services.metrics import enrich_routes_with_metrics
from services.solver_factory import get_solver

router = APIRouter()


def _as_vehicle_list(fleet_or_list) -> List[Vehicle]:
    return fleet_or_list.vehicles if isinstance(fleet_or_list, Fleet) else list(fleet_or_list)


def _as_matrix_result(matrix_like) -> MatrixResult:
    if isinstance(matrix_like, MatrixResult):
        return matrix_like
    if hasattr(matrix_like, "model_dump"):
        return MatrixResult(**matrix_like.model_dump())
    return MatrixResult(**matrix_like)


def _filter_kwargs_for(callable_obj: Any, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only kwargs that the callable explicitly accepts and drop None values."""
    try:
        sig = inspect.signature(callable_obj)
        accepted = set(sig.parameters.keys())
        return {k: v for k, v in kwargs.items() if k in accepted and v is not None}
    except (ValueError, TypeError):
        return {k: v for k, v in kwargs.items() if v is not None}


def _n_nodes_from_matrix(m: MatrixResult) -> int:
    if m and m.distances:
        return len(m.distances)
    if m and m.durations:
        return len(m.durations)
    return 0


def _normalize_optional_arrays_for_solver(
    solver_name: str,
    matrix: Optional[MatrixResult],
    demands: Optional[List[int]],
    node_time_windows: Optional[List[Optional[List[int]]]],
    node_service_times: Optional[List[int]],
) -> Dict[str, Any]:
    """
    For Pyomo/OR-Tools, ensure arrays are present & sized to avoid None iteration errors.
    """
    if solver_name not in ("pyomo", "ortools") or matrix is None:
        return {
            "demands": demands,
            "node_time_windows": node_time_windows,
            "node_service_times": node_service_times,
        }

    n = _n_nodes_from_matrix(matrix)
    if n <= 0:
        return {
            "demands": demands,
            "node_time_windows": node_time_windows,
            "node_service_times": node_service_times,
        }

    # demands
    if demands is None:
        demands = [0] * n
    elif len(demands) != n:
        demands = (demands + [0] * n)[:n]

    # service times
    if node_service_times is None:
        node_service_times = [0] * n
    elif len(node_service_times) != n:
        node_service_times = (node_service_times + [0] * n)[:n]

    # time windows
    INF = 10**9
    if node_time_windows is None:
        node_time_windows = [[0, INF] for _ in range(n)]
    else:
        norm_ntw: List[List[int]] = []
        padded = node_time_windows[:n] + [[None, None]] * max(0, n - len(node_time_windows))
        for tw in padded:
            if tw is None:
                norm_ntw.append([0, INF])
            elif isinstance(tw, list) and len(tw) == 2:
                start = 0 if tw[0] is None else int(tw[0])
                end = INF if (tw[1] is None or (isinstance(tw[1], (int, float)) and math.isinf(tw[1]))) else int(tw[1])
                if end < start:
                    end = start
                norm_ntw.append([start, end])
            else:
                norm_ntw.append([0, INF])
        node_time_windows = norm_ntw

    return {
        "demands": demands,
        "node_time_windows": node_time_windows,
        "node_service_times": node_service_times,
    }


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
        if getattr(req, "matrix", None) is not None:
            matrix = _as_matrix_result(req.matrix)

        s = (req.solver or "").lower().strip()
        if s in ("ortools", "pyomo"):
            if matrix is None or not (matrix.distances or matrix.durations):
                raise HTTPException(
                    status_code=400,
                    detail=f"matrix is required for solver '{req.solver}'. Hint: compute via /distance-matrix or include 'waypoints' for vroom.",
                )
        elif s == "vroom":
            if not getattr(req, "waypoints", None) and matrix is None:
                raise HTTPException(
                    status_code=400, detail="vroom requires either 'waypoints' (coordinate mode) or 'matrix'"
                )

        # --- Optional fields (guard via getattr) ---
        demands_val = getattr(req, "demands", None)
        ntw_val = getattr(req, "node_time_windows", None)
        nst_val = getattr(req, "node_service_times", None)
        pd_pairs_val = getattr(req, "pickup_delivery_pairs", None)
        weights_val = None
        if getattr(req, "weights", None) is not None:
            weights_val = req.weights.model_dump() if hasattr(req.weights, "model_dump") else req.weights
        vrp_type_val = getattr(req, "vrp_type", None)

        arrays = _normalize_optional_arrays_for_solver(
            solver_name=s, matrix=matrix, demands=demands_val, node_time_windows=ntw_val, node_service_times=nst_val
        )
        demands_val = arrays["demands"]
        ntw_val = arrays["node_time_windows"]
        nst_val = arrays["node_service_times"]

        # Build kwargs for solver
        call_kwargs: Dict[str, Any] = dict(
            fleet=fleet_list,
            matrix=matrix,
            depot_index=req.depot_index,
            demands=demands_val,
            node_time_windows=ntw_val,
            node_service_times=nst_val,
            pickup_delivery_pairs=pd_pairs_val,
            weights=weights_val,
            vrp_type=vrp_type_val,
        )

        # Only VROOM receives waypoints (coordinate mode)
        if s == "vroom" and getattr(req, "waypoints", None) is not None:
            call_kwargs["waypoints"] = req.waypoints

        # Prepare to invoke the solver
        solve_fn = getattr(solver, "solve")
        filtered_kwargs = _filter_kwargs_for(solve_fn, call_kwargs)

        # Guardrails: ensure matrix forwarded to pyomo/ortools after filtering
        if s in ("pyomo", "ortools") and "matrix" not in filtered_kwargs:
            raise HTTPException(status_code=500, detail="Internal error: normalized matrix not forwarded to solver")

        # Detect legacy signature (e.g., VroomSolver.solve(request: SolveRequest))
        use_legacy_request = False
        try:
            sig = inspect.signature(solve_fn)
            params = sig.parameters
            if len(params) == 1 and "request" in params:
                use_legacy_request = True
            elif "request" in params and "request" not in filtered_kwargs:
                use_legacy_request = True
        except (TypeError, ValueError):
            use_legacy_request = False

        # Invoke solver
        try:
            if use_legacy_request:
                routes: Routes = solve_fn(req)  # legacy VROOM path
            else:
                routes: Routes = solve_fn(**filtered_kwargs)
        except TypeError as e:
            sig_str = None
            try:
                sig_str = str(inspect.signature(solve_fn))
            except Exception:
                pass
            detail = f"Backend invocation error: {e}"
            if sig_str:
                detail += f" | expected signature: solve{sig_str}"
            raise HTTPException(status_code=500, detail=detail)

        # Enrich only if we actually have a matrix
        if matrix is not None:
            routes = enrich_routes_with_metrics(
                routes=routes, matrix=matrix, fleet=fleet_list, depot_index=req.depot_index
            )

        data = routes.model_dump() if hasattr(routes, "model_dump") else routes
        return {"status": routes.status, "message": routes.message, "data": data}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")
