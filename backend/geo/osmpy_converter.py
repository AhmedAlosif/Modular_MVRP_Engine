
import json
from pathlib import Path
from OSMPythonTools.element import Element
from OSMPythonTools.overpass import Overpass, overpassQueryBuilder

def osm_element_to_feature(element: Element) -> dict:
    """Convert OSMPythonTools Element to GeoJSON Feature."""
    if not element.lat() or not element.lon():
        return None

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [element.lon(), element.lat()]
        },
        "properties": element.tags() or {}
    }

def export_to_geojson(elements, out_path):
    """Export elements to a single standard GeoJSON file."""
    features = [osm_element_to_feature(el) for el in elements if osm_element_to_feature(el)]
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

def export_to_geojsonseq(elements, out_path):
    """Export elements to GeoJSONSeq / NDJSON format."""
    with open(out_path, 'w', encoding='utf-8') as f:
        for el in elements:
            feature = osm_element_to_feature(el)
            if feature:
                f.write(json.dumps(feature) + '\n')

# Optional: test function to fetch and export bus stops in NYC
if __name__ == '__main__':
    overpass = Overpass()
    query = overpassQueryBuilder(area='New York', elementType='node', selector='"highway"="bus_stop"', out='body')
    result = overpass.query(query)
    elements = result.elements()

    Path("exports").mkdir(exist_ok=True)
    export_to_geojson(elements, "exports/bus_stops.geojson")
    export_to_geojsonseq(elements, "exports/bus_stops.geojsonseq")
    print("Export complete.")