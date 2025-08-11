# services/solvers/pyomo_solver.py
from __future__ import annotations

from typing import List, Optional, Tuple
from core.interfaces import VRPSolver
from core.exceptions import SolverRequestError
from models.solvers import SolveRequest, Routes, Route
from models.fleet import Vehicle
from models.distance_matrix import MatrixResult

try:
    import pyomo.environ as pyo
except Exception:  # pragma: no cover
    pyo = None


def _vehicles(fleet_obj) -> List[Vehicle]:
    return fleet_obj.vehicles if hasattr(fleet_obj, "vehicles") else fleet_obj


class PyomoSolver(VRPSolver):
    def solve(self, request: SolveRequest) -> Routes:
        if pyo is None:
            raise SolverRequestError("Pyomo not available. Install pyomo and a MILP solver (cbc/glpk/highs).")

        mtx: MatrixResult = request.matrix
        dist = mtx.distances
        dur = mtx.durations  # seconds or None
        n = len(dist)
        if n == 0:
            return Routes(status="error", message="Empty matrix", routes=[])

        V = _vehicles(request.fleet)
        m = len(V)
        depot = int(request.depot_index or 0)
        if not (0 <= depot < n):
            raise SolverRequestError(f"Invalid depot_index {depot} for matrix size {n}.")

        demands = request.demands or [0] * n
        if len(demands) != n:
            raise SolverRequestError("Length of demands must match number of nodes.")

        node_tw = request.node_time_windows or [None] * n  # [start,end] or None
        svc = request.node_service_times or [0] * n
        caps = [int((v.capacity or [10**12])[0]) for v in V]

        use_tw = any(tw for tw in node_tw) or any(getattr(v, "time_window", None) for v in V)
        H = 24 * 3600

        M = pyo.ConcreteModel()
        N = range(n)
        K = range(m)

        # Variables
        M.x = pyo.Var(N, N, K, domain=pyo.Binary)            # arc use
        M.y = pyo.Var(N, K, domain=pyo.Binary)               # node served by vehicle k (i != depot)
        M.z = pyo.Var(K, domain=pyo.Binary)                  # vehicle used
        if use_tw:
            M.t = pyo.Var(N, K, domain=pyo.NonNegativeReals) # arrival time

        # MTZ potentials per vehicle (to cut subtours)
        M.u = pyo.Var(N, K, domain=pyo.NonNegativeReals)

        # No self arcs
        M.no_self = pyo.ConstraintList()
        for i in N:
            for k in K:
                M.no_self.add(M.x[i, i, k] == 0)

        # Each customer visited exactly once
        M.visit_once = pyo.ConstraintList()
        for i in N:
            if i == depot:
                continue
            M.visit_once.add(sum(M.y[i, k] for k in K) == 1)

        # Link degrees at customers with y
        M.link_degree = pyo.ConstraintList()
        for k in K:
            for i in N:
                if i == depot:
                    continue
                M.link_degree.add(sum(M.x[i, j, k] for j in N if j != i) == M.y[i, k])
                M.link_degree.add(sum(M.x[j, i, k] for j in N if j != i) == M.y[i, k])

        # Depot degree equals vehicle usage
        M.depot_deg = pyo.ConstraintList()
        for k in K:
            M.depot_deg.add(sum(M.x[depot, j, k] for j in N if j != depot) == M.z[k])
            M.depot_deg.add(sum(M.x[j, depot, k] for j in N if j != depot) == M.z[k])

        # If vehicle unused, it cannot serve any customer
        M.use_link = pyo.ConstraintList()
        for k in K:
            for i in N:
                if i == depot:
                    continue
                M.use_link.add(M.y[i, k] <= M.z[k])

        # Capacity
        M.capacity = pyo.ConstraintList()
        for k in K:
            M.capacity.add(sum(demands[i] * M.y[i, k] for i in N if i != depot) <= caps[k])

        # MTZ: anchor, bounds, and cuts per vehicle
        M.mtz_anchor = pyo.ConstraintList()
        M.mtz_bounds = pyo.ConstraintList()
        M.mtz_cuts = pyo.ConstraintList()
        for k in K:
            M.mtz_anchor.add(M.u[depot, k] == 0)
            for i in N:
                if i == depot:
                    continue
                # bounds only when served; relax with big-M via y[i,k]
                M.mtz_bounds.add(M.u[i, k] >= 1 * M.y[i, k])
                M.mtz_bounds.add(M.u[i, k] <= (n - 1) * M.y[i, k])
            for i in N:
                for j in N:
                    if i == j or i == depot or j == depot:
                        continue
                    # u[i,k] - u[j,k] + (n-1) x[i,j,k] <= (n-2)
                    M.mtz_cuts.add(M.u[i, k] - M.u[j, k] + (n - 1) * M.x[i, j, k] <= (n - 2))

        # Time windows (optional)
        if use_tw:
            def tt(i: int, j: int) -> float:
                if i == j:
                    return 0.0
                base = (float(dur[i][j]) if dur is not None else (dist[i][j] / 40.0) * 3600.0)
                return base + float(svc[i] or 0)

            M.tw_bounds = pyo.ConstraintList()
            for k in K:
                vtw = getattr(V[k], "time_window", None)
                if vtw and len(vtw) == 2:
                    M.tw_bounds.add(M.t[depot, k] >= int(vtw[0]))
                    M.tw_bounds.add(M.t[depot, k] <= int(vtw[1]))
                else:
                    M.tw_bounds.add(M.t[depot, k] >= 0)
                    M.tw_bounds.add(M.t[depot, k] <= H)

                for i in N:
                    tw = node_tw[i]
                    if tw and len(tw) == 2:
                        a, b = int(tw[0]), int(tw[1])
                        # bound only if i served by k (relax with big-M)
                        M.tw_bounds.add(M.t[i, k] >= a - H * (1 - M.y[i, k]))
                        M.tw_bounds.add(M.t[i, k] <= b + H * (1 - M.y[i, k]))
                    else:
                        M.tw_bounds.add(M.t[i, k] >= 0)
                        M.tw_bounds.add(M.t[i, k] <= H)

            M.tw_prec = pyo.ConstraintList()
            for k in K:
                for i in N:
                    for j in N:
                        if i == j:
                            continue
                        M.tw_prec.add(M.t[j, k] >= M.t[i, k] + tt(i, j) - H * (1 - M.x[i, j, k]))

        # Objective: minimize total distance
        M.obj = pyo.Objective(
            expr=sum(float(dist[i][j]) * M.x[i, j, k] for i in N for j in N if i != j for k in K),
            sense=pyo.minimize
        )

        # Pick a solver
        solver = None
        for cand in ("cbc", "glpk", "highs"):
            try:
                sf = pyo.SolverFactory(cand)
                if sf and sf.available(False):
                    solver = sf
                    break
            except Exception:
                continue
        if not solver:
            raise SolverRequestError("No MILP solver available. Install CBC (`apt install coinor-cbc` or `conda install -c conda-forge coincbc`) or GLPK/HIGHS.")

        res = solver.solve(M, tee=False)
        term = getattr(res.solver, "termination_condition", None)
        if term not in (pyo.TerminationCondition.optimal, pyo.TerminationCondition.feasible):
            raise SolverRequestError(f"Pyomo solve failed: {term}")

        # Reconstruct routes
        def edges_for(k: int):
            es = []
            for i in N:
                for j in N:
                    if i != j and pyo.value(M.x[i, j, k]) > 0.5:
                        es.append((i, j))
            return es

        routes: List[Route] = []
        for k in K:
            es = edges_for(k)
            if not es:
                continue
            succ = {i: j for (i, j) in es}
            path = [depot]
            cur = depot
            seen = set([depot])
            while True:
                if cur not in succ:
                    break
                nxt = succ[cur]
                path.append(nxt)
                if nxt == depot:
                    break
                if nxt in seen:
                    break
                seen.add(nxt)
                cur = nxt

            total_dist_km = 0.0
            total_dur_s: Optional[float] = 0.0 if mtx.durations is not None else None
            for a, b in zip(path, path[1:]):
                total_dist_km += float(dist[a][b])
                if total_dur_s is not None:
                    total_dur_s += float(mtx.durations[a][b]) + float(svc[a] or 0)

            veh = V[k]
            ef = float(getattr(veh, "emissions_per_km", 0.0) or 0.0)
            emissions_kg = ef * total_dist_km if ef else None

            routes.append(
                Route(
                    vehicle_id=str(getattr(veh, "id", k)),
                    waypoint_ids=[str(i) for i in path],
                    total_distance=total_dist_km,
                    total_duration=int(total_dur_s) if isinstance(total_dur_s, (int, float)) else None,
                    emissions=emissions_kg,
                    metadata={"solver": solver.name}
                )
            )

        if not routes:
            return Routes(status="error", message="No routes built (model feasible but empty).", routes=[])

        return Routes(status="success", message="Solution found", routes=routes)
