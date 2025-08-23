// src/utils/capabilityHelpers.ts

export type VrpTypeSpec = {
    required?: string[];
    optional?: string[];
    [k: string]: any;
};

export type SolverSpec = {
    name?: string; // present when caps.data.solvers is an array
    vrp_types?: Record<string, VrpTypeSpec>;
    [k: string]: any;
};

export type Capabilities =
    | { solvers?: Record<string, SolverSpec>; vrp_specs?: Record<string, SolverSpec>;[k: string]: any }
    | { data?: { solvers?: SolverSpec[]; vrp_specs?: Record<string, SolverSpec> };[k: string]: any }
    | Record<string, SolverSpec>;

// ───────────────────────────────────────────────────────────────────────────────
// Find solver spec regardless of shape (object map or array under data.solvers)
// ───────────────────────────────────────────────────────────────────────────────
function lookupInsensitive<T = any>(obj: Record<string, any> | undefined, name: string): T | null {
    if (!obj) return null;
    if (name in obj) return obj[name] as T; // exact match fast path
    const low = String(name).toLowerCase();
    for (const k of Object.keys(obj)) {
        if (k.toLowerCase() === low) return obj[k] as T;
    }
    return null;
}

function toLowerKeyMap<T = any>(arr: Array<T & { name?: string }>) {
    const out: Record<string, T> = {};
    for (const item of arr || []) {
        const k = String(item?.name ?? '').toLowerCase();
        if (k) out[k] = item as T;
    }
    return out;
}

export function getSolverSpec(caps: any, solverName: string): SolverSpec | null {
    if (!caps || !solverName) return null;
    const want = solverName.toLowerCase();

    // 1) keyed objects first
    const s1 = lookupInsensitive<SolverSpec>(caps.solvers, solverName);
    if (s1?.vrp_types) return s1;

    const s2 = lookupInsensitive<SolverSpec>(caps?.data?.solvers, solverName);
    if (s2?.vrp_types) return s2;

    // 2) prefer vrp_specs (richer data)
    const v1 = lookupInsensitive<SolverSpec>(caps?.vrp_specs, solverName);
    if (v1) return v1;

    const v2 = lookupInsensitive<SolverSpec>(caps?.data?.vrp_specs, solverName);
    if (v2) return v2;

    // 3) arrays: map by name, then upgrade to vrp_specs if needed
    if (Array.isArray(caps?.solvers)) {
        const by = toLowerKeyMap<SolverSpec>(caps.solvers);
        const cand = by[want];
        if (cand?.vrp_types) return cand;

        const upgrade =
            lookupInsensitive<SolverSpec>(caps?.vrp_specs, solverName) ??
            lookupInsensitive<SolverSpec>(caps?.data?.vrp_specs, solverName);
        if (upgrade) return upgrade;
        if (cand) return cand;
    }

    if (Array.isArray(caps?.data?.solvers)) {
        const by = toLowerKeyMap<SolverSpec>(caps.data.solvers);
        const cand = by[want];
        if (cand?.vrp_types) return cand;

        const upgrade =
            lookupInsensitive<SolverSpec>(caps?.vrp_specs, solverName) ??
            lookupInsensitive<SolverSpec>(caps?.data?.vrp_specs, solverName);
        if (upgrade) return upgrade;
        if (cand) return cand;
    }

    // 4) fallback: directly on root
    const s5 = lookupInsensitive<SolverSpec>(caps, solverName);
    if (s5) return s5;

    return null;
}

export function getVrpSpec(caps: any, solverName: string, vrpType: string): VrpTypeSpec | null {
    const solver = getSolverSpec(caps, solverName);
    if (!solver) return null;

    // common: nested under vrp_types
    const viaVrpTypes = lookupInsensitive<VrpTypeSpec>(solver.vrp_types, vrpType);
    if (viaVrpTypes) return viaVrpTypes;

    // fallback: type directly on solver
    return lookupInsensitive<VrpTypeSpec>(solver as any, vrpType);
}

