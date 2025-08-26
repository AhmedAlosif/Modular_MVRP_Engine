// src/utils/metrics.ts
export type M = {
  distanceMeters: number;
  durationSeconds: number;
  vehiclesUsed: number;
};

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
export function haversineMeters(a: number[], b: number[]) {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function computeRouteMetrics(route: any): M {
  const coords: number[][] =
    route?.displayCoords?.length ? route.displayCoords :
    route?.coords?.length ? route.coords : [];

  // distance by geometry if present
  let distance = 0;
  for (let i = 1; i < coords.length; i++) distance += haversineMeters(coords[i - 1], coords[i]);

  // duration from provided ETA if it matches path
  let duration = 0;
  if (Array.isArray(route?.etaRelative) && route.etaRelative.length >= 2) {
    duration = Math.max(0, route.etaRelative[route.etaRelative.length - 1]);
  } else if (Array.isArray(route?.etaEpoch) && route.etaEpoch.length >= 2) {
    duration = Math.max(0, (route.etaEpoch[route.etaEpoch.length - 1] - route.etaEpoch[0]));
  } else if (distance > 0) {
    // fallback: ~50km/h
    duration = distance / (50_000 / 3600);
  }

  // vehicles used (best-effort)
  const vehiclesUsed =
    Number(route?.meta?.vehiclesUsed) ||
    Number(route?.raw?.routes?.length) ||
    Number(route?.routes?.length) ||
    1;

  return { distanceMeters: distance, durationSeconds: duration, vehiclesUsed };
}

// ---- RUN TOTALS + GAP% ------------------------------------------------------

export type RunTotals = {
  distanceKm: number;
  durationMin: number;
  emissions: number;
  vehiclesUsed: number;
};

export function sumRouteTotals(routes: any[] = []): RunTotals {
  const totals = routes.reduce(
    (acc, r) => {
      acc.distanceKm += Number(r?.total_distance ?? 0);
      acc.durationMin += Number(r?.total_duration ?? 0);
      acc.emissions   += Number(r?.emissions ?? 0);
      return acc;
    },
    { distanceKm: 0, durationMin: 0, emissions: 0 }
  );

  // "vehicles used" = non-trivial routes (not just depot -> depot)
  const vehiclesUsed = routes.filter(r => {
    const ids = r?.waypoint_ids || [];
    if (ids.length <= 2) return false;
    const [first, last] = [ids[0], ids[ids.length - 1]];
    return !(ids.every(x => x === first) || (first === last && ids.length === 2));
  }).length;

  return { ...totals, vehiclesUsed };
}

export function computeGapPct(bestKnownKm?: number | null, ourKm?: number | null) {
  const b = Number(bestKnownKm);
  const o = Number(ourKm);
  if (!Number.isFinite(b) || b <= 0 || !Number.isFinite(o)) return null;
  return ((o - b) / b) * 100;
}

