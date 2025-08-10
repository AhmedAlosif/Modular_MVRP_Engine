from core.interfaces import VRPSolver
from models.solvers import SolveResult
from core.exceptions import SolverError
import pyomo.environ as pyo
from pyomo.opt import SolverFactory

class PyomoSolver(VRPSolver):
    """
    Multi-objective VRP solver using Pyomo and CBC solver.
    """

    def solve(self, fleet, matrix) -> SolveResult:
        """
        fleet: List of vehicles from SolverRequest
        matrix: MatrixResult from DistanceMatrixAdapter (must have .distances and .durations)
        """
        if not hasattr(matrix, "distances") or not hasattr(matrix, "durations"):
            raise SolverError("Matrix must include both distances and durations for Pyomo.")

        # Create the Pyomo model
        model = pyo.ConcreteModel()

        # Parameters
        n = len(matrix.distances)  # number of locations (including depot)
        m = len(fleet)  # number of vehicles

        # Decision variables: x[i,j] = 1 if vehicle visits location i->j
        model.x = pyo.Var(range(n), range(n), range(m), domain=pyo.Binary)

        # Objective: Combine multiple objectives (distance, time, emissions)
        # Weighted sum of distance and duration
        w_distance = 0.5
        w_time = 0.5

        model.obj = pyo.Objective(
            expr=sum(w_distance * matrix.distances[i][j] * model.x[i, j, k] for i in range(n) for j in range(n) for k in range(m)) +
                 sum(w_time * matrix.durations[i][j] * model.x[i, j, k] for i in range(n) for j in range(n) for k in range(m)),
            sense=pyo.minimize
        )

        # Constraints: 
        # Each location must be visited exactly once per vehicle
        model.visit_constraint = pyo.ConstraintList()
        for i in range(1, n):
            model.visit_constraint.add(sum(model.x[i, j, k] for j in range(n) for k in range(m)) == 1)

        # Vehicle capacity and time window constraints (you can add more)
        # Add constraints here if needed (vehicle capacities, time windows, etc.)

        # Create the solver
        solver = SolverFactory('cbc')  # CBC solver, can also use GLPK or others if installed

        # Solve the model
        results = solver.solve(model, tee=True)

        if results.solver.status != pyo.SolverStatus.ok:
            raise SolverError("Solver did not converge.")

        # Extract routes from solution
        routes = []
        for k in range(m):  # For each vehicle
            route = []
            for i in range(n):
                for j in range(n):
                    if pyo.value(model.x[i, j, k]) == 1:
                        route.append((i, j))
            routes.append(route)

        return SolveResult(routes=routes, total_distance=pyo.value(model.obj))
