// SolveButton.js
'use client';
import { useMemo } from 'react';
import { useDistanceMatrix, useSolve } from '@/hooks/useBackend';
import useWaypointStore from '@/hooks/useWaypointStore';
import { normalizeFleetForBackend } from '@/utils/normalizeFleetForBackend';
import useFleetStore from '@/hooks/useFleetStore';
import useRouteStore from '@/hooks/useRouteStore';
import useUiStore from '@/hooks/useUIStore';

export default function SolveButton({ solver, adapter, vrpType }) {
    const waypoints = useWaypointStore(s => s.waypoints);
    const vehicles = useFleetStore(s => s.vehicles);

    const dm = useDistanceMatrix();
    const solve = useSolve();

    // Fallbacks if props aren’t provided (optional: read from UI store)
    const selectedSolver = solver ?? useUiStore.getState().solverEngine ?? 'ortools';
    const selectedAdapter = adapter ?? useUiStore.getState().routingAdapter ?? 'haversine';
    const selectedVrpType = vrpType ?? useUiStore.getState().vrpType ?? 'TSP';

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

    const demands = Array.from({ length: n }, (_, i) => i === depotIndex ? 0 : 1);
    const node_service_times = Array.from({ length: n }, () => 10);
    const node_time_windows = Array.from({ length: n }, () => [0, 24 * 3600]);

    const { vehicles: backendVehicles } = normalizeFleetForBackend(vehicles, { defaultStart: 0, defaultEnd: 0 });
    const toInt2D = (m) => m.map(row => row.map(v => Math.round(Number(v))));

    const onSolve = async () => {
        try {
            if (selectedSolver === 'vroom') {
                // Build waypoints payload
                const wp = waypoints.map((w, i) => ({
                    id: String(w.id ?? i),
                    lat: w.coordinates?.[1],
                    lon: w.coordinates?.[0],
                    demand: w.demand ?? 0,
                    service_time: w.serviceTime ?? 0,
                    time_window: Array.isArray(w.timeWindow) ? w.timeWindow : undefined,
                    depot: ((w.type || '').toLowerCase() === 'depot') || i === depotIndex
                }));

                // one-vehicle constraint for current backend vroom wrapper
                const vehId = String(vehicles?.[0]?.id ?? 'veh-1');
                const cap = Number(vehicles?.[0]?.capacity ?? 999999);

                const solvePayload = {
                    solver: 'vroom',
                    depot_index: depotIndex,
                    waypoints: wp,
                    fleet: { vehicles: [{ id: vehId, capacity: [cap], start: depotIndex, end: depotIndex }] },
                    weights: { distance: 1, time: 0 }
                };

                console.log('📤 /solver payload (vroom coord mode)', solvePayload);
                const solveRes = await solve.mutateAsync(solvePayload);

                const addSolutionFromSolver = useRouteStore.getState().addSolutionFromSolver;
                const currentWaypoints = useWaypointStore.getState().waypoints;
                addSolutionFromSolver(solveRes, currentWaypoints, {
                    solver: selectedSolver,
                    adapter: selectedAdapter,
                    vrpType: selectedVrpType,
                    id: `run-${Date.now()}`
                });
                return;
            }

            if (coords.length < 2) throw new Error('Add at least 2 waypoints');
            console.log('🔎 SOLVE DEBUG');
            console.log('Solver:', selectedSolver);
            console.log('VRP Type:', selectedVrpType);
            console.log('Adapter:', selectedAdapter);
            console.log('Depot:', depotIndex);

            // Build distance matrix
            const dmPayload = {
                adapter: selectedAdapter,
                origins: coords,
                destinations: coords,
                mode: 'driving'
            };
            console.log('➡️ /distance-matrix payload', dmPayload);
            const dmRes = await dm.mutateAsync(dmPayload);
            const matrixRaw = dmRes?.data?.matrix || dmRes?.matrix;
            if (!matrixRaw?.distances) throw new Error('No matrix.distances returned');
            console.log('matrix.distances shape:', [matrixRaw.distances.length, matrixRaw.distances[0]?.length]);

            // sanitize matrix
            const matrix = {
                distances: toInt2D(matrixRaw.distances),
                ...(Array.isArray(matrixRaw.durations) ? { durations: toInt2D(matrixRaw.durations) } : {})
            };

            // Vehicles: ensure at least one
            const totalDemand = demands.reduce((a, b) => a + b, 0);
            const defaultVehicle = {
                id: 'veh-1',
                capacity: [Math.max(1, totalDemand)],
                start: depotIndex,
                end: depotIndex
            };
            const fleetPayload = (backendVehicles && backendVehicles.length > 0)
                ? { vehicles: backendVehicles }
                : { vehicles: [defaultVehicle] };
            console.log('Fleet:', fleetPayload);

            // Solve payload (minimal)
            const solvePayload = {
                solver: selectedSolver,
                depot_index: depotIndex,
                fleet: fleetPayload,
                weights: { distance: 1, time: 0 }
            };

            // Add per-type fields
            if (selectedVrpType === 'TSP') {
                solvePayload.matrix = matrix;
            } else if (selectedVrpType === 'CVRP') {
                solvePayload.matrix = matrix;
                solvePayload.demands = demands;
            } else if (selectedVrpType === 'VRPTW') {
                solvePayload.matrix = matrix;
                solvePayload.node_time_windows = node_time_windows;
                solvePayload.node_service_times = node_service_times;
            } else if (selectedVrpType === 'PDPTW') {
                solvePayload.matrix = matrix;
                solvePayload.node_time_windows = node_time_windows;
                solvePayload.node_service_times = node_service_times;
                // add your pickup_delivery_pairs here if applicable
            }

            console.log('📤 /solver payload', solvePayload);
            const solveRes = await solve.mutateAsync(solvePayload);
            console.log('📥 /solver response', solveRes);

            const addSolutionFromSolver = useRouteStore.getState().addSolutionFromSolver;
            const currentWaypoints = useWaypointStore.getState().waypoints;
            addSolutionFromSolver(solveRes, currentWaypoints, {
                solver: selectedSolver,
                adapter: selectedAdapter,
                vrpType: selectedVrpType,
                id: `run-${Date.now()}`
            });

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
