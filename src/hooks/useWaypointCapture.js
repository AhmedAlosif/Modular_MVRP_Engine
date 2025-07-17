import { useEffect, useState } from "react";

export function useWaypointCapture(mapRef, enabled = true) {
  const [waypoints, setWaypoints] = useState([]);

  useEffect(() => {
    if (!mapRef?.current || !enabled) return;

    const handleClick = (e) => {
      const lngLat = e.lngLat || e.lngLatWrap?.(); // Support Mapbox & MapLibre
      if (!lngLat) return;
      setWaypoints((prev) => [...prev, [lngLat.lng, lngLat.lat]]);
    };

    const map = mapRef.current;
    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, [mapRef, enabled]);

  const clearWaypoints = () => setWaypoints([]);

  return { waypoints, clearWaypoints };
}
