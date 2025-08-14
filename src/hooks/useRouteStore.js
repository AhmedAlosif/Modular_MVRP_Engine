'use client';
import { create } from 'zustand';

/**
 * Expected backend shapes handled here:
 * - { status, data: { routes: [...] } }
 * - { routes: [...] }
 * Each route item expected like:
 *   { vehicle_id, waypoint_ids: ["0","2","1","0"], total_distance, total_duration, emissions? }
 */
const useRouteStore = create((set, get) => ({
  routes: [],
  summary: null,
  currentIndex: 0,

  setIndex: (i) => {
    const { routes } = get();
    const clamped = Math.max(0, Math.min((routes.length || 1) - 1, i));
    set({ currentIndex: clamped });
  },

  clearRoutes: () => set({ routes: [], summary: null, currentIndex: 0 }),

  /** Normalize solver response and compute a summary */
  setRoutesFromSolver: (solveRes, waypoints = []) => {
    // Robustly extract routes array
    const routes =
      solveRes?.data?.routes ??
      solveRes?.routes ??
      [];

    if (!Array.isArray(routes) || routes.length === 0) {
      console.warn('useRouteStore: no routes found in solver response', solveRes);
      set({ routes: [], summary: null, currentIndex: 0 });
      return;
    }

    // Build a lookup of waypoint id -> coords and index
    // Waypoints in your app look like { id, coordinates:[lng,lat], ... }
    const idToCoord = new Map();
    const idxToCoord = new Map();
    waypoints.forEach((wp, idx) => {
      if (wp && Array.isArray(wp.coordinates)) {
        idToCoord.set(String(wp.id), wp.coordinates);
        idxToCoord.set(idx, wp.coordinates);
      }
    });

    // Map each route into a richer structure including coordinates
    const normalized = routes.map((r, ri) => {
      const ids = Array.isArray(r.waypoint_ids) ? r.waypoint_ids : [];
      const coords = ids.map((idOrIdx) => {
        // try id-first
        if (idToCoord.has(String(idOrIdx))) return idToCoord.get(String(idOrIdx));
        // fallback: numeric index
        const asNum = Number(idOrIdx);
        if (Number.isFinite(asNum) && idxToCoord.has(asNum)) return idxToCoord.get(asNum);
        return null;
      }).filter(Boolean); // drop unknowns safely

      return {
        index: ri,
        vehicleId: r.vehicle_id ?? `veh-${ri + 1}`,
        waypointIds: ids,
        coords, // array of [lng,lat]
        totalDistance: Number(r.total_distance ?? 0),
        totalDuration: Number(r.total_duration ?? 0),
        emissions: Number(r.emissions ?? 0),
        raw: r
      };
    });

    // Summary across all routes
    const totalDistance = normalized.reduce((s, r) => s + (r.totalDistance || 0), 0);
    const totalDuration = normalized.reduce((s, r) => s + (r.totalDuration || 0), 0);
    const vehiclesUsed = normalized.filter(r => (r.coords?.length ?? 0) > 1).length || normalized.length;

    const summary = {
      label: 'Best Route',
      totalDistance,
      totalDuration,
      vehiclesUsed,
      routeCount: normalized.length
    };

    set({ routes: normalized, summary, currentIndex: 0 });

    // Helpful debug
    console.log('✅ useRouteStore.setRoutesFromSolver -> routes:', normalized);
    console.log('✅ useRouteStore.setRoutesFromSolver -> summary:', summary);
  }
}));

export default useRouteStore;
