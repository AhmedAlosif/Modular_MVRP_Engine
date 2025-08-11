from __future__ import annotations

class APIKeyMissingError(Exception):
    """Exception raised when an API key is missing or invalid."""
    pass

class InvalidResponseError(Exception):
    """Exception raised when an API response is invalid or malformed."""
    pass

class DistanceMatrixRequestError(Exception):
    """Exception raised when distance matrix request fails."""
    pass

class SolverError(Exception):
    """Exception raised when the VRP solver encounters an error."""
    pass
class AppError(Exception):
    """Base app error."""
    pass

class DistanceMatrixRequestError(AppError):
    """Raised when a distance-matrix provider fails."""
    pass

class SolverRequestError(AppError):
    """Raised when a VRP solver fails or is misconfigured."""
    pass