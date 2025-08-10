# api/osm_routes.py
from fastapi import APIRouter
from data_acquisition.open_source.openstreetmap import nodes_by_tag_in_bbox

router = APIRouter(prefix="/osm", tags=["osm"])

@router.get("/pois")
def get_pois(
    south: float, west: float, north: float, east: float,
    key: str, value: str
):
    return nodes_by_tag_in_bbox((south, west, north, east), key, value)