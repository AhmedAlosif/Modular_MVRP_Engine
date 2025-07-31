'use client';
import { create } from 'zustand';
import fitToFeatures from '@/components/fitToFeatures';
import useMapStore from '@/hooks/useMapStore';

const useVrpStore = create((set, get) => ({
  GeojsonFiles: [],

  setGeojsonFiles: (files) => set({ GeojsonFiles: files }),

  addGeojsonFile: (file) =>
    set((state) => ({
      GeojsonFiles: [...state.GeojsonFiles, file],
    })),

  removeGeojsonFile: (id) =>
    set((state) => ({
      GeojsonFiles: state.GeojsonFiles.filter((f) => f.id !== id),
    })),

  toggleFileVisibility: (id) =>
    set((state) => ({
      GeojsonFiles: state.GeojsonFiles.map((f) =>
        f.id === id ? { ...f, visible: !f.visible } : f
      ),
    })),

  zoomToFile: (name, setViewState) => {
    const file = get().GeojsonFiles.find((f) => f.name === name);
    if (!file?.data?.features?.length) return;
    fitToFeatures(file.data.features, { setViewState });
  },
}));

export default useVrpStore;
