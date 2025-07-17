"use client";

import { DeckGL } from "@deck.gl/react";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { useMapLogic } from "@/hooks/useMapLogic";
import Sidebar from "@/components/Sidebar";

const MAP_STYLE = "http://localhost:8080/styles/basic/style.json"; // Change to your OpenMapTiles server

export default function OpenMapTilesPage() {
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
        <Map reuseMaps mapLib={maplibregl} mapStyle={MAP_STYLE} />
      </DeckGL>
    </main>
  );
}