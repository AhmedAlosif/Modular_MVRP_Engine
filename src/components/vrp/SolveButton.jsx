// src/components/SolveButton.js
'use client';
import { useMemo } from 'react';
import useWaypointStore from '@/hooks/useWaypointStore';
import useFleetStore from '@/hooks/useFleetStore';
import useRouteStore from '@/hooks/useRouteStore';
import useUiStore from '@/hooks/useUIStore';
import { normalizeFleetForBackend } from '@/utils/normalizeFleetForBackend';
import { useDistanceMatrix, useSolve } from '@/hooks/useBackend';

/** Build pickup/delivery pairs from waypoints (indices into matrix order). */
function buildPickupDeliveryPairs(waypoints, depotIndex = 0) {
  const byId = new Map();
  waypoints.forEach((w, idx) => {
    if (idx === depotIndex) return;
    const pid = w.pairId ?? w.pair_id;
    if (pid == null) return;
    const role = String(w.type ?? '').toLowerCase();
    const rec = byId.get(pid) || {};
    if (role === 'pickup') rec.pickup = idx;
    if (role === 'delivery') rec.delivery = idx;
    byId.set(pid, rec);
  });
  return [...byId.values()]
    .filter(p => Number.isInteger(p.pickup) && Number.isInteger(p.delivery))
    .map(p => ({ pickup: p.pickup, delivery: p.delivery, quantity: 1 }));
}

/** Ensure durations exist if backend needs them (derive from distance @ ~50km/h). */
function ensureDurations(matrix) {
  if (matrix?.durations) return matrix;
  const distances = matrix?.distances || [];
  const avgMps = 13.9; // ~50 km/h
  const durations = distances.map(row => row.map(d => Math.round(Number(d || 0) / avgMps)));
  return { ...matrix, durations };
}

