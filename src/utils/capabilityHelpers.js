export function getSolverSpec(caps, solverName) {
    const root = caps?.data ?? caps;              // accept either shape
    const list = root?.solvers;
    if (!Array.isArray(list)) return null;
    return list.find(s => s.name === solverName) || null;
}

export function getVrpSpec(caps, solverName, vrpType) {
    const solver = getSolverSpec(caps, solverName);
    return solver?.vrp_types?.[vrpType] ?? null;
}

export function evaluateRequirements(tokens, ctx) {
    return (tokens || []).map(token => ({ token, ok: testToken(token, ctx) }));
}

function testToken(token, ctx) {
    switch (token) {
        case 'matrix.distances': return !!ctx?.matrix?.distances;
        case 'matrix.durations': return !!ctx?.matrix?.durations;
        case 'fleet>=1': return Array.isArray(ctx?.fleet?.vehicles) && ctx.fleet.vehicles.length >= 1;
        case 'fleet==1': return Array.isArray(ctx?.fleet?.vehicles) && ctx.fleet.vehicles.length === 1;
        case 'depot_index': return Number.isInteger(ctx?.depotIndex);
        case 'demands': return Array.isArray(ctx?.demands) && ctx.demands.length > 0;
        case 'node_service_times': return Array.isArray(ctx?.node_service_times) && ctx.node_service_times.length > 0;
        case 'node_time_windows': return Array.isArray(ctx?.node_time_windows) && ctx.node_time_windows.length > 0
            && Array.isArray(ctx.node_time_windows[0]);
        case 'pickup_delivery_pairs': return Array.isArray(ctx?.pickup_delivery_pairs) && ctx.pickup_delivery_pairs.length > 0;
        case 'weights': return !!ctx?.weights;
        case 'waypoints|matrix': return (Array.isArray(ctx?.waypoints) && ctx.waypoints.length > 0) || !!ctx?.matrix;
        default: return false;
    }
}
