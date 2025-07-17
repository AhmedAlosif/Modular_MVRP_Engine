"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Sidebar from "@/components/Sidebar";
import { useMapLogic } from "@/hooks/useMapLogic";
import { useWaypointCapture } from "@/hooks/useWaypointCapture";

const API_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;

export default function MapLibrePage() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const { waypoints, clearWaypoints } = useWaypointCapture(mapRef);

  const {
    viewState,
    waypointsVisible,
    toggleWaypointVisibility,
    removeWaypoint,
    moveWaypoint,
    addWaypoint,
    setWaypointsVisible,
    setWaypoints,
    handleMapLoad,
    handleMapMove,
    handleGeojsonImport,
    geojsonData,
  } = useMapLogic();

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
    });

    mapRef.current.on("load", () => {
      handleMapLoad(mapRef.current);
    });

    mapRef.current.on("moveend", () => handleMapMove(mapRef.current));

    return () => mapRef.current?.remove();
  }, [mapContainerRef]);

  // Handle input for search
  const handleSearchInput = async (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://api.locationiq.com/v1/autocomplete?key=${API_KEY}&q=${encodeURIComponent(
          value
        )}&limit=5&format=json`
      );
      const data = await response.json();
      setSuggestions(data || []);
    } catch (err) {
      console.error("Search failed", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Move to search result
  const handleResultClick = (place) => {
    const lon = parseFloat(place.lon);
    const lat = parseFloat(place.lat);
    mapRef.current.flyTo({ center: [lon, lat], zoom: 14 });
    setSearchQuery(place.display_name || "");
    setSuggestions([]);
  };

  const handleAddWaypoint = () => {
    // Default coordinates (center of map or placeholder)
    const newWaypoint = {
      id: Date.now(),
      coordinates: [viewState.longitude, viewState.latitude],
      demand: 1,
    };
    setWaypoints((prev) => [...prev, newWaypoint]);
  };

  const onAddWaypoint = () => {
    const newWaypoint = {
      id: Date.now(),
      coordinates: [viewState.longitude, viewState.latitude],
      demand: 1,
    };
    setWaypoints((prev) => [...prev, newWaypoint]);
  };

  return (
    <div className="flex h-screen">
      <Sidebar
        onImportGeojson={handleGeojsonImport}
        searchQuery={searchQuery}
        onSearchChange={handleSearchInput}
        suggestions={suggestions}
        loading={loading}
        onSuggestionClick={handleResultClick}
        waypoints={waypoints}
        waypointsVisible={waypointsVisible}
        onResetWaypoints={clearWaypoints}
        onToggleVisibility={toggleWaypointVisibility}
        onRemoveWaypoint={removeWaypoint}
        onMoveWaypoint={moveWaypoint}
        onAddWaypoint={addWaypoint}
        setWaypointsVisible={setWaypointsVisible}
        setWaypoints={setWaypoints}
      />

      <div className="flex-1 relative overflow-visible">
        <div ref={mapContainerRef} className="w-full h-full relative z-0" />
      </div>
    </div>
  );
}
