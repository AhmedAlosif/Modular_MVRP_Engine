"use client";
import { useMapLogic } from "@/hooks/useMapLogic";
import MapLibreComponent from "@/components/MapLibreComponent";
import FileUpload from "@/components/FileUpload";

export default function MapLibrePage() {
  const {
    viewState,
    setViewState,
    geojsonData,
    waypoints,
    handleMove,
    handleMapClick,
    handleGeojsonImport,
  } = useMapLogic();

  return (
    <div className="relative h-screen w-screen">
      <div className="absolute top-0 left-0 z-10 bg-white p-2">
        <FileUpload onImport={handleGeojsonImport} />
      </div>
      <MapLibreComponent
        viewState={viewState}
        onMove={handleMove}
        onClick={handleMapClick}
        geojsonData={geojsonData}
        waypoints={waypoints}
      />
    </div>
  );
}