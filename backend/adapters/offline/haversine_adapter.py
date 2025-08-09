import math
from core.interfaces import DistanceMatrixAdapter
from core.exceptions import DistanceMatrixRequestError
from models.distance_matrix import MatrixRequest, MatrixResult

def haversine_distance(coord1, coord2) -> float:
    """
    Calculate the Haversine distance between two coordinates (lat, lon) in kilometers.
    """
    R = 6371  # Earth radius in km

    lat1, lon1 = coord1
    lat2, lon2 = coord2

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c * 1000  # meters


class HaversineAdapter(DistanceMatrixAdapter):
    """
    Offline distance matrix using Haversine formula (distance only, no duration).
    """

    async def get_matrix(self, request: MatrixRequest) -> MatrixResult:
        origins = request.origins
        destinations = request.destinations

        if not origins or not destinations:
            raise DistanceMatrixRequestError("Haversine requires both origins and destinations.")

        distances = []
        for origin in origins:
            row = []
            for dest in destinations:
                d = haversine_distance((origin.lat, origin.lon), (dest.lat, dest.lon))
                row.append(d)
            distances.append(row)

        return MatrixResult(distances=distances, durations=None)
