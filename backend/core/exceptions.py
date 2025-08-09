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
