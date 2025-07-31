'use client';
import { create } from 'zustand';

const useMapStore = create((set) => ({
  viewState: {
    longitude: 0,
    latitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  },
  setViewState: (next) => set({ viewState: next }),
}));

export default useMapStore;
