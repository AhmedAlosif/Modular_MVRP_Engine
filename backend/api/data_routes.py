# api/osm_routes.py
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from data_acquisition.open_source.openstreetmap import (
    nodes_by_tag_in_bbox,
    nodes_by_tag_in_place,
    pois_by_tag_in_place,
)

router = APIRouter(prefix="/osm", tags=["osm"])

# -------------------------------------------
# 1) Backward-compatible: bbox-only (nodes)
# -------------------------------------------
@router.get("/pois")
def get_pois_bbox(
    south: float, west: float, north: float, east: float,
    key: str, value: str,
    regex: bool = Query(False),
    timeout: int = Query(120, ge=1, le=600),
):
    """
    Fetch POIs (nodes) by tag within a bounding box.
    NOTE: This returns *nodes only* (same behavior you had before).
    """
    return nodes_by_tag_in_bbox((south, west, north, east), key, value, regex=regex, timeout=timeout)

# -------------------------------------------
# 2) By place name (nodes + optional ways/relations)
# -------------------------------------------
@router.get("/pois/by-place")
def get_pois_place(
    place: str = Query(...),
    key: str = Query(...),
    value: str = Query(...),
    include_ways: bool = Query(True),
    include_relations: bool = Query(True),
    regex: bool = Query(False),
    timeout: int = Query(120, ge=1, le=600),
):
    """
    Fetch POIs by tag inside a named place (uses Nominatim → areaId).
    Ways/relations are returned as centroid points if included.
    """
    if not include_ways and not include_relations:
        # fast nodes-only path
        return nodes_by_tag_in_place(place, key, value, regex=regex, timeout=timeout)
    # full POIs (nodes + optional ways/relations as centroids)
    return pois_by_tag_in_place(place, key, value, include_ways=include_ways,
                                include_relations=include_relations, regex=regex, timeout=timeout)

# -------------------------------------------
# 3) Optional: single endpoint that accepts either place OR bbox
# -------------------------------------------
@router.get("/pois/auto")
def get_pois_auto(
    key: str,
    value: str,
    place: Optional[str] = Query(
        None, description="If provided, bbox parameters must be omitted."
    ),
    south: Optional[float] = None,
    west: Optional[float] = None,
    north: Optional[float] = None,
    east: Optional[float] = None,
    include_ways: bool = Query(True),
    include_relations: bool = Query(True),
    timeout: int = Query(120, ge=1, le=600),
):
    """
    Smart endpoint: provide either `place` OR all bbox params.
    - If `place` is given → returns nodes + optional ways/relations (centroids).
    - If bbox is given → returns nodes only (same as /osm/pois).
    """
    has_place = place is not None
    has_bbox = all(v is not None for v in (south, west, north, east))

    if has_place == has_bbox:
        raise HTTPException(
            status_code=400,
            detail="Provide either `place` OR (south, west, north, east).",
        )

    if has_place:
        return pois_by_tag_in_place(
            place=place,
            key=key,
            value=value,
            include_ways=include_ways,
            include_relations=include_relations,
            timeout=timeout,
        )

    # bbox path (nodes only)
    return nodes_by_tag_in_bbox(
        (south, west, north, east), key=key, value=value, timeout=timeout
    )
