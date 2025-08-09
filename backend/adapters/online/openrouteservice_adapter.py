import httpx
from core.interfaces import DistanceMatrixAdapter
from models.distance_matrix import MatrixRequest, MatrixResult
from core.exceptions import DistanceMatrixRequestError


class ORSDistanceMatrixAdapter(DistanceMatrixAdapter):
    def __init__(self, api_key: str):
        self.api_key = api_key

    async def get_matrix(self, request: MatrixRequest) -> MatrixResult:
        try:
            # === 1. Extract and validate input ===
            origins = request.origins
            destinations = request.destinations
            if not origins or not destinations:
                raise DistanceMatrixRequestError("ORS requires both 'origins' and 'destinations'.")

            parameters = request.parameters or {}
            mode_map = {
                "driving": "driving-car",
                "cycling": "cycling-regular",
                "walking": "foot-walking"
            }
            profile = mode_map.get(request.mode, "driving-car")
            metrics = parameters.get("metrics", ["distance", "duration"])
            units = parameters.get("units", "m")  # default to meters

            # === 2. Deduplicate coordinates ===
            all_coords = origins + destinations
            unique_coords = []
            coord_index_map = {}
            for coord in all_coords:
                key = (coord.lat, coord.lon)
                if key not in coord_index_map:
                    coord_index_map[key] = len(unique_coords)
                    unique_coords.append([coord.lon, coord.lat])  # ORS expects [lon, lat]

            source_indices = [coord_index_map[(wp.lat, wp.lon)] for wp in origins]
            dest_indices = [coord_index_map[(wp.lat, wp.lon)] for wp in destinations]

            # === 3. Build request ===
            payload = {
                "locations": unique_coords,
                "sources": source_indices,
                "destinations": dest_indices,
                "metrics": metrics,
                "units": units
            }

            headers = {
                "Authorization": self.api_key,
                "Content-Type": "application/json",
            }

            url = f"https://api.openrouteservice.org/v2/matrix/{profile}"

            # === 4. Send request ===
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()

            # === 5. Parse and return result ===
            return MatrixResult.from_ors(data)

        except httpx.HTTPStatusError as e:
            raise DistanceMatrixRequestError(f"ORS HTTP error: {e.response.text}")
        except Exception as e:
            raise DistanceMatrixRequestError(f"OpenRouteService error: {e}")
