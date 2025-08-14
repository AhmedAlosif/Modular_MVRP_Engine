// utils/normalizeFleetForBackend.js
export function normalizeFleetForBackend(frontendFleet = [], { defaultStart = 0, defaultEnd = 0 } = {}) {
  // Accept either an array of vehicles or { vehicles: [...] }
  const vehiclesArray = Array.isArray(frontendFleet)
    ? frontendFleet
    : Array.isArray(frontendFleet?.vehicles) ? frontendFleet.vehicles : [];

  const vehicles = vehiclesArray.map((v, i) => {
    const id = String(v.id ?? `veh-${i + 1}`);
    // OR-Tools expects capacity as a vector (even if single-dimensional)
    const capacityArr = Array.isArray(v.capacity) ? v.capacity
                      : (v.capacity != null ? [Number(v.capacity)] : [0]);

    // Optional fields—only include if provided
    const vehicle = {
      id,
      capacity: capacityArr,
      start: Number.isFinite(v.start) ? v.start : defaultStart,
      end:   Number.isFinite(v.end)   ? v.end   : defaultEnd
    };

    if (v.time_window && Array.isArray(v.time_window) && v.time_window.length === 2) {
      vehicle.time_window = v.time_window.map(Number);
    }
    if (Number.isFinite(v.speed)) vehicle.speed = Number(v.speed);
    if (Number.isFinite(v.emissions_per_km)) vehicle.emissions_per_km = Number(v.emissions_per_km);

    return vehicle;
  });

  return { vehicles };
}
