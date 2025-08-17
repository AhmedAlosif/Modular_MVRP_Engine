// utils/buildPayloadFromCaps.js
import { getVrpSpec } from './capabilityHelpers';

/**
 * Build a /solver payload strictly from the capabilities spec (required + optional present).
 * ctx should contain what you’ve already prepared:
 * {
 *   solver, vrpType,
 *   matrix: {distances?,durations?} | null,
 *   fleet: {vehicles:[...] } OR [...],
 *   depotIndex,
 *   waypoints, demands, node_time_windows, node_service_times,
 *   pickup_delivery_pairs, weights
 * }
 */
export function buildPayloadFromCaps(caps, ctx) {
  const { solver, vrpType } = ctx;
  const spec = getVrpSpec(caps, solver, vrpType);
  if (!spec) throw new Error(`Solver ${solver} does not support ${vrpType}`);

  const ensureFleet = () => {
    if (Array.isArray(ctx.fleet?.vehicles)) {
      if (ctx.fleet.vehicles.length >= 1) return { vehicles: ctx.fleet.vehicles };
    } else if (Array.isArray(ctx.fleet)) {
      if (ctx.fleet.length >= 1) return { vehicles: ctx.fleet };
    }
    // Fallback: single “big” vehicle
    return { vehicles: [{ id: 'veh-1', capacity: [Math.max(1, (ctx.demands||[]).reduce((a,b)=>a+(b||0),0))], start: ctx.depotIndex, end: ctx.depotIndex }] };
  };

  const payload = { solver, depot_index: ctx.depotIndex };
  const add = (k, v) => { if (v != null) payload[k] = v; };

  // Helper to include matrix parts (merge)
  const putMatrix = (part) => {
    const curr = payload.matrix || {};
    payload.matrix = { ...curr, ...part };
  };

  const includeToken = (tok) => {
    if (tok.includes('|')) {
      // prefer waypoints if present, else fall back to matrix
      const [a, b] = tok.split('|').map(s => s.trim());
      if (a === 'waypoints' && Array.isArray(ctx.waypoints) && ctx.waypoints.length) {
        includeToken('waypoints');
      } else if (b === 'matrix' && ctx.matrix) {
        // when token is 'matrix' alone, include both distances/durations if present
        if (ctx.matrix?.distances) putMatrix({ distances: ctx.matrix.distances });
        if (ctx.matrix?.durations) putMatrix({ durations: ctx.matrix.durations });
      }
      return;
    }

    switch (tok) {
      case 'matrix.distances':
        if (ctx.matrix?.distances) putMatrix({ distances: ctx.matrix.distances });
        break;
      case 'matrix.durations':
        if (ctx.matrix?.durations) putMatrix({ durations: ctx.matrix.durations });
        break;
      case 'matrix':
        if (ctx.matrix?.distances || ctx.matrix?.durations) {
          putMatrix({
            ...(ctx.matrix?.distances ? { distances: ctx.matrix.distances } : {}),
            ...(ctx.matrix?.durations ? { durations: ctx.matrix.durations } : {})
          });
        }
        break;
      case 'waypoints':
        if (Array.isArray(ctx.waypoints)) add('waypoints', ctx.waypoints);
        break;
      case 'fleet>=1':
      case 'fleet==1':
        add('fleet', ensureFleet());
        break;
      case 'demands':
        add('demands', ctx.demands);
        break;
      case 'node_time_windows':
        add('node_time_windows', ctx.node_time_windows);
        break;
      case 'node_service_times':
        add('node_service_times', ctx.node_service_times);
        break;
      case 'pickup_delivery_pairs':
        add('pickup_delivery_pairs', ctx.pickup_delivery_pairs);
        break;
      case 'weights':
        add('weights', ctx.weights);
        break;
      // depot_index already added
      default:
        break;
    }
  };

  // Required first (always include)
  spec.required.forEach(includeToken);
  // Optional only if present
  spec.optional.forEach((tok) => includeToken(tok));

  return payload;
}