export default function SolveButton({ solver, adapter, vrpType }) {
  const waypoints = useWaypointStore(s => s.waypoints);
  const vehicles = useFleetStore(s => s.vehicles);

  const dm = useDistanceMatrix(); // POST /distance-matrix
  const solve = useSolve();       // POST /solver (ortools/pyomo/vroom)

  // Read selections (props override UI store)
  const selectedSolver = (solver ?? useUiStore.getState().solverEngine ?? 'ortools').toLowerCase();
  const selectedAdapter = (adapter ?? useUiStore.getState().routingAdapter ?? 'haversine').toLowerCase();
  const selectedVrpType = (vrpType ?? useUiStore.getState().vrpType ?? 'TSP').toUpperCase();

  // Coordinates in matrix order
  const coords = useMemo(
    () =>
      (waypoints || [])
        .map(w => {
          const [lng, lat] = w.coordinates || [];
          return { lat: Number(lat), lon: Number(lng) };
        })
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    [waypoints]
  );

  const n = coords.length;
  const depotIndex = 0;

  // Per-node defaults (kept simple so tests stay deterministic)
  const demands = Array.from({ length: n }, (_, i) => (i === depotIndex ? 0 : 1));
  const node_service_times = Array.from({ length: n }, () => 10);
  const node_time_windows = Array.from({ length: n }, () => [0, 24 * 3600]);

  // Vehicles → backend shape
  const { vehicles: backendVehicles } = normalizeFleetForBackend(vehicles, {
    defaultStart: depotIndex,
    defaultEnd: depotIndex,
  });
  const totalDemand = demands.reduce((a, b) => a + b, 0);
  const vehiclesArr =
    backendVehicles?.length
      ? backendVehicles
      : [{ id: 'veh-1', capacity: [Math.max(1, totalDemand)], start: depotIndex, end: depotIndex }];

  const toInt2D = m => (m || []).map(row => row.map(v => Math.round(Number(v || 0))));

  async function callMapboxOptimize(payload) {
    // Call your proxy (already implemented in mapboxProxy.js)
    const res = await fetch('/mapbox/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        body?.detail ||
        body?.message ||
        `Mapbox optimize failed (${res.status})`;
      throw new Error(msg);
    }
    return await res.json();
  }

  const onSolve = async () => {
    try {
      if (coords.length < 2) throw new Error('Add at least 2 waypoints');

      /* ──────────────────────────────────────────
         MAPBOX OPTIMIZER → /mapbox/optimize (no matrix)
         ────────────────────────────────────────── */
      if (selectedSolver === 'mapbox_optimizer') {
        // Waypoints MUST have { id, location: {lat, lon} }
        const wp = (waypoints || []).map((w, i) => {
          const [lng, lat] = w.coordinates || [];
          return {
            id: String(w.id ?? i),
            location: { lat: Number(lat), lon: Number(lng) },
            // Optional hints:
            demand: Number.isFinite(w?.demand) ? Number(w.demand) : undefined,
            service_time: Number.isFinite(w?.serviceTime) ? Number(w.serviceTime) : undefined,
            time_window: Array.isArray(w?.timeWindow) ? w.timeWindow : undefined,
          };
        });

        const fleetPayload = {
          vehicles: [
            {
              id: String(vehiclesArr?.[0]?.id ?? 'veh-1'),
              capacity: Array.isArray(vehiclesArr?.[0]?.capacity) ? vehiclesArr[0].capacity : [totalDemand || 1],
              start: depotIndex,
              end: depotIndex,
            },
          ],
        };

        const mbxPayload = {
          waypoints: wp,
          fleet: fleetPayload,
          roundtrip: true,
          depot_index: depotIndex,
          profile: 'driving',
          geometries: 'geojson',
          // If your proxy supports PD, uncomment next line:
          // ...(selectedVrpType === 'PD' ? { pickup_delivery_pairs: buildPickupDeliveryPairs(waypoints, depotIndex) } : {}),
        };

        if (typeof window !== 'undefined' && window.__E2E__) {
          window.__lastSolvePayload = { endpoint: '/mapbox/optimize', payload: mbxPayload };
        }

        const solveRes = await callMapboxOptimize(mbxPayload);
        const addSolution = useRouteStore.getState().addSolutionFromSolver;
        const currentWaypoints = useWaypointStore.getState().waypoints;
        addSolution(solveRes, currentWaypoints, {
          solver: selectedSolver,
          adapter: selectedAdapter,
          vrpType: selectedVrpType,
          id: `run-${Date.now()}`,
        });
        return;
      }

      /* ──────────────────────────────────────────
         VROOM → /solver (coordinate mode; no matrix)
         ────────────────────────────────────────── */
      if (selectedSolver === 'vroom') {
        const vroomWp = (waypoints || []).map((w, i) => ({
          id: String(w.id ?? i),
          location: { lat: Number(w.coordinates?.[1]), lon: Number(w.coordinates?.[0]) },
          demand: Number.isFinite(w?.demand) ? Number(w.demand) : 0,
          service_time: Number.isFinite(w?.serviceTime) ? Number(w.serviceTime) : 0,
          time_window: Array.isArray(w?.timeWindow) ? w.timeWindow : undefined,
        }));

        const vroomPayload = {
          solver: 'vroom',
          depot_index: depotIndex,
          waypoints: vroomWp,
          fleet: { vehicles: vehiclesArr },
          weights: { distance: 1, time: 0 },
        };

        if (typeof window !== 'undefined' && window.__E2E__) {
          window.__lastSolvePayload = { endpoint: '/solver', payload: vroomPayload };
        }

        const solveRes = await solve.mutateAsync(vroomPayload);
        const addSolution = useRouteStore.getState().addSolutionFromSolver;
        const currentWaypoints = useWaypointStore.getState().waypoints;
        addSolution(solveRes, currentWaypoints, {
          solver: selectedSolver,
          adapter: selectedAdapter,
          vrpType: selectedVrpType,
          id: `run-${Date.now()}`,
        });
        return;
      }

      /* ──────────────────────────────────────────
         ORTOOLS / PYOMO → /distance-matrix then /solver
         ────────────────────────────────────────── */
      const dmPayload = {
        adapter: selectedAdapter,          // << important: adapter must be on wire
        mode: 'driving',
        parameters: { metrics: ['distance', 'duration'], units: 'm' },
        origins: coords,
        destinations: coords,
      };
      const dmRes = await dm.mutateAsync(dmPayload);
      const matrixRaw = dmRes?.data?.matrix || dmRes?.matrix;
      if (!matrixRaw?.distances && !matrixRaw?.durations) {
        throw new Error('Distance matrix missing distances/durations');
      }

      // Normalize
      const matrixBase = {
        ...(Array.isArray(matrixRaw?.distances) ? { distances: toInt2D(matrixRaw.distances) } : {}),
        ...(Array.isArray(matrixRaw?.durations) ? { durations: toInt2D(matrixRaw.durations) } : {}),
      };

      const needsTime = ['VRPTW', 'PDPTW'].includes(selectedVrpType);
      const matrix = needsTime ? ensureDurations(matrixBase) : matrixBase;

      // Build solver payload (NO vrp_type here)
      const solvePayload = {
        solver: selectedSolver, // 'ortools' | 'pyomo'
        depot_index: depotIndex,
        fleet: vehiclesArr,     // list is accepted; proxy can wrap to {vehicles} if needed
        weights: { distance: 1, time: 0 },
        matrix,
      };

      if (selectedVrpType === 'CVRP') {
        solvePayload.demands = demands;
      } else if (selectedVrpType === 'VRPTW') {
        solvePayload.node_time_windows = node_time_windows;
        solvePayload.node_service_times = node_service_times;
      } else if (selectedVrpType === 'PDPTW') {
        solvePayload.node_time_windows = node_time_windows;
        solvePayload.node_service_times = node_service_times;
        solvePayload.pickup_delivery_pairs = buildPickupDeliveryPairs(waypoints, depotIndex);
        solvePayload.demands = demands;
      }
      // (TSP needs nothing beyond matrix)

      if (typeof window !== 'undefined' && window.__E2E__) {
        window.__lastSolvePayload = { endpoint: '/solver', payload: solvePayload };
      }

      const solveRes = await solve.mutateAsync(solvePayload);
      const addSolution = useRouteStore.getState().addSolutionFromSolver;
      const currentWaypoints = useWaypointStore.getState().waypoints;
      addSolution(solveRes, currentWaypoints, {
        solver: selectedSolver,
        adapter: selectedAdapter,
        vrpType: selectedVrpType,
        id: `run-${Date.now()}`,
      });
    } catch (e) {
      console.error('❌ solve failed', e);
      alert(e?.message || 'Solve failed');
    }
  };

  const disabled = dm.isPending || solve.isPending || waypoints.length < 2;

  return (
    <button
      data-testid="solve-btn"
      className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      onClick={onSolve}
      disabled={disabled}
      title={waypoints.length < 2 ? 'Add at least 2 waypoints' : 'Solve VRP'}
    >
      {dm.isPending || solve.isPending ? 'Solving…' : 'Solve'}
    </button>
  );
}
