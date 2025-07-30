'use client';
import { create } from "zustand";
import fitToFeatures from "@/components/fitToFeatures";

const useMapStore = create((set, get) => ({
  // Initial map state
  viewState: {
    longitude: 0,
    latitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  },

  GeojsonFiles: [],
  waypoints: [],
  waypointsVisible: true,
  addOnClickEnabled: false,
  hoveredFeature: null,

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
  setGeojsonFiles: (newFiles) => set({ GeojsonFiles: newFiles }),

  addGeojsonFile: (file) =>
    set((state) => ({
      GeojsonFiles: [...state.GeojsonFiles, file],
    })),

  removeGeojsonFile: (id) =>
    set((state) => ({
      GeojsonFiles: state.GeojsonFiles.filter(f => f.id !== id),
    })),

  toggleFileVisibility: (id) =>
    set((state) => ({
      GeojsonFiles: state.GeojsonFiles.map(f =>
        f.id === id ? { ...f, visible: !f.visible } : f
      )
    })),

  zoomToFile: (name) => {
    const file = get().GeojsonFiles.find((f) => f.name === name);
    if (!file?.data?.features?.length) return;

    const setViewState = get().setViewState;
    fitToFeatures(file.data.features, { setViewState });
  },
  // --- Map Click Control ---
  toggleAddOnClick: () =>
    set((state) => ({ addOnClickEnabled: !state.addOnClickEnabled })),

  // --- Hovered Feature ---
  setHoveredFeature: (feature) => set({ hoveredFeature: feature }),
  clearHoveredFeature: () => set({ hoveredFeature: null }),
}));

export default useMapStore;
