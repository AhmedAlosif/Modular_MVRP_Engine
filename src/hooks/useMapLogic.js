import { useState, useCallback } from "react";

export function useMapLogic() {
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  });

  const [geojsonData, setGeojsonData] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [waypointsVisible, setWaypointsVisible] = useState(true);
  const [newWaypoint, setNewWaypoint] = useState("");

  const handleMapMove = useCallback((evt) => {
    const newState = evt?.viewState;
    if (!newState) {
      console.warn("No viewState available in map move event", evt);
      return;
    }

    setViewState((prev) =>
      Object.keys(newState).every((key) => newState[key] === prev[key])
        ? prev
        : newState
    );
  }, []);

  const handleMapClick = useCallback((event) => {
    const { lngLat } = event;
    const newWaypoint = {
      id: Date.now(),
      coordinates: lngLat,
      demand: 1, // default values
    };
    setWaypoints((prev) => [...prev, { coordinates: lngLat }]);
  }, []);

  const handleGeojsonImport = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        setGeojsonData(parsed);
      } catch (err) {
        alert("Invalid GeoJSON file");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleMapLoad = (mapInstance) => {
    if (geojsonData) {
      mapInstance.addSource("geojson", {
        type: "geojson",
        data: geojsonData,
      });

      mapInstance.addLayer({
        id: "geojson-layer",
        type: "fill",
        source: "geojson",
        paint: {
          "fill-color": "#088",
          "fill-opacity": 0.5,
        },
      });
    }
  };

  // --- Waypoint control functions ---

  const clearWaypoints = () => setWaypoints([]);
  const toggleWaypointVisibility = () =>
    setWaypointsVisible((prev) => !prev);

  const removeWaypoint = (index) =>
    setWaypoints((prev) => prev.filter((_, i) => i !== index));

  const moveWaypoint = (index, direction) =>
    setWaypoints((prev) => {
      const updated = [...prev];
      const target = index + direction;
      if (target < 0 || target >= updated.length) return prev;
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });

  const addWaypoint = ([lng, lat]) => {
    setWaypoints((prev) => [...prev, { coordinates: [lng, lat] }]);
  };

  return {
    viewState,
    setViewState,
    geojsonData,
    waypoints,
    waypointsVisible,
    newWaypoint,
    setNewWaypoint,
    handleMapMove,
    handleMapClick,
    handleGeojsonImport,
    handleMapLoad,
    setWaypointsVisible,
    clearWaypoints,
    toggleWaypointVisibility,
    removeWaypoint,
    moveWaypoint,
    addWaypoint,
  };
}