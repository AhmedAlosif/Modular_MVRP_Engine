// src/hooks/useRouteGeometry.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { coordsFromAnyGeometry } from '@/utils/routeGeometry';
import useRouteStore from '@/hooks/useRouteStore';
import { useRenderSettingsStore } from '@/hooks/useRenderSettingsStore';
import { getGeometryWithCache } from '@/utils/routeGeometry';
import api from '@/api/api';

type Provider = 'auto' | 'backend' | 'mapbox' | 'osrm' | 'none';
type Status = 'idle' | 'loading' | 'ok' | 'error';

type Options = {
    source?: Provider;
    profile?: 'driving' | 'driving-traffic' | 'cycling' | 'walking';
    osrmUrl?: string;
    /** POST { coordinates, profile } -> {status,data:{geometry}} (backend) */
    backendGeometryEndpoint?: string;      // default: /route/geometry
    /** POST { coordinates, profile, geometries?, tidy? } -> Mapbox match JSON (backend proxy) */
    backendMapboxEndpoint?: string;        // default: /mapbox/match
};

const disabledProviders = new Set<Provider>(); // session-only backoff in auto mode

const dedupeLoop = (inCoords: number[][]) => {
    if (!Array.isArray(inCoords) || inCoords.length < 2) return [];
    const a = inCoords[0], b = inCoords[inCoords.length - 1];
    const same = Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
    return same ? inCoords.slice(0, -1) : inCoords;
};

