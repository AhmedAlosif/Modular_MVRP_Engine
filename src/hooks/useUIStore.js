'use client';
import { create } from 'zustand';

const useUiStore = create((set) => ({
  hoveredFeature: null,
  addOnClickEnabled: false,

  setHoveredFeature: (feature) => set({ hoveredFeature: feature }),
  clearHoveredFeature: () => set({ hoveredFeature: null }),

  toggleAddOnClick: () =>
    set((state) => ({ addOnClickEnabled: !state.addOnClickEnabled })),
}));

export default useUiStore;
