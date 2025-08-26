'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Section from '@/components/sidebar/Section';
import { useBenchmarks, useBenchmarkFiles, useDistanceMatrix, useSolve, useCapabilities } from '@/hooks/useBackend';
import api from '@/api/api';
import useWaypointStore from '@/hooks/useWaypointStore';
import useFleetStore from '@/hooks/useFleetStore';
import useMapStore from '@/hooks/useMapStore';
import useUiStore from '@/hooks/useUIStore';
import useRouteStore from '@/hooks/useRouteStore';
import fitToFeatures from '@/components/map/fitToFeatures';
import { normalizeFleetForBackend } from '@/utils/normalizeFleetForBackend';
import { haversineMeters } from '@/utils/metrics';
import { getSolverSpec } from '@/utils/capabilityHelpers';

const stripExt = (n) => String(n || '').replace(/\.[^.]+$/, '');

const durationsFromDistances = (distances, speedKph = 40) => {
  if (!Array.isArray(distances)) return null;
  const mps = (speedKph * 1000) / 3600;
  return distances.map(row => row.map(d => Math.round(Number(d || 0) / mps)));
};

const inferVrpType = (waypoints, vehiclesLike, loadedMeta) => {
  const hasTW = waypoints.some(w => Array.isArray(w.timeWindow) && w.timeWindow.length === 2);
  const hasPD = waypoints.some(w => w?.pairId != null);
  const hasDemand = waypoints.some(w => (w?.demand ?? 0) > 0);
  const hasCap = (Array.isArray(vehiclesLike) ? vehiclesLike : []).some(v => Array.isArray(v?.capacity) && v.capacity.some(c => c > 0));

  if (hasPD && hasTW) return 'PDPTW';
  if (hasPD) return 'PD';
  if (hasTW) return 'VRPTW';
  if (hasDemand && hasCap) return 'CVRP';
  return 'TSP';
};

