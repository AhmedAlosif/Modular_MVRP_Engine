"use client";

import { DeckGL } from "@deck.gl/react";
import { Map } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { useMapLogic } from "@/hooks/useMapLogic";
import Sidebar from "@/components/Sidebar";

const MAP_STYLE = "mapbox://styles/mapbox/streets-v11"; // Replace with your token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapboxPage() {
  const {
    viewState,
    setViewState,
    geojsonData,
    waypoints,
    handleMove,
    handleMapClick,
    handleGeojsonImport,
  } = useMapLogic();

  const layers = [
    geojsonData &&
      new GeoJsonLayer({
        id: "geojson-layer",
        data: geojsonData,
        filled: true,
        stroked: true,
        pointRadiusMinPixels: 4,
        getFillColor: [0, 128, 255, 100],
        getLineColor: [0, 0, 0, 200],
        pickable: true,
      }),
    new ScatterplotLayer({
      id: "waypoints",
      data: waypoints.map((w) => ({ position: w.coordinates })),
      getPosition: (d) => d.position,
      getRadius: 10000,
      getFillColor: [255, 0, 0, 160],
      pickable: true,
    }),
  ];

  return (
    <main className="relative h-screen w-screen bg-white dark:bg-black overflow-hidden">
      <Sidebar onImportGeojson={handleGeojsonImport} />
      <DeckGL
        initialViewState={viewState}
        controller={true}
        onClick={handleMapClick}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        layers={layers}
      >
        <Map reuseMaps mapLib={mapboxgl} mapStyle={MAP_STYLE} />
      </DeckGL>
    </main>
  );
}