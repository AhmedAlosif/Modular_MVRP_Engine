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
  setViewState: (next) => set({ viewState: next }),
  
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
  setGeojsonData: (geojson) => {
    set({ geojsonData: geojson });
  },
}));

export default useMapStore;
