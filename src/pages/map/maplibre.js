'use client';
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useWaypointCapture } from "@/hooks/useWaypointCapture";
import useMapStore from "@/hooks/useMapStore";
import MapComponent from "@/components/MapComponent";

const API_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;

export default function MapLibrePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const mapRef = { current: null }; // Shared ref if needed for other hooks (like waypoint capture)
  const { clearWaypoints } = useWaypointCapture(mapRef);

  // Zustand map state
  const handleGeojsonImport = useMapStore((s) => s.handleGeojsonImport);
  const waypointsVisible = useMapStore((s) => s.waypointsVisible);
  const viewState = useMapStore((state) => state.viewState);
  const setViewState = useMapStore((state) => state.setViewState);
  const addWaypoint = useMapStore((state) => state.addWaypoint);
  const toggleWaypointsVisible = useMapStore((state) => state.toggleWaypointsVisible);
  const waypoints = useMapStore((state) => state.waypoints);
  const removeWaypoint = useMapStore((s) => s.removeWaypoint);
  const moveWaypoint = useMapStore((s) => s.moveWaypoint);

  // Autocomplete search
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
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Search failed", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = (place) => {
    const lon = parseFloat(place.lon);
    const lat = parseFloat(place.lat);
    setViewState({ ...viewState, longitude: lon, latitude: lat, zoom: 14 });
    setSearchQuery(place.display_name || "");
    setSuggestions([]);
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
        onAddWaypoint={addWaypoint}
        onToggleVisibility={toggleWaypointsVisible}
        onRemoveWaypoint={removeWaypoint}
        onMoveWaypoint={moveWaypoint}
      />

      <div className="flex-1 relative overflow-visible">
        <MapComponent />
      </div>
    </div>
  );
}