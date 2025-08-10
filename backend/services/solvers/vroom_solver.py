# services/solvers/vroom_solver.py

from typing import List
from core.interfaces import VRPSolver
from models.solvers import SolveRequest, SolveResult
from core.exceptions import SolverError
from services.solver_factory import get_solver
from vroom import Vehicle, Job, Input

class VroomSolver(VRPSolver):
    """
    VRP Solver using pyvroom, with pre-computed matrices from adapters.
    Fully compatible with OrToolsSolver's interface.
    """

    def solve(self, fleet, matrix) -> SolveResult:
        """
        fleet: List of VehicleModel objects from SolverRequest
        matrix: MatrixResult from DistanceMatrixAdapter (must have .distances and .durations)
        """
        # Check matrix validity
        if not hasattr(matrix, "distances") or not hasattr(matrix, "durations"):
            raise SolverError("Matrix must include both distances and durations for VROOM.")

        # Create a VROOM problem input
        problem = Input()

        # Add vehicles
        for idx, veh in enumerate(fleet):
            start_index = getattr(veh, "start_index", 0)
            end_index = getattr(veh, "end_index", 0)
            capacity = getattr(veh, "capacity", [])

            problem.add_vehicle(
                Vehicle(
                    idx,
                    start_index=start_index,
                    end_index=end_index,
                    capacity=capacity
                )
            )

        # Add jobs (every location except vehicle starts/ends, depending on your logic)
        num_locations = len(matrix.distances)
        for loc_idx in range(num_locations):
            problem.add_job(Job(loc_idx, location_index=loc_idx))

        # Attach pre-computed costs
        problem.set_costs(matrix.distances, matrix.durations)

        # Solve with pyvroom
        solution = problem.solve(exploration_level=5)

        # Build SolverResult in same shape as OrToolsSolver
        return SolveResult(
            routes=[
                {
                    "vehicle": route.vehicle,
                    "steps": [
                        {
                            "location_index": step.location_index,
                            "arrival": step.arrival,
                            "duration": step.duration
                        }
                        for step in route.steps
                    ]
                }
                for route in solution.routes
            ],
            unassigned=solution.unassigned,
            summary={
                "cost": solution.summary.cost,
                "duration": solution.summary.duration,
                "distance": solution.summary.distance
            }
        )

    @staticmethod
    def from_request(request: SolveRequest) -> SolveResult:
        """
        Entry point to match OrToolsSolver's pattern:
        Fetch matrix via adapter, then run VROOM.
        """
        adapter = get_solver(request.matrix.adapter)
        matrix = adapter.get_matrix(request.matrix)

        solver = VroomSolver()
        return solver.solve(request.fleet, matrix)