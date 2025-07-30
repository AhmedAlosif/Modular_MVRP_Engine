'use client';
import { useCallback, useMemo } from "react";
import { DeckGL } from "@deck.gl/react";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import useMapStore from "@/hooks/useMapStore";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export default function MapComponent() {
  const {
    waypoints,
    geojsonData,
    addWaypoint,
    viewState,
    setViewState,
    waypointsVisible,
  } = useMapStore();

  const handleMapClick = useCallback((event) => {
    const coords = event?.coordinate || event?.lngLat;
    if (!coords) return;

    const [lng, lat] = coords;
    addWaypoint({
      coordinates: [lng, lat],
      id: Date.now(),
      demand: 1,
    });
  }, [addWaypoint]);
  
  const waypointLayer = useMemo(() => {
    if (!waypointsVisible || waypoints.length === 0) return null;

    return new ScatterplotLayer({
      id: "waypoints",
      data: waypoints,
      getPosition: (d) => d.coordinates,
      getFillColor: [255, 0, 0],
      getRadius: 10,
      pickable: true,
      radiusMinPixels: 5,
      radiusMaxPixels: 15,
      updateTriggers: {
        getPosition: waypoints,
      },
    });
  }, [waypoints, waypointsVisible]);

  const geojsonLayer = useMemo(() => {
    if (!geojsonData || !geojsonData.features?.length) return null;
    return new GeoJsonLayer({
      id: "geojson-layer",
      data: geojsonData,
      pickable: true,
      stroked: true,
      filled: true,
      lineWidthScale: 2,
      lineWidthMinPixels: 1,
      getLineColor: [0, 0, 200],
      getFillColor: [0, 200, 100, 80],
      getRadius: 100,
      getLineWidth: 2,
    });
  }, [geojsonData]);

  return (
    <DeckGL
      viewState={viewState}
      controller={true}
      onViewStateChange={({ viewState: next }) => setViewState(next)}
      onClick={handleMapClick}
      layers={[waypointLayer, geojsonLayer].filter(Boolean)}
      style={{ position: "absolute", top: 0, bottom: 0, width: "100%" }}
    >
      <Map
        mapLib={maplibregl}
        mapStyle={MAP_STYLE}
        {...viewState}
      />
    </DeckGL>
  );
}