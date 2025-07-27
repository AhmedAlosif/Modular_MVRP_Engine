'use client';
import { create } from "zustand";

const useMapStore = create((set, get) => ({
  // Initial map state
  viewState: {
    longitude: 0,
    latitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  },

  geojsonData: null,
  waypoints: [],
  waypointsVisible: true,

  // --- ViewState Actions ---
  setViewState: (viewState) => set({ viewState }),
  handleMapMove: (viewState) => set({ viewState }),

  // --- Waypoint Actions ---
  addWaypoint: (waypoint) =>
    set((state) => ({
      waypoints: [...state.waypoints, waypoint],
    })),

  setWaypoints: (wps) => set({ waypoints: wps }),

  resetWaypoints: () => set({ waypoints: [] }),

  removeWaypoint: (index) =>
    set((state) => ({
      waypoints: state.waypoints.filter((_, i) => i !== index),
    })),

  moveWaypoint: (index, direction) =>
    set((state) => {
      const newWaypoints = [...state.waypoints];
      const targetIndex = index + direction;

      if (
        newWaypoints.length < 2 ||
        index < 0 ||
        targetIndex < 0 ||
        targetIndex >= newWaypoints.length
      ) {
        return {};
      }

      [newWaypoints[index], newWaypoints[targetIndex]] = [
        newWaypoints[targetIndex],
        newWaypoints[index],
      ];

      return { waypoints: newWaypoints };
    }),

  toggleWaypointsVisible: () =>
    set((state) => ({ waypointsVisible: !state.waypointsVisible })),

  // --- GeoJSON Actions ---
  setGeojsonData: (geojson) => set({ geojsonData: geojson }),

  handleGeojsonImport: (file) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed || typeof parsed !== "object") throw new Error("Not a valid GeoJSON");

        set({ geojsonData: parsed });

        // 🧭 Auto-zoom to GeoJSON bounds
        if (parsed.features?.length) {
          const coords = parsed.features.flatMap((f) => {
            const g = f.geometry;
            if (!g) return [];

            switch (g.type) {
              case "Point":
                return [g.coordinates];
              case "LineString":
              case "MultiPoint":
                return g.coordinates;
              case "Polygon":
              case "MultiLineString":
                return g.coordinates.flat();
              case "MultiPolygon":
                return g.coordinates.flat(2);
              default:
                return [];
            }
          });

          const longitudes = coords.map((c) => c[0]).filter(Number.isFinite);
          const latitudes = coords.map((c) => c[1]).filter(Number.isFinite);

          if (longitudes.length && latitudes.length) {
            const bounds = {
              minLng: Math.min(...longitudes),
              maxLng: Math.max(...longitudes),
              minLat: Math.min(...latitudes),
              maxLat: Math.max(...latitudes),
            };

            const centerLng = (bounds.minLng + bounds.maxLng) / 2;
            const centerLat = (bounds.minLat + bounds.maxLat) / 2;

            set({
              viewState: {
                longitude: centerLng,
                latitude: centerLat,
                zoom: 10,
                pitch: 0,
                bearing: 0,
              },
            });
          }
        }
      } catch (err) {
        alert("Invalid GeoJSON: " + err.message);
        set({ geojsonData: null });
      }
    };

    reader.readAsText(file);
  },
}));

export default useMapStore;