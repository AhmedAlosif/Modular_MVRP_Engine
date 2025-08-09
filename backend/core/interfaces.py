from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any
from models.solvers import SolveRequest, Routes

class DistanceMatrixAdapter(ABC):
    """
    Interface for Distance Matrix Adapters.
    All distance matrix adapters should implement this interface.
    """

    @abstractmethod
    def get_matrix(
        self,
        coordinates: List[Tuple[float, float]],
        profile: str = 'driving-car',
        metrics: List[str] = ['duration', 'distance']
    ) -> Dict[str, Any]:
        """
        Compute the distance/duration matrix for given coordinates.

        Args:
            coordinates: List of (latitude, longitude) tuples.
            profile: Routing profile, e.g. 'driving-car'.
            metrics: Metrics to include, e.g. ['distance', 'duration'].

        Returns:
            Dictionary with distance matrix data.
        """
        pass
class VRPSolver(ABC):
    @abstractmethod
    def solve(self, req: SolveRequest) -> Routes:
        pass

class SolverInterface(VRPSolver):
    """
    Marker interface for all solver implementations.
    """
    pass