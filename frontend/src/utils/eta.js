// utils/eta.js
import { matrix } from '@/api/mapboxProxy';

export function decimate(coords, step = 5) {
    if (!Array.isArray(coords) || coords.length <= 2) return coords || [];
    const out = [];
    for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
    const last = coords[coords.length - 1];
    if (out.length === 0 || out[out.length - 1] !== last) out.push(last);
    return out;
}

/**
 * Returns { times:number[], indices:number[] }
 * - times = epoch seconds for each sampled vertex (length = indices.length+1; includes start)
 * - indices = which original vertex each time corresponds to (destination of each leg)
 */
export async function computeETAsFromMatrix(routeCoords, opts = {}) {
    console.debug('[eta] computeETAsFromMatrix has been called');
    const coords = decimate(routeCoords, opts.sampleEvery ?? 5);
    if (coords.length < 2) {
        const t0 = Math.floor((opts.startEpoch ?? Date.now() / 1000));
        return { times: [t0], indices: [0] };
    }

    const points = coords.map(([lon, lat]) => ({ lon, lat }));
    const n = points.length;
    const sources = Array.from({ length: n - 1 }, (_, i) => i);
    const destinations = Array.from({ length: n - 1 }, (_, i) => i + 1);

    const res = await matrix({
        profile: opts.profile || 'driving',
        coordinates: points,
        sources, destinations
    });

    const legSecs = [];
    for (let i = 0; i < sources.length; i++) {
        const row = res?.durations?.[i] || [];
        legSecs.push(row[i] ?? 0);
    }

    const start = Math.floor(opts.startEpoch ?? Date.now() / 1000);
    const times = [start];
    for (let i = 0; i < legSecs.length; i++) {
        times.push(times[i] + (legSecs[i] || 0));
    }
    console.debug('[eta] computeETAsFromMatrix values: ', times, sources.map(i => i + 1));
    return { times, indices: sources.map(i => i + 1) };
}
