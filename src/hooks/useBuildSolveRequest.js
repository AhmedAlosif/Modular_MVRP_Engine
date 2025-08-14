// /hooks/useBuildSolveRequest.js
import useWaypointStore from '@/hooks/useWaypointStore';
import useFleetStore from '@/hooks/useFleetStore';

// Helper: index of depot or 0
function getDepotIndex(waypoints) {
  const idx = waypoints.findIndex(
    (w) => (w.type || '').toLowerCase() === 'depot'
  );
  return idx >= 0 ? idx : 0;
}

export default function useBuildSolveRequest() {
  const waypoints = useWaypointStore((s) => s.waypoints);
  const fleetRaw = useFleetStore((s) => s.fleet || s.vehicles || []);

  return function build({ solver = 'ortools', matrix = null, weights = {} }) {
    // Normalize fleet shape
    const fleet =
      Array.isArray(fleetRaw) ? fleetRaw : fleetRaw?.vehicles || [];

    const depot_index = getDepotIndex(waypoints);

    const payload = { solver, weights, depot_index };

    if (solver === 'vroom' && !matrix) {
      // Coordinate mode for VROOM
      payload.fleet = fleet;
      payload.waypoints = waypoints.map((w, i) => ({
        id: String(w.id ?? i),
        lat: w.coordinates?.[1],
        lon: w.coordinates?.[0],
        demand: w.demand ?? 0,
        service_time: w.serviceTime ?? 0,
        time_window: Array.isArray(w.timeWindow) ? w.timeWindow : undefined,
        depot: (w.type || '').toLowerCase() === 'depot',
      }));
      return payload;
    }

    // OR-Tools / Pyomo expect a matrix + per-node arrays
    if (!matrix) {
      throw new Error(
        "Matrix is required for 'ortools'/'pyomo' (or use 'vroom' with waypoints)."
      );
    }

    payload.matrix = matrix;
    payload.fleet = fleet;

    payload.demands = waypoints.map((w) => w.demand ?? 0);
    payload.node_service_times = waypoints.map((w) => w.serviceTime ?? 0);
    payload.node_time_windows = waypoints.map((w) =>
      Array.isArray(w.timeWindow) ? w.timeWindow : [0, 24 * 3600]
    );

    // Optional: pickup/delivery pairs (by pairId)
    const pairs = [];
    const byPair = new Map();
    waypoints.forEach((w, idx) => {
      if (w.pairId != null) {
        if (!byPair.has(w.pairId)) byPair.set(w.pairId, []);
        byPair.get(w.pairId).push({ w, idx });
      }
    });
    for (const [pairId, arr] of byPair) {
      if (arr.length === 2) {
        const [a, b] = arr;
        const aIsPickup = (a.w.type || '').toLowerCase() === 'pickup';
        const pickup = aIsPickup ? a.idx : b.idx;
        const delivery = aIsPickup ? b.idx : a.idx;
        pairs.push({
          pickup,
          delivery,
          quantity: a.w.demand ?? b.w.demand ?? 0,
        });
      }
    }
    if (pairs.length) payload.pickup_delivery_pairs = pairs;

    return payload;
  };
}
