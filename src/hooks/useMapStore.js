'use client';

import { create } from "zustand";
import { devtools } from 'zustand/middleware'

const useMapStore = create(devtools((set, get) => ({
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
  setViewState: (next) => {
    const prev = get().viewState;
    if (
      prev.longitude === next.longitude &&
      prev.latitude === next.latitude &&
      prev.zoom === next.zoom &&
      prev.pitch === next.pitch &&
      prev.bearing === next.bearing
    ) {
      return; // Prevent update loop
    }
    set({ viewState: next });
  },

  handleMapMove: (next) => {
    const prev = get().viewState;
    if (
      prev.longitude === next.longitude &&
      prev.latitude === next.latitude &&
      prev.zoom === next.zoom &&
      prev.pitch === next.pitch &&
      prev.bearing === next.bearing
    ) {
      return;
    }
    set({ viewState: next });
  },

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
    if (geojson && geojson.__fileNames) {
      console.log("Uploaded files:", geojson.__fileNames);
    }
    set({ geojsonData: geojson });
  },
})));

export default useMapStore;
