import time
from typing import Iterable, List, Optional, Tuple, Dict, Any
from OSMPythonTools.overpass import Overpass, overpassQueryBuilder
from OSMPythonTools.nominatim import Nominatim
from OSMPythonTools.element import Element

# --- Config (you can route these through your Settings / env) ---
DEFAULT_TIMEOUT = 120
RATE_LIMIT_SLEEP = 1.0  # seconds between calls

# Create singletons with a user-agent
nominatim = Nominatim()
overpass = Overpass()

# ---------------------------
# Helpers
# ---------------------------

def _sleep():
    time.sleep(RATE_LIMIT_SLEEP)

def city_to_area_id(city: str) -> int:
    """
    Resolve a human city name to an OSM areaId suitable for Overpass.
    """
    _sleep()
    res = nominatim.query(city)
    area_id = res.areaId()
    if area_id is None:
        raise ValueError(f"Could not resolve areaId for city: {city}")
    return area_id

def query_overpass_raw(
    query: str,
    *,
    timeout: int = DEFAULT_TIMEOUT,
    date: Optional[str] = None,
):
    """
    Execute a raw Overpass QL query string. Returns Overpass.Result.
    """
    _sleep()
    return overpass.query(query, timeout=timeout, date=date)

def build_query_nodes_by_tag(
    *,
    area_id: Optional[int] = None,
    bbox: Optional[Tuple[float, float, float, float]] = None,  # (south, west, north, east)
    key: str,
    value: str,
    out: str = "body",
):
    """
    Build a query for nodes with a given key=value within area or bbox.
    Exactly one of area_id or bbox must be provided.
    """
    if (area_id is None) == (bbox is None):
        raise ValueError("Provide exactly one of area_id or bbox.")

    return overpassQueryBuilder(
        area=area_id,
        bbox=bbox,
        elementType="node",
        selector=f'"{key}"="{value}"',
        out=out,
    )

def fetch_nodes_by_tag(
    *,
    area_id: Optional[int] = None,
    bbox: Optional[Tuple[float, float, float, float]] = None,
    key: str,
    value: str,
    timeout: int = DEFAULT_TIMEOUT,
) -> List[Element]:
    """
    Fetch nodes with key=value using Overpass.
    """
    query = build_query_nodes_by_tag(area_id=area_id, bbox=bbox, key=key, value=value)
    res = query_overpass_raw(query, timeout=timeout)
    return res.elements()

def elements_to_geojson_features(elements: Iterable[Element]) -> List[Dict[str, Any]]:
    """
    Convert OSM Elements to GeoJSON Point Features (skip those without lat/lon).
    """
    features: List[Dict[str, Any]] = []
    for el in elements:
        lat = el.lat()
        lon = el.lon()
        if lat is None or lon is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
                "properties": el.tags() or {},
            }
        )
    return features

def feature_collection(features: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}

# ---------------------------
# Public convenience functions
# ---------------------------

def nodes_by_tag_in_bbox(
    bbox: Tuple[float, float, float, float],
    key: str,
    value: str,
) -> Dict[str, Any]:
    """
    Fetch nodes by tag in a bounding box and return GeoJSON.
    bbox = (south, west, north, east)
    """
    elements = fetch_nodes_by_tag(bbox=bbox, key=key, value=value)
    feats = elements_to_geojson_features(elements)
    return feature_collection(feats)
