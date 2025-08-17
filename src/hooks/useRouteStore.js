// hooks/useRouteStore.js
'use client';
import { create } from 'zustand';

const clamp = (i, n) => Math.max(0, Math.min(Math.max(0, n - 1), i));

const useRouteStore = create((set, get) => ({
  routes: [],        // [{ coords, totalDistance, totalDuration, emissions, meta:{solver,adapter,vrpType,id}, raw }]
  summary: null,     // { label, totalDistance, totalDuration, vehiclesUsed, routeCount }
  currentIndex: 0,

  setIndex: (i) => {
    const n = get().routes.length;
    set({ currentIndex: clamp(i, n) });
  },

  clearAllRoutes: () => set({ routes: [], summary: null, currentIndex: 0 }),

  removeRouteAt: (i) => {
    const { routes } = get();
    if (!routes.length) return;
    const idx = clamp(i, routes.length);
    const nextRoutes = routes.filter((_, k) => k !== idx);
    const nextIndex  = clamp(idx, nextRoutes.length);

    const totalDistance = nextRoutes.reduce((s, r) => s + (r.totalDistance || 0), 0);
    const totalDuration = nextRoutes.reduce((s, r) => s + (r.totalDuration || 0), 0);
    const vehiclesUsed  = nextRoutes.filter(r => (r.coords?.length ?? 0) > 1).length || nextRoutes.length;
    const summary = nextRoutes.length
      ? { label: 'Best Route', totalDistance, totalDuration, vehiclesUsed, routeCount: nextRoutes.length }
      : null;

    set({ routes: nextRoutes, currentIndex: nextIndex, summary });
  },

  /** Append a solver result and recompute summary */
  addSolutionFromSolver: (solveRes, waypoints = [], meta = {}) => {
    const routesRaw = solveRes?.data?.routes ?? solveRes?.routes ?? [];
    if (!Array.isArray(routesRaw) || routesRaw.length === 0) return;

    // Build lookup: id -> coords, idx -> coords
    const idToCoord = new Map();
    const idxToCoord = new Map();
    waypoints.forEach((wp, idx) => {
      if (Array.isArray(wp.coordinates)) {
        idToCoord.set(String(wp.id), wp.coordinates);
        idxToCoord.set(idx, wp.coordinates);
      }
    });

    const normalized = routesRaw.map((r, ri) => {
      const ids = Array.isArray(r.waypoint_ids) ? r.waypoint_ids : [];
      const coords = ids.map(idOrIdx => {
        if (idToCoord.has(String(idOrIdx))) return idToCoord.get(String(idOrIdx));
        const asNum = Number(idOrIdx);
        if (Number.isFinite(asNum) && idxToCoord.has(asNum)) return idxToCoord.get(asNum);
        return null;
      }).filter(Boolean);

      return {
        index: ri,
        vehicleId: r.vehicle_id ?? `veh-${ri + 1}`,
        waypointIds: ids,
        coords,
        totalDistance: Number(r.total_distance ?? 0),
        totalDuration: Number(r.total_duration ?? 0),
        emissions: Number(r.emissions ?? 0),
        raw: r,
        meta: {
          solver:  meta.solver  ?? 'unknown',
          adapter: meta.adapter ?? 'unknown',
          vrpType: meta.vrpType ?? 'unknown',
          id:      meta.id      ?? `run-${Date.now()}-${ri}`
        }
      };
    });

    const merged = [...get().routes, ...normalized];
    const totalDistance = merged.reduce((s, r) => s + (r.totalDistance || 0), 0);
    const totalDuration = merged.reduce((s, r) => s + (r.totalDuration || 0), 0);
    const vehiclesUsed  = merged.filter(r => (r.coords?.length ?? 0) > 1).length || merged.length;
    const summary = { label: 'Best Route', totalDistance, totalDuration, vehiclesUsed, routeCount: merged.length };

    set({ routes: merged, summary, currentIndex: merged.length - 1 });
  }
}));

export default useRouteStore;
