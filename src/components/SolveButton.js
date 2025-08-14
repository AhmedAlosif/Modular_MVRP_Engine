'use client';
import { useMemo } from 'react';
import { useDistanceMatrix, useSolve } from '@/hooks/useBackend';
import useWaypointStore from '@/hooks/useWaypointStore';
import { normalizeFleetForBackend } from '@/utils/normalizeFleetForBackend';
import useFleetStore from '@/hooks/useFleetStore';
import useRouteStore from '@/hooks/useRouteStore';

export default function SolveButton() {
  const waypoints = useWaypointStore(s => s.waypoints);
  const vehicles = useFleetStore(s => s.vehicles);

  const dm = useDistanceMatrix();
  const solve = useSolve();

  const coords = useMemo(
    () => waypoints
      .map(w => {
        const [lng, lat] = w.coordinates || [];
        return { lat: Number(lat), lon: Number(lng) };
      })
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)),
    [waypoints]
  );

  const n = coords.length;
  const depotIndex = 0;

  // simple demo data; plug in your real values if you have them
  const demands = Array.from({ length: n }, (_, i) => i === depotIndex ? 0 : 1);
  const node_service_times = Array.from({ length: n }, () => 10);
  const node_time_windows = Array.from({ length: n }, () => [0, 24 * 3600]);

  const { vehicles: backendVehicles } = normalizeFleetForBackend(vehicles, { defaultStart: 0, defaultEnd: 0 });

  const onSolve = async () => {
    try {
      if (coords.length < 2) throw new Error('Add at least 2 waypoints');
      console.log('▶️ starting solve, #waypoints=', waypoints.length, { waypoints, coords });

      // 1) Distance matrix
      const dmPayload = { adapter: 'haversine', origins: coords, destinations: coords, mode: 'driving' };
      console.log('📤 /distance-matrix payload', dmPayload);
      const dmRes = await dm.mutateAsync(dmPayload);
      console.log('📥 /distance-matrix response', dmRes);

      const matrixRaw = dmRes?.data?.matrix || dmRes?.matrix;
      if (!matrixRaw?.distances) throw new Error('No matrix.distances returned');

      const toInt2D = (m) => m.map(row => row.map(v => Math.round(Number(v))));
      const matrix = {
        distances: toInt2D(matrixRaw.distances),
        ...(Array.isArray(matrixRaw?.durations) ? { durations: toInt2D(matrixRaw.durations) } : {})
      };

      const totalDemand = demands.reduce((a, b) => a + b, 0);
      const defaultVehicle = { id: 'veh-1', capacity: [Math.max(1, totalDemand)], start: depotIndex, end: depotIndex };
      const fleetPayload = (backendVehicles && backendVehicles.length > 0)
        ? { vehicles: backendVehicles }
        : { vehicles: [defaultVehicle] };

      const solvePayload = {
        solver: 'ortools',
        matrix,
        depot_index: depotIndex,
        fleet: fleetPayload,
        demands,
        node_service_times,
        node_time_windows,
        weights: { distance: 1.0, time: 0.0 }
      };

      const setRoutesFromSolver = useRouteStore.getState().setRoutesFromSolver;
      const latestWaypoints = useWaypointStore.getState().waypoints; console.log('📤 /solver payload', solvePayload);
      const solveRes = await solve.mutateAsync(solvePayload);
      console.log('📥 /solver response', solveRes);

      setRoutesFromSolver(solveRes, latestWaypoints);
      alert('Solve OK — check console for details');
    } catch (e) {
      console.error('❌ solve failed', e);
      alert(e?.message || 'Solve failed');
    }
  };

  const disabled = dm.isPending || solve.isPending || waypoints.length < 2;

  return (
    <button
      className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
      onClick={onSolve}
      disabled={disabled}
      title={waypoints.length < 2 ? 'Add at least 2 waypoints' : 'Solve VRP'}
    >
      {dm.isPending || solve.isPending ? 'Solving…' : 'Solve'}
    </button>
  );
}