export default function BenchmarkSelector() {
  // ---- stores / helpers ----
  const addWaypoint = useWaypointStore(s => s.addWaypoint);
  const removeWaypointsByFileId = useWaypointStore(s => s.removeWaypointsByFileId);
  const setViewState = useMapStore(s => s.setViewState);

  const setSolverEngine = useUiStore(s => s.setSolverEngine);
  const setRoutingAdapter = useUiStore(s => s.setRoutingAdapter);
  const setVrpType = useUiStore(s => s.setVrpType);

  const dm = useDistanceMatrix();
  const solve = useSolve();
  const addSolution = useRouteStore.getState().addSolutionFromSolver;

  // local UI state
  const [availableSolvers, setAvailableSolvers] = useState([]);
  const [solver, setSolver] = useState('pyomo');
  const [adapter, setAdapter] = useState('haversine');
  const [busy, setBusy] = useState(false);
  const [loadedMeta, setLoadedMeta] = useState(null);

  const loadedRef = useRef(null);       // { dataset, name, bestKnown }
  const lastMiniRef = useRef(null);     // mini box values

  // ---- fetch caps for dropdowns ----
  const capsQ = useCapabilities();
  const solverOptions = useMemo(() => {
    const list = capsQ.data?.solvers || capsQ.data?.data?.solvers || [];
    const names = Array.isArray(list) ? list.map(s => s.name) : Object.keys(list || {});
    // safe defaults
    return names?.length ? names : ['ortools', 'pyomo', 'vroom', 'mapbox_optimizer'];
  }, [capsQ.data]);

  const adapterOptions = useMemo(() => {
    const names = capsQ.data?.adapters?.map(a => a.name);
    return names?.length ? names : ['haversine', 'osm_graph', 'openrouteservice', 'google'];
  }, [capsQ.data]);

  // ---- datasets ----
  const benchmarksQ = useBenchmarks();
  const datasetOptions = benchmarksQ.data?.datasets?.map(d => d.name) ?? [];

  const [dataset, setDataset] = useState('');
  useEffect(() => { if (!dataset && datasetOptions.length) setDataset(datasetOptions[0]); }, [dataset, datasetOptions]);

  // ---- file search / paging ----
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const filesParams = useMemo(() => dataset ? ({ dataset, q: search || undefined, limit, offset }) : null, [dataset, search, limit, offset]);
  const filesQ = useBenchmarkFiles(filesParams);
  const items = filesQ.data?.items ?? [];
  const total = filesQ.data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  // ---- load instance ----
  const [currentFileId, setCurrentFileId] = useState(null);

  // keep global UI store updated when local controls change
  useEffect(() => { setSolverEngine?.(solver); }, [solver, setSolverEngine]);
  useEffect(() => { setRoutingAdapter?.(adapter); }, [adapter, setRoutingAdapter]);

  const handleLoad = async (name) => {
    if (!dataset || !name) return;
    const stem = stripExt(name);
    try {
      const { data: payload } = await api.get('/benchmarks/load', { params: { dataset, name: stem, compute_matrix: true } });
      const data = payload?.data;
      if (!data?.waypoints?.length) throw new Error('Empty instance');

      if (currentFileId) removeWaypointsByFileId?.(currentFileId);
      const fileId = `bench:${dataset}:${stem}:${Date.now()}`;

      // waypoints -> UI
      const wp = (data.waypoints || []).map((w, i) => ({
        id: w.id ?? String(i),
        coordinates: [Number(w.lon), Number(w.lat)],
        fileId,
        type: w.depot ? 'Depot' : 'Delivery',
        demand: w.demand ?? 0,
        capacity: null,
        serviceTime: w.service_time ?? 0,
        timeWindow: Array.isArray(w.time_window) ? w.time_window : null,
        pairId: null
      }));
      wp.forEach(addWaypoint);

      // fleet
      const vehicles =
        Array.isArray(data.fleet) ? data.fleet
          : Array.isArray(data.fleet?.vehicles) ? data.fleet.vehicles
            : [];
      const stFleet = useFleetStore.getState();
      if (typeof stFleet.setVehicles === 'function') stFleet.setVehicles(vehicles);
      else if (typeof stFleet.replaceAll === 'function') stFleet.replaceAll(vehicles);
      else if (typeof stFleet.addVehicle === 'function') vehicles.forEach(v => stFleet.addVehicle(v));

      // auto VRP type
      const inferred = inferVrpType(wp, vehicles, data?.meta);
      setVrpType(inferred);

      // zoom
      const fc = {
        type: 'FeatureCollection',
        features: wp.map(w => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: w.coordinates },
          properties: { type: w.type }
        }))
      };
      fitToFeatures(fc.features, { setViewState });

      setCurrentFileId(fileId);

      // VRP type → filter solvers from caps (handles arrays OR maps)
      const caps = capsQ.data;
      const raw = (caps?.solvers ?? caps?.data?.solvers);
      let allSolverNames = [];
      if (Array.isArray(raw)) allSolverNames = raw.map((s) => s?.name ?? String(s));
      else if (raw && typeof raw === 'object') allSolverNames = Object.keys(raw);
      else allSolverNames = ['ortools', 'pyomo', 'vroom', 'mapbox_optimizer'];

      const filtered = allSolverNames.filter((nm) => {
        const spec = getSolverSpec(caps, nm);
        const vrps = Object.keys(spec?.vrp_types || {});
        return vrps.length ? vrps.some(v => v.toUpperCase() === inferred) : true;
      });

      setAvailableSolvers(filtered.length ? filtered : allSolverNames);
      if (filtered.length) setSolver(filtered[0]);


      // mini-summary meta for the box
      const bestKm = data?.best_known_km ?? data?.meta?.best_known_km ?? null;
      setLoadedMeta({ dataset, name: stem, vrpType: inferred, bestKm, format: data?.meta?.format || null });

      const maybeBest =
        Number(data?.meta?.best_known ?? data?.meta?.bks ?? data?.meta?.opt ?? data?.meta?.objective) ||
        Number(payload?.solution?.objective ?? payload?.solution?.obj) || null;

      loadedRef.current = {
        dataset, name: stem,
        bestKnown: Number.isFinite(maybeBest) && maybeBest > 0 ? Number(maybeBest) : null,
        matrix: data?.matrix || null,
        depotIndex: Number.isFinite(data?.depot_index) ? Number(data.depot_index) : 0,
        format: data?.meta?.format || null,
      };

      lastMiniRef.current = null;



      // fetch pair to capture best-known if present
      let bestKnownMeters = null;
      try {
        const pair = await api.get('/benchmarks/find', { params: { dataset, name: stem } }).then(r => r.data);
        const b = Number(
          pair?.solution?.objective ??
          pair?.solution?.obj ??
          pair?.solution?.best ??
          NaN
        );
        if (Number.isFinite(b) && b > 0) bestKnownMeters = b;
      } catch { }

      setLoadedMeta(prev => ({
        ...(prev || {}),
        dataset,
        name: stem,
        vrpType: inferred,
        bestKm: Number.isFinite(bestKnownMeters) ? bestKnownMeters / 1000 : (prev?.bestKm ?? null),
        // preserve format if we already detected it earlier
        format: prev?.format ?? (data?.meta?.format ?? null),
      }));

      // only update bestKnown; keep matrix/depotIndex/format we already stored
      loadedRef.current = { ...(loadedRef.current || {}), bestKnown: bestKnownMeters };
    } catch (e) {
      console.error('Failed to load benchmark instance', e);
      alert(e?.message || 'Load failed');
    }
  };

  const clearLoaded = () => {
    if (currentFileId) {
      removeWaypointsByFileId?.(currentFileId);
      setCurrentFileId(null);
    }
    loadedRef.current = null;
    lastMiniRef.current = null;
  };

  const onSolveLoaded = async () => {
    try {
      setBusy(true);
      const st = useWaypointStore.getState();
      const waypoints = st.waypoints || [];
      if (waypoints.length < 2) throw new Error('Add or load at least 2 waypoints');

      const coords = waypoints.map(w => ({ lon: Number(w.coordinates[0]), lat: Number(w.coordinates[1]) }));
      const depotIndex = Number.isFinite(loadedRef.current?.depotIndex) ? loadedRef.current.depotIndex : 0;

      // vehicles
      const { vehicles: backendVehicles } = normalizeFleetForBackend(
        useFleetStore.getState().vehicles,
        { defaultStart: depotIndex, defaultEnd: depotIndex }
      );
      let vehiclesArr = backendVehicles?.length ? backendVehicles : [];
      if (vehiclesArr.length < 2) {
        const k = Math.min(25, Math.max(10, Math.ceil((waypoints.length - 1) / 10)));
        const base = vehiclesArr[0] || { id: 'veh-1', capacity: [200], start: depotIndex, end: depotIndex };
        vehiclesArr = Array.from({ length: k }, (_, i) => ({
          ...base,
          id: `veh-${i + 1}`,
          start: depotIndex,
          end: depotIndex,
          capacity: Array.isArray(base.capacity) && base.capacity.length ? base.capacity : [200],
        }));
      }
      // auto VRP type can be re-checked (in case user tweaked fleet)
      const inferred = inferVrpType(waypoints, vehiclesArr, null);
      setVrpType(inferred);

      const selectedSolver = (solver || 'ortools').toLowerCase();
      const selectedAdapter = (adapter || 'haversine').toLowerCase();
      const selectedVrpType = inferred;

      // OR-Tools / Pyomo path (you can extend later)
      // before: let dmPayload = { adapter, origins, destinations, ... }

      let dmPayload =
        selectedAdapter === 'osm_graph'
          ? {
            adapter: selectedAdapter,
            mode: 'driving',
            parameters: { metrics: ['distance', 'duration'], units: 'm' },
            coordinates: coords
          }
          : {
            adapter: selectedAdapter,
            mode: 'driving',
            parameters: { metrics: ['distance', 'duration'], units: 'm' },
            origins: coords,
            destinations: coords
          };
      console.debug('[Benchmark] Matrix Payload', dmPayload);
      // Matrix with ORS 3500-route fallback to haversine

      // Prefer dataset matrix (correct, consistent units) when present
      let matrix = loadedRef.current?.matrix || null;
      if (!matrix) {
        let dmPayload = {
          adapter: selectedAdapter,
          mode: 'driving',
          parameters: { metrics: ['distance', 'duration'], units: 'm' },
          origins: coords,
          destinations: coords,
        };
        // Guard: Mapbox & OSM matrix don't support Solomon planar coords or >25 nodes
        const looksPlanar = coords.every(c => Math.abs(c.lon) <= 200 && Math.abs(c.lat) <= 200);
        const tooBigForMbx = coords.length > 25;
        if (looksPlanar || (selectedAdapter === 'mapbox' && tooBigForMbx)) {
          // fall back to haversine (or skip adapter entirely)
          dmPayload = { ...dmPayload, adapter: 'haversine' };
        }
        let dmRes;
        try {
          dmRes = await dm.mutateAsync(dmPayload);
        } catch (err) {
          const msg = String(err?.message || '');
          if (msg.includes('6004') || /openrouteservice/i.test(msg)) {
            dmPayload = { ...dmPayload, adapter: 'haversine' };
            dmRes = await dm.mutateAsync(dmPayload);
          } else {
            throw err;
          }
        }
        matrix = dmRes?.data?.matrix || dmRes?.matrix;
        if (!matrix) throw new Error('Matrix failed');
      }

      if ((selectedVrpType === 'VRPTW' || selectedVrpType === 'PDPTW') && !matrix.durations) {
        const dur = durationsFromDistances(matrix.distances, 40);
        if (dur) matrix.durations = dur;   // seconds
      }

      const isDepot = (i) => i === depotIndex;
      // If the instance doesn't specify demands, default to 1 per customer
      const defaultDemandIfMissing = waypoints.some(w => Number(w?.demand) > 0) ? 0 : 1;

      const demands = waypoints.map((w, i) =>
        isDepot(i) ? 0 : Number.isFinite(w?.demand) ? Number(w.demand) : defaultDemandIfMissing
      );


      // Build VRP fields from *waypoints*
      let node_service_times = waypoints.map(w => Number(w?.serviceTime || 0));
      let node_time_windows = waypoints.map(w =>
        Array.isArray(w?.timeWindow) ? w.timeWindow : [0, 24 * 3600]
      );

      // Ensure vehicles have capacity; fall back to sum of demands if missing
      const totalDemand = demands.reduce((s, d) => s + (Number.isFinite(d) ? d : 0), 0);
      vehiclesArr = (vehiclesArr || []).map((v, i) => {
        const cap = Array.isArray(v?.capacity) ? v.capacity : [];
        const hasCap = cap.some(x => Number(x) > 0);
        return {
          ...v,
          start: (v.start ?? depotIndex),
          end: (v.end ?? depotIndex),
          capacity: hasCap ? cap : [Math.max(totalDemand, waypoints.length)] // safe large
        };
      });

      // ── Solomon-specific normalization: file gives seconds, our matrix is in "Solomon units" ──
      const fmt = String(loadedRef.current?.format || loadedMeta?.format || '').toLowerCase();
      const looksSolomon = fmt.includes('solomon');
      const manyTWAreSec = node_time_windows.filter(([a, b]) =>
        Number.isFinite(a) && Number.isFinite(b) && a >= 3600 && b >= 3600 && a % 60 === 0 && b % 60 === 0
      ).length > node_time_windows.length * 0.7;
      const serviceLooksSec = node_service_times.filter(s =>
        Number.isFinite(s) && s >= 3600 && s % 60 === 0
      ).length > node_service_times.length * 0.7;

      if (looksSolomon && (manyTWAreSec || serviceLooksSec)) {
        console.debug('[Harmonize:Solomon] dividing TW & service_time by 60');
        node_service_times = node_service_times.map(s => Math.round(Number(s) / 60));
        node_time_windows = node_time_windows.map(([a, b]) => [Math.round(Number(a) / 60), Math.round(Number(b) / 60)]);
      }

      // ── Unit harmonizer (mutually exclusive): make TW/service and durations consistent ──
      // Compute current stats
      const flatDur = Array.isArray(matrix?.durations)
        ? matrix.durations.flat().filter(Number.isFinite)
        : [];
      const maxDur = flatDur.length ? Math.max(...flatDur) : 0;
      const maxService = node_service_times.length ? Math.max(...node_service_times) : 0;
      const twWidths = node_time_windows.map(([a, b]) => (Number(b) - Number(a))).filter(Number.isFinite);
      const minTWwidth = twWidths.length ? Math.min(...twWidths) : 0;

      // Case A: TW/service are ~60× larger than durations -> TW/service were seconds, durations minutes
      const twBigger = maxDur > 0 && ((maxService / maxDur) > 10 || (minTWwidth / maxDur) > 10);
      // Case B: durations are ~60× larger than TW/service -> durations are seconds, TW/service minutes
      const durBigger = (Math.max(maxService, minTWwidth) > 0) && (maxDur / Math.max(1, maxService, minTWwidth) > 10);

      if (twBigger && !durBigger) {
        console.debug('[Harmonize] scaling TW/service_time down by 60 to match durations (minutes)');
        node_service_times = node_service_times.map(s => Math.round(Number(s) / 60));
        node_time_windows = node_time_windows.map(([a, b]) => [Math.round(Number(a) / 60), Math.round(Number(b) / 60)]);
      } else if (durBigger) {
        console.debug('[Harmonize] scaling matrix.durations down by 60 to match TW/service (minutes)');
        matrix = {
          ...matrix,
          durations: matrix.durations.map(row => row.map(v => Math.round(Number(v) / 60)))
        };
      }

      // Sanity after harmonization (optional)
      const flatDur2 = Array.isArray(matrix?.durations) ? matrix.durations.flat().filter(Number.isFinite) : [];
      const maxDur2 = flatDur2.length ? Math.max(...flatDur2) : 0;
      const maxService2 = node_service_times.length ? Math.max(...node_service_times) : 0;
      const minTWwidth2 = node_time_windows.map(([a, b]) => b - a).filter(Number.isFinite).reduce((m, v) => Math.min(m, v), Infinity);
      console.debug('[Sanity-After] maxDur', maxDur2, 'maxService', maxService2, 'minTWwidth', minTWwidth2);

      // Start payload
      const payload = {
        solver: selectedSolver,                // 'ortools' | 'pyomo' | 'vroom' | ...
        depot_index: depotIndex,
        fleet: vehiclesArr,
        weights: { distance: 1, time: 0 },
        matrix
      };

      // Attach VRP-specific bits
      if (demands.some(d => d > 0)) payload.demands = demands; // capacity matters for C101 (VRPTW)
      if (selectedVrpType === 'VRPTW' || selectedVrpType === 'PDPTW') {
        payload.node_service_times = node_service_times;
        payload.node_time_windows = node_time_windows;
      }
      if (selectedVrpType === 'PDPTW') payload.demands = demands;
      console.debug('[Benchmark] Solver Payload', payload);

      const _flatDur = matrix?.durations?.flat?.().filter(Number.isFinite) ?? [];
      const _twWidths = node_time_windows.map(([a, b]) => (b - a)).filter(Number.isFinite);
      console.debug('[Sanity]', {
        maxDur: _flatDur.length ? Math.max(..._flatDur) : 0,
        maxService: node_service_times.length ? Math.max(...node_service_times) : 0,
        minTWwidth: _twWidths.length ? Math.min(..._twWidths) : 0
      });

      console.debug('[Units]', {
        duration_unit_guess: durBigger ? 'seconds->minutes (scaled)' : 'minutes',
        maxDur: Math.max(...(matrix.durations.flat?.() ?? [0])),
        maxService: Math.max(...node_service_times),
        minTWwidth: Math.min(...node_time_windows.map(([a, b]) => b - a))
      });

      const solveRes = await solve.mutateAsync(payload);

      console.debug('[Benchmark] Solver Response', solveRes);
      // our distance via waypoint order (fallback to geometry later)
      const ids =
        solveRes?.data?.routes?.[0]?.waypoint_ids ||
        solveRes?.routes?.[0]?.waypoint_ids || [];
      const coordsLL = waypoints.map(w => w.coordinates);
      let ourMeters = 0;
      if (Array.isArray(ids) && ids.length >= 2) {
        for (let i = 1; i < ids.length; i++) {
          const a = coordsLL[Number(ids[i - 1])], b = coordsLL[Number(ids[i])];
          if (a && b) ourMeters += haversineMeters(a, b);
        }
      }

      const bench = loadedRef.current || {};
      const best = bench.bestKnown;
      const comparison = (Number.isFinite(best) && best > 0)
        ? { best, ours: ourMeters, gap: ((ourMeters - best) / best) * 100 }
        : undefined;

      addSolution(solveRes, waypoints, {
        solver: selectedSolver,
        adapter: selectedAdapter,
        vrpType: selectedVrpType,
        benchmark: bench.dataset && bench.name ? { dataset: bench.dataset, name: bench.name } : undefined,
        comparison,
        bestKnownKm: Number.isFinite(bench?.bestKnown) ? (bench.bestKnown / 1000) : (loadedMeta?.bestKm ?? null),
        vehicles: vehiclesArr,        // <-- lets UI compute emissions/cost if solver didn't
        id: `bench-${Date.now()}`,
      });

      // mini box
      lastMiniRef.current = {
        dataset: bench.dataset, name: bench.name,
        solver: selectedSolver, adapter: selectedAdapter, vrpType: selectedVrpType,
        bestKnown: best ?? null,
        ourKm: (ourMeters / 1000),
        gap: comparison ? comparison.gap : null,
      };
    } catch (e) {
      console.error('Benchmark solve failed', e);
      alert(e?.message || 'Solve failed');
    } finally {
      setBusy(false);
    }
  };

  // ---- UI ----
  return (
    <Section title="🧪 Benchmark Selector">
      {/* Dataset */}
      <label className="block text-sm font-medium mb-1">Dataset</label>
      <select
        className="w-full p-1 border rounded mb-2 text-sm"
        value={dataset}
        onChange={(e) => { setDataset(e.target.value); setOffset(0); }}
      >
        {datasetOptions.map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      {/* Search + paging */}
      <div className=" flex gap-2 mb-2">
        <input
          className="flex-1 p-1 border rounded text-sm"
          placeholder="🔍 Search (e.g. c101, R1, 100)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
        />
        <select
          className="w-15 p-1 border rounded text-sm"
          value={limit}
          onChange={(e) => { setLimit(Number(e.target.value) || 50); setOffset(0); }}
        >
          {[25, 50, 100, 250].map(v => <option key={v} value={v}>{v}/pg</option>)}
        </select>
      </div>

      {/* Files list */}
      <div className="max-h-56 overflow-y-auto border rounded p-2 text-sm space-y-1">
        {filesQ.isFetching && <div className="text-xs text-gray-500">Loading…</div>}
        {filesQ.isError && <div className="text-xs text-red-600">Error: {String(filesQ.error?.message || 'failed')}</div>}
        {!filesQ.isFetching && items.length === 0 && (
          <div className="text-xs text-gray-400 italic">No matching instances</div>
        )}
        {items.map(it => (
          <div key={it.name} className="flex items-center justify-between gap-2">
            <div className="truncate">
              <span className="font-mono">{it.name}</span>
              {it.solution_path && (
                <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  has solution
                </span>
              )}
            </div>
            <button
              onClick={() => handleLoad(it.name)}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Load
            </button>
          </div>
        ))}
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between mt-2 text-xs">
        <div>Page {page} / {pages} ({total} items)</div>
        <div className="flex gap-1">
          <button className="px-2 py-0.5 border rounded disabled:opacity-50" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))}>⬅ Prev</button>
          <button className="px-2 py-0.5 border rounded disabled:opacity-50" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next ➡</button>
        </div>
      </div>

      {/* Loaded/Solve row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-gray-100">
          {currentFileId ? 'Instance loaded.' : 'No instance loaded.'}
        </div>
        <div className="flex gap-2">
          {currentFileId && (
            <button
              onClick={onSolveLoaded}
              disabled={busy}
              className="text-xs px-2 py-0.5 bg-indigo-600 text-white rounded disabled:opacity-60"
            >
              {busy ? 'Solving…' : 'Solve loaded & compare'}
            </button>
          )}
          {currentFileId && (
            <button onClick={clearLoaded} className="text-xs px-2 py-0.5 bg-gray-600 text-white rounded">
              Clear loaded
            </button>
          )}
        </div>
      </div>

      {/* Solver/Adapter (after list) */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium mb-1">Solver</label>
          <select
            className="w-full p-1 border rounded text-sm"
            value={solver}
            onChange={e => setSolver(e.target.value)}
          >
            {(availableSolvers.length ? availableSolvers : solverOptions).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Adapter</label>
          <select
            className="w-full p-1 border rounded text-sm"
            value={adapter}
            onChange={e => setAdapter(e.target.value)}
          >
            {(adapterOptions?.length ? adapterOptions : ['haversine', 'openrouteservice', 'osm_graph', 'mapbox']).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mini summary & Solve button */}
      {loadedMeta && (
        <div className="mt-2 text-xs p-2 rounded border bg-gray-800">
          <div><strong>Benchmark:</strong> {loadedMeta.dataset}/{loadedMeta.name}</div>
          <div><strong>Type:</strong> {loadedMeta.vrpType}</div>
          {Number.isFinite(loadedMeta.bestKm) && <div><strong>Best-known:</strong> {loadedMeta.bestKm.toFixed(2)} km</div>}
        </div>
      )}    </Section>
  );
}