export function useRouteGeometry(
    route: { coords?: number[][]; raw?: any } | null | undefined,
    options?: Options
) {
    const storeSource = useRenderSettingsStore(s => s.geometrySource) as Provider | undefined;
    const storeOsrm = useRenderSettingsStore(s => s.osrmUrl) as string | undefined;

    const profile = options?.profile ?? 'driving';
    const osrmUrl = options?.osrmUrl ?? storeOsrm ?? (process.env.NEXT_PUBLIC_OSRM_URL || 'https://router.project-osrm.org');
    // IMPORTANT: no /api prefix; these go to backend baseURL via axios client

    const apiBase =
        (api?.defaults?.baseURL?.replace(/\/+$/, '') || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000')
            .replace(/\/+$/, '');

    const backendMapboxEndpoint = options?.backendMapboxEndpoint ?? `${apiBase}/mapbox/match`;
    const backendGeometryEndpoint = options?.backendGeometryEndpoint ?? `${apiBase}/route/geometry`;

    const baseSource = options?.source ?? storeSource ?? 'auto';
    const adapter = route?.raw?.adapter as string | undefined;

    // If the route already has geometry from a non-haversine adapter, don't override it in 'auto' mode.
    const effectiveSource: Provider = options?.source ?? storeSource ?? 'auto';

    const coords = useMemo(() => dedupeLoop(route?.coords || []), [route?.coords]);

    const [state, setState] = useState<{
        status: Status;
        coords: number[][] | null;
        provider: Provider | null;
        error?: string;
    }>({ status: 'idle', coords: null, provider: null });

    // stale guard
    const reqId = useRef(0);

    useEffect(() => {
        if (coords.length < 2) {
            setState({ status: 'idle', coords: null, provider: null });
            return;
        }

        if (effectiveSource === 'none') {
            setState({ status: 'idle', coords: null, provider: 'none' });
            return;
        }

        const myId = ++reqId.current;
        setState({ status: 'loading', coords: null, provider: null });

        // axios can be aborted with AbortSignal (axios v1+)
        const p0 = profile.split('-')[0] as 'driving' | 'walking' | 'cycling'; // 'driving-traffic' → 'driving'

        const fetchByProvider = (prov: Exclude<Provider, 'auto' | 'none'>) => {
            return getGeometryWithCache(async ({ signal }) => {
                if (prov === 'backend') {
                    // Build a small list of candidates to handle both setups:
                    //   - FastAPI at /route/geometry
                    //   - FastAPI behind Next at /api/route/geometry
                    const base = (api?.defaults?.baseURL || '').replace(/\/$/, '');
                    const candidates = Array.from(new Set([
                        backendGeometryEndpoint,                     // whatever was injected
                        `${base}/route/geometry`,
                        `${base}/api/route/geometry`,
                        '/route/geometry',
                        '/api/route/geometry',
                    ])).filter(Boolean) as string[];

                    let last: any = null;
                    for (const url of candidates) {
                        try {
                            const r = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ coordinates: coords, profile }),
                                signal
                            });
                            if (!r.ok) { last = r.status; continue; }
                            const j = await r.json();
                            const payload = j?.data?.geometry || j?.geometry || j?.data || j;
                            const c =
                                coordsFromAnyGeometry(payload) ||
                                coordsFromAnyGeometry({ geometry: payload }) ||
                                null;
                            if (c && c.length >= 2) return c;
                        } catch (e) {
                            last = e;
                        }
                    }
                    throw new Error(`backend geometry failed (${String(last)})`);
                }
                if (prov === 'mapbox') {
                    // POST /mapbox/match via api.js (baseURL :8000)
                    const res = await api.post(
                        backendMapboxEndpoint,
                        { coordinates: coords, profile: p0, geometries: 'geojson', tidy: true },
                        { signal }
                    );
                    const j = res?.data;
                    const c =
                        (j?.tracepoints && j?.matchings?.[0]?.geometry?.coordinates) ||
                        j?.geometry?.coordinates ||
                        j?.routes?.[0]?.geometry?.coordinates ||
                        coordsFromAnyGeometry(j) ||
                        null;
                    return c || [];
                }

                // OSRM stays direct (public or custom server)
                const path = coords.map(c => `${c[0]},${c[1]}`).join(';');
                const url = `${osrmUrl.replace(/\/+$/, '')}/route/v1/${p0}/${path}?overview=full&geometries=geojson`;
                const r = await fetch(url, { cache: 'no-store', signal });
                if (!r.ok) throw new Error(`osrm ${r.status}`);
                const j = await r.json();
                const c = j?.routes?.[0]?.geometry?.coordinates || [];
                return c;
            }, {
                source: prov,
                profile: p0,
                adapter: adapter || 'auto',
                coords
            });
        };

        const tryAuto = async () => {
            const candidates: Provider[] = (['backend', 'mapbox', 'osrm'] as Provider[])
                .filter(p => !disabledProviders.has(p));

            let picked: Provider | null = null;
            let snapped: number[][] | null = null;
            let lastErr: string | undefined;

            for (const prov of candidates) {
                try {
                    const c = await fetchByProvider(prov as Exclude<Provider, 'auto' | 'none'>);
                    if (Array.isArray(c) && c.length >= 2) {
                        picked = prov as Provider;
                        snapped = c;
                        break;
                    }
                    throw new Error('No geometry in response');
                } catch (e: any) {
                    lastErr = e?.message || String(e);
                    disabledProviders.add(prov); // back off for this session
                }
            }

            if (reqId.current !== myId) return; // stale

            if (snapped) {
                setState({ status: 'ok', coords: snapped, provider: picked! });
            } else {
                setState({ status: 'error', coords: null, provider: null, error: lastErr || 'Geometry fetch failed' });
            }
        };

        const runSingle = async (prov: Exclude<Provider, 'auto' | 'none'>) => {
            try {
                const c = await fetchByProvider(prov);
                if (reqId.current !== myId) return; // stale
                if (Array.isArray(c) && c.length >= 2) {
                    setState({ status: 'ok', coords: c, provider: prov });
                } else {
                    setState({ status: 'error', coords: null, provider: null, error: 'No geometry in response' });
                }
            } catch (e: any) {
                if (reqId.current !== myId) return; // stale
                setState({ status: 'error', coords: null, provider: null, error: e?.message || String(e) });
            }
        };

        if (effectiveSource === 'auto') {
            void tryAuto();
        } else {
            void runSingle(effectiveSource);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        effectiveSource,
        adapter,
        profile,
        osrmUrl,
        backendGeometryEndpoint,
        backendMapboxEndpoint,
        // deps for coords (stable stringify to avoid thrash)
        useMemo(() => JSON.stringify(coords), [coords])
    ]);

    // Reflect into the route store only when we have a usable geometry
    useEffect(() => {
        if (state.status !== 'ok' || !state.coords || state.coords.length < 2) return;
        useRouteStore.setState(s => {
            const next = Array.isArray(s.routes) ? [...s.routes] : [];
            const idx = s.currentIndex ?? 0;
            if (!next[idx]) return s;
            next[idx] = { ...next[idx], displayCoords: state.coords, displayProvider: state.provider };
            return { routes: next };
        });
    }, [state.status, state.coords, state.provider]);

    return state;
}
