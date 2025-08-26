// utils/vrpMatrixFixes.js

const R = 6371000;
const toRad = d => (d * Math.PI) / 180;

export function haversineMeters(a, b) {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function durationsFromMeters(distances, speedKph = 40) {
  if (!Array.isArray(distances)) return null;
  const mps = (speedKph * 1000) / 3600;
  return distances.map(row => row.map(d => Math.round(Number(d || 0) / mps)));
}

/**
 * Repairs tiny off-diagonal distances (e.g., 0.06 km → 60 m) and fills durations if missing.
 * - If median(off-diagonal) < 1, assume kilometers and *1000 to meters.
 * - If all off-diagonals are zero but we have coords, rebuild via haversine.
 * - If durations missing, compute from (meters, 40 km/h).
 *
 * @param {{ distances:number[][], durations?:number[][] }} matrix
 * @param {Array<[number, number]>} coordsLL optional lon/lat array aligned with matrix rows
 * @returns same object (mutated) for convenience
 */
export function fixMatrixUnitsAndDurations(matrix, coordsLL) {
  if (!matrix || !Array.isArray(matrix.distances)) return matrix;
  const M = matrix.distances;
  const n = M.length;

  // 1) If it’s a tiny 2×2 and all off-diagonals are 0, try to rebuild from coords.
  const allZeros =
    n > 0 && M.every((row, i) => row.every((v, j) => (i === j ? v === 0 : Number(v) === 0)));

  if (allZeros && Array.isArray(coordsLL) && coordsLL.length === n) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        M[i][j] = (i === j) ? 0 : haversineMeters(coordsLL[i], coordsLL[j]);
      }
    }
  }

  // 2) If typical off-diagonal < 1, it’s likely kilometers → convert to meters.
  const off = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const v = Number(M[i][j]);
      if (Number.isFinite(v) && v > 0) off.push(v);
    }
  }
  if (off.length) {
    off.sort((a, b) => a - b);
    const median = off[Math.floor(off.length / 2)];
    if (median < 1) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          M[i][j] = Number(M[i][j]) * 1000; // km → m
        }
      }
    }
  }

  // 3) Ensure durations exist (seconds derived from meters @ 40km/h)
  if (!Array.isArray(matrix.durations)) {
    const dur = durationsFromMeters(M, 40);
    if (dur) matrix.durations = dur;
  }
  return matrix;
}

/**
 * VROOM expects TWs as objects {start,end}. Convert or strip if missing.
 */
export function normalizeTimeWindowsForVroom(node_time_windows) {
  if (!Array.isArray(node_time_windows)) return null;
  const any = node_time_windows.some(t => Array.isArray(t) && t.length === 2);
  if (!any) return null;
  return node_time_windows.map(t =>
    (Array.isArray(t) && t.length === 2)
      ? { start: Number(t[0]), end: Number(t[1]) }
      : null
  );
}