// ───────────────────────────────────────────────────────────────────────────────
// Requirements evaluator (super flexible to match old JS helper + tests)
// Supports calls:
//   evaluateRequirements(vrpSpec, payload)
//   evaluateRequirements(caps, solver, vrpType, payload)
//   evaluateRequirements(['matrix.distances','demands'], payload)   <-- JS old style
// Returns: Array<{ token, ok }>
// ───────────────────────────────────────────────────────────────────────────────
export function evaluateRequirements(
    a: any,
    b?: any,
    c?: any,
    d?: any
): Array<{ token: string; ok: boolean }> {
    let tokensToCheck: string[] = [];
    let payload: any = undefined;

    // Case 1: evaluateRequirements(['token','token2'], payload)
    if (Array.isArray(a)) {
        tokensToCheck = a as string[];
        payload = b;
    }
    // Case 2: evaluateRequirements(vrpSpec, payload)
    else if (isVrpSpec(a) && c === undefined) {
        const spec = a as VrpTypeSpec | null;
        payload = b;
        tokensToCheck = [
            ...(spec?.required ?? []),
            ...(spec?.optional ?? []),
            // include common tokens your tests refer to
            'matrix',
            'demands',
            'node_time_windows',
            'node_service_times',
        ];
        tokensToCheck = unique(tokensToCheck);
    }
    // Case 3: evaluateRequirements(caps, solver, vrpType, payload)
    else {
        const caps = a as Capabilities | undefined;
        const solver = String(b ?? '');
        const vrpType = String(c ?? '');
        payload = d;
        const spec = getVrpSpec(caps, solver, vrpType);
        tokensToCheck = [
            ...(spec?.required ?? []),
            ...(spec?.optional ?? []),
            'matrix',
            'demands',
            'node_time_windows',
            'node_service_times',
        ];
        tokensToCheck = unique(tokensToCheck);
    }

    return tokensToCheck.map((token) => ({ token, ok: hasToken(payload, token) }));
}

function isVrpSpec(x: any): x is VrpTypeSpec {
    return !!x && (Array.isArray(x.required) || Array.isArray(x.optional) || typeof x === 'object');
}

function unique<T>(arr: T[]) {
    return Array.from(new Set(arr));
}

// Supports both simple names like 'matrix' and dotted tokens like 'matrix.distances'.
// Also keeps compatibility with older tokens used in your JS file.
function hasToken(payload: any, token: string): boolean {
    if (!payload) return false;

    switch (token) {
        // Old JS tokens:
        case 'matrix.distances': return !!payload?.matrix?.distances;
        case 'matrix.durations': return !!payload?.matrix?.durations;
        case 'fleet>=1': return Array.isArray(payload?.fleet?.vehicles) && payload.fleet.vehicles.length >= 1;
        case 'fleet==1': return Array.isArray(payload?.fleet?.vehicles) && payload.fleet.vehicles.length === 1;
        case 'depot_index':
        case 'depotIndex': return Number.isInteger(payload?.depot_index ?? payload?.depotIndex);
        case 'pickup_delivery_pairs': return Array.isArray(payload?.pickup_delivery_pairs) && payload.pickup_delivery_pairs.length > 0;
        case 'weights': return !!payload?.weights;
        case 'waypoints|matrix': {
            const hasWaypoints = Array.isArray(payload?.waypoints) && payload.waypoints.length > 0;
            const hasMatrix = !!payload?.matrix;
            return hasWaypoints || hasMatrix;
        }

        // Simple common names used by tests:
        case 'matrix': return !!payload?.matrix;
        case 'demands': return Array.isArray(payload?.demands);
        case 'node_time_windows':
            return Array.isArray(payload?.node_time_windows) &&
                (payload.node_time_windows.length === 0 || Array.isArray(payload.node_time_windows[0]));
        case 'node_service_times':
            return Array.isArray(payload?.node_service_times);

        default: {
            // Generic dotted path fallback: e.g. "foo.bar.baz"
            const v = getByPath(payload, token);
            if (Array.isArray(v)) return v.length > 0;
            if (v && typeof v === 'object') return Object.keys(v).length > 0;
            return !!v;
        }
    }
}

function getByPath(obj: any, path: string) {
    return String(path).split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export default {
    getSolverSpec,
    getVrpSpec,
    evaluateRequirements,
};
