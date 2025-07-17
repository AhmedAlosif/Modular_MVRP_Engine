"use client";

import { useState, useCallback } from "react";
import { DeckGL } from "@deck.gl/react";
import { Map } from "react-map-gl/maplibre";
import { ScatterplotLayer, GeoJsonLayer, TileLayer } from "@deck.gl/layers";
import maplibregl from "maplibre-gl";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export default function MapComponent({ geojsonFile, vrpInstanceFile }) {
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  });

  const [waypoints, setWaypoints] = useState([]);

  const handleMove = useCallback((evt) => {
    const newState = evt.viewState;
    setViewState((prev) => {
      const isSame = Object.keys(newState).every(
        (key) => newState[key] === prev[key]
      );
      return isSame ? prev : newState;
    });
  }, []);

  const handleMapClick = useCallback((event) => {
    const { lngLat } = event;
    setWaypoints((prev) => [...prev, { coordinates: lngLat }]);
  }, []);

  const waypointLayer = new ScatterplotLayer({
    id: "waypoints",
    data: waypoints,
    getPosition: (d) => d.coordinates,
    getFillColor: [255, 0, 0],
    getRadius: 10000,
    pickable: true,
  });

  const layers = [
    new 
    waypointLayer];

  return (
    <DeckGL
      viewState={viewState}
      controller={true}
      onMove={handleMove}
      onClick={handleMapClick}
      layers={[waypointLayer]}
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
