from openrouteservice import Client
from typing import List, Tuple

class ORSDistanceMatrixAdapter:
    def __init__(self, api_key: str):
        self.client = Client(key=api_key)

    def compute_matrix(
        self,
        coordinates: List[Tuple[float, float]],
        profile: str = 'driving-car',  # ORS profile: 'driving-car', 'cycling-regular', etc.
        metrics: List[str] = ['duration', 'distance']
    ) -> dict:
        if len(coordinates) < 2:
            raise ValueError("Need at least two coordinates for distance matrix.")

        # ORS uses [lon, lat] format
        locations = [[lon, lat] for lat, lon in coordinates]

        response = self.client.distance_matrix(
            locations=locations,
            profile=profile,
            metrics=metrics,
            units='km',  # You asked for KM
            resolve_locations=False,
            validate=False
        )
        return response
