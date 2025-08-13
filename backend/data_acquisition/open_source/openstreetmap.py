import time
from typing import Iterable, List, Optional, Tuple, Dict, Any
from OSMPythonTools.overpass import Overpass, overpassQueryBuilder
from OSMPythonTools.nominatim import Nominatim
from OSMPythonTools.element import Element

DEFAULT_TIMEOUT = 120
RATE_LIMIT_SLEEP = 1.0  # seconds between calls

nominatim = Nominatim()
overpass = Overpass()

def _sleep():
    time.sleep(RATE_LIMIT_SLEEP)

def city_to_area_id(city: str) -> int:
    _sleep()
    res = nominatim.query(city)
    area_id = res.areaId()
    if area_id is None:
        raise ValueError(f"Could not resolve areaId for city: {city}")
    return area_id

def query_overpass_raw(query: str, *, timeout: int = DEFAULT_TIMEOUT, date: Optional[str] = None):
    _sleep()
    return overpass.query(query, timeout=timeout, date=date)

def _build_selector(key: str, value: str, regex: bool = False) -> str:
    """
    Build the selector part for overpassQueryBuilder.
    - equality: "key"="value"
    - regex:    "key"~"pattern"
    - existence (value == "*"): "key"
    Also supports passing value starting with '~' (e.g. '~restaurant|cafe').
    """
    if value == "*":
        return f'"{key}"'
    if regex or value.startswith("~"):
        pattern = value[1:] if value.startswith("~") else value
        pattern = pattern.strip('"')
        return f'"{key}"~"{pattern}"'
    return f'"{key}"="{value}"'

def _normalize_key_value(key: str, value: str) -> tuple[str, str]:
    """
    Opinionated tweaks to reduce 'empty' results caused by common tag misunderstandings.
    """
    # Map amenity=bus_stop -> highway=bus_stop
    if key == "amenity" and value == "bus_stop":
        return "highway", "bus_stop"
    return key, value

def build_query_nodes_by_tag(
    *,
    area_id: Optional[int] = None,
    bbox: Optional[Tuple[float, float, float, float]] = None,  # (south, west, north, east)
    key: str,
    value: str,
    out: str = "body",
    regex: bool = False,
):
    if (area_id is None) == (bbox is None):
        raise ValueError("Provide exactly one of area_id or bbox.")

    key, value = _normalize_key_value(key, value)
    selector = _build_selector(key, value, regex=regex)

    return overpassQueryBuilder(
        area=area_id,
        bbox=bbox,
        elementType="node",
        selector=selector,
        out=out,
    )

def fetch_nodes_by_tag(
    *,
    area_id: Optional[int] = None,
    bbox: Optional[Tuple[float, float, float, float]] = None,
    key: str,
    value: str,
    timeout: int = DEFAULT_TIMEOUT,
    regex: bool = False,
) -> List[Element]:
    query = build_query_nodes_by_tag(area_id=area_id, bbox=bbox, key=key, value=value, regex=regex)
    res = query_overpass_raw(query, timeout=timeout)
    return res.elements()

def elements_to_geojson_features(elements: Iterable[Element]) -> List[Dict[str, Any]]:
    features: List[Dict[str, Any]] = []
    for el in elements:
        lat = el.lat()
        lon = el.lon()
        if lat is None or lon is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": el.tags() or {},
        })
    return features

def feature_collection(features: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}

def nodes_by_tag_in_bbox(
    bbox: Tuple[float, float, float, float],
    key: str,
    value: str,
    *,
    regex: bool = False,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    elements = fetch_nodes_by_tag(bbox=bbox, key=key, value=value, regex=regex, timeout=timeout)
    return feature_collection(elements_to_geojson_features(elements))

# Optional: by-place helpers

def nodes_by_tag_in_place(
    place: str,
    key: str,
    value: str,
    *,
    regex: bool = False,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    area_id = city_to_area_id(place)
    elements = fetch_nodes_by_tag(area_id=area_id, key=key, value=value, regex=regex, timeout=timeout)
    return feature_collection(elements_to_geojson_features(elements))

def pois_by_tag_in_place(
    place: str,
    key: str,
    value: str,
    *,
    include_ways: bool = True,
    include_relations: bool = True,
    regex: bool = False,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """
    Fetch nodes (always) and optionally way/relations (as centroids) for a place.
    """
    area_id = city_to_area_id(place)

    # Build raw QL because overpassQueryBuilder is limited for union queries
    selector = _build_selector(*_normalize_key_value(key, value), regex=regex)
    area_clause = f"area:{area_id}"

    parts = [f'node[{selector}]({area_clause});']
    if include_ways:
        parts.append(f'way[{selector}]({area_clause});')
    if include_relations:
        parts.append(f'relation[{selector}]({area_clause});')

    ql = f"""
[out:json][timeout:{timeout}];
(
  {"".join(parts)}
);
out center tags;
"""
    res = query_overpass_raw(ql, timeout=timeout)
    feats: List[Dict[str, Any]] = []
    for el in res.elements():
        lat = el.lat() or el.centerLat()
        lon = el.lon() or el.centerLon()
        if lat is None or lon is None:
            continue
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
            "properties": el.tags() or {},
        })
    return feature_collection(feats)
