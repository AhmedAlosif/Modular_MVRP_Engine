'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Section from '@/components/sidebar/Section';
import {
  useFileDatasets, useFileList, useFileUpload, useFileDelete,
  useFileParse, useFileWriteRaw, useFileWriteVrplib,
  useDistanceMatrix, useSolve
} from '@/hooks/useBackend';

import useWaypointStore from '@/hooks/useWaypointStore';
import useMapStore from '@/hooks/useMapStore';
import useUiStore from '@/hooks/useUIStore';
import useRouteStore from '@/hooks/useRouteStore';
import fitToFeatures from '@/components/map/fitToFeatures';

// ---------- small utils ----------
const toDir = (p) => {
  const s = String(p || '').replace(/^\/+/, '').replace(/\/+$/, '');
  return s ? s + '/' : '';
};

const parentDir = (p) => {
  const s = toDir(p);
  if (!s) return '';
  const parts = s.split('/').filter(Boolean);
  parts.pop(); // remove last segment
  return parts.length ? parts.join('/') + '/' : '';
};

const joinPath = (...parts) => parts
  .filter(Boolean)
  .join('/')
  .replace(/\/+/g, '/')
  .replace(/^\/+/, ''); // keep relative

const dirname = (p) => {
  const s = String(p || '');
  const idx = s.lastIndexOf('/');
  if (idx < 0) return '';
  return s.slice(0, idx + 1);
};

const relativeToCwd = (path, cwd) => {
  if (!cwd) return path;
  return path.startsWith(cwd) ? path.slice(cwd.length) : path; // best-effort
};

const isProbablyDir = (item, displayName, path) => {
  const t = typeof item === 'object' ? (item.type || '') : '';
  if (t === 'dir' || item?.is_dir === true || /\/$/.test(path)) return true;
  // heuristic: no extension and no dot often means folder
  if (!/\.[a-z0-9]+$/i.test(displayName) && !displayName.includes('.')) return true;
  return false;
};

export default function CustomDatasetPanel() {
  // ===== Stores/handlers
  const addWaypoint = useWaypointStore(s => s.addWaypoint);
  const removeWaypointsByFileId = useWaypointStore(s => s.removeWaypointsByFileId);
  const setViewState = useMapStore(s => s.setViewState);
  const addSolutionFromSolver = useRouteStore(s => s.addSolutionFromSolver);

  const solverEngine = useUiStore(s => s.solverEngine);
  const routingAdapter = useUiStore(s => s.routingAdapter);
  const vrpType = useUiStore(s => s.vrpType);

  // ===== Backend hooks
  const datasetsQ = useFileDatasets();
  const upload = useFileUpload();
  const del = useFileDelete();
  const parse = useFileParse();
  const writeRaw = useFileWriteRaw();
  const writeVrplib = useFileWriteVrplib();
  const dm = useDistanceMatrix();
  const solve = useSolve();

  // ===== Local UI state
  const datasetOptions = useMemo(() => {
    const raw = datasetsQ.data?.datasets ?? datasetsQ.data ?? [];
    return raw.map(d =>
      typeof d === 'string'
        ? { name: d, path: d }
        : { name: d.name ?? d.path, path: d.path ?? d.name }
    );
  }, [datasetsQ.data]);

  const [dataset, setDataset] = useState('');

  // NEW: split folder controls
  const [uploadSubdir, setUploadSubdir] = useState(''); // affects ONLY upload
  const [browseCwd, setBrowseCwd] = useState('');       // affects listing (cwd)

  const [q, setQ] = useState('');
  const [exts, setExts] = useState('');
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  // One-time init guard for selecting first dataset
  const didInitDatasetRef = useRef(false);
  useEffect(() => {
    if (didInitDatasetRef.current) return;
    if (!dataset && datasetOptions.length) {
      setDataset(datasetOptions[0].name);
      didInitDatasetRef.current = true;
    }
  }, [dataset, datasetOptions]);

  // Stable query params for listing
  const filesParams = useMemo(() => {
    if (!dataset) return null;
    return {
      dataset,
      cwd: browseCwd,             // ← ONLY used for browsing
      q: q || undefined,
      exts: exts || undefined,
      limit,
      offset,
      sort: 'name',
      order: 'asc'
    };
  }, [dataset, browseCwd, q, exts, limit, offset]);

  // Files query (enabled only when dataset chosen)
  const filesQ = useFileList(filesParams);
  const itemsRaw = filesQ.data?.items ?? filesQ.data?.files ?? filesQ.data ?? [];
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  const total = filesQ.data?.total ?? (Array.isArray(items) ? items.length : 0);

  // Parse/load/solve state
  const [parsed, setParsed] = useState(null);
  const [loadedFileId, setLoadedFileId] = useState(null);
  const lastParsedForPath = useRef({ path: null, data: null });

  // ===== Helpers
  const detectKindFromName = useCallback((name = '') => {
    const ext = String(name).split('.').pop()?.toLowerCase();
    if (ext === 'csv') return 'csv';
    if (ext === 'geojson' || ext === 'json') return 'geojson';
    if (ext === 'vrp' || ext === 'vrplib') return 'vrplib';
    if (ext === 'xml') return 'xml';
    if (ext === 'txt') return 'txt';
    // default to geojson (avoid 'auto' 400s)
    return 'geojson';
  }, []);

  const refresh = useCallback(() => {
    console.debug('[files] refresh list', filesParams);
    filesQ.refetch?.();
  }, [filesQ, filesParams]);

  const onUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !dataset) return;
    console.debug('[files] uploading', { count: files.length, subdir: uploadSubdir, dataset });
    for (const f of files) {
      await upload.mutateAsync({ file: f, subdir: uploadSubdir || undefined, overwrite: false });
    }
    e.target.value = '';
    // Upload does not affect browseCwd; user can Refresh explicitly
  }, [upload, uploadSubdir, dataset]);

  const onDelete = useCallback(async (path) => {
    if (!confirm(`Delete file?\n${path}`)) return;
    console.debug('[files] delete', path);
    await del.mutateAsync({ path });
    refresh();
  }, [del, refresh]);

  const normalizePathForParse = useCallback((filePath) => filePath, []);

  const onParse = useCallback(async (path, kindHint) => {
    try {
      setParsed(null);
      const pathNorm = normalizePathForParse(path);
      const kind = kindHint || detectKindFromName(path);
      console.debug('[files] parse', { path: pathNorm, kind });
      // Soft options; backend can ignore unknown keys
      const res = await parse.mutateAsync({
        path: pathNorm,
        kind,
        options: { coordsSource: 'geometry', ignoreNulls: true }
      });
      const data = res?.data || res;
      setParsed(data);
      lastParsedForPath.current = { path: pathNorm, data };
    } catch (e) {
      // Common backend error case for bad/missing coords in geojson
      console.error('Parse failed', e);
      alert(`Parse failed: ${e?.message || e}`);
      // BACKEND NOTE: /files/parse should skip features with null coords or expose an option to ignore them.
    }
  }, [parse, detectKindFromName, normalizePathForParse]);

  const loadToMap = useCallback((bundle, nameHint) => {
    const wps = bundle?.waypoints ?? [];
    if (!wps.length) { alert('No waypoints in parsed bundle'); return; }

    const fileId = `server:${nameHint || 'parsed'}:${bundle?.source || Date.now()}`;
    console.debug('[map] loadToMap', { count: wps.length, fileId });

    wps.forEach((w, i) => {
      const lng = Number(w.lon ?? (Array.isArray(w.coordinates) ? w.coordinates[0] : undefined));
      const lat = Number(w.lat ?? (Array.isArray(w.coordinates) ? w.coordinates[1] : undefined));
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        addWaypoint({
          id: String(w.id ?? i),
          coordinates: [lng, lat],
          fileId,
          type: w.depot ? 'Depot' : (w.type ?? 'Delivery'),
          demand: w.demand ?? 0,
          serviceTime: w.service_time ?? 0,
          timeWindow: Array.isArray(w.time_window) ? w.time_window : null,
        });
      }
    });

    const fc = {
      type: 'FeatureCollection',
      features: wps
        .map((w, i) => {
          const lon = Number(w.lon), lat = Number(w.lat);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: { id: String(w.id ?? i), depot: !!w.depot }
          };
        })
        .filter(Boolean)
    };
    if (fc.features.length) fitToFeatures(fc.features, { setViewState });

    setLoadedFileId(fileId);
  }, [addWaypoint, setViewState]);

  const unloadFromMap = useCallback(() => {
    if (loadedFileId && typeof removeWaypointsByFileId === 'function') {
      console.debug('[map] unloadFromMap', loadedFileId);
      removeWaypointsByFileId(loadedFileId);
    }
    setLoadedFileId(null);
  }, [loadedFileId, removeWaypointsByFileId]);

  const ensureParsedForPath = useCallback(async (path) => {
    if (lastParsedForPath.current.path === path && lastParsedForPath.current.data) {
      return lastParsedForPath.current.data;
    }
    await onParse(path, detectKindFromName(path));
    return lastParsedForPath.current.data;
  }, [onParse, detectKindFromName]);

  // Build normalized VRPLIB problem for export
  const buildNormalizedProblem = useCallback((data) => {
    if (!data) return null;
    const wps = (data.waypoints ?? [])
      .map((w) => {
        const lon = Number(w.lon ?? (Array.isArray(w.coordinates) ? w.coordinates[0] : undefined));
        const lat = Number(w.lat ?? (Array.isArray(w.coordinates) ? w.coordinates[1] : undefined));
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        return {
          id: w.id,
          lon, lat,
          demand: Number.isFinite(Number(w.demand)) ? Number(w.demand) : undefined,
          time_window: Array.isArray(w.time_window) ? w.time_window : undefined,
          service_time: Number.isFinite(Number(w.service_time)) ? Number(w.service_time) : undefined,
          depot: !!w.depot
        };
      })
      .filter(Boolean);

    if (!wps.length) return null;

    const depot_index = Number.isInteger(data.depot_index) ? data.depot_index : 0;
    const fleet = Array.isArray(data.fleet?.vehicles)
      ? { vehicles: data.fleet.vehicles }
      : Array.isArray(data.fleet) ? { vehicles: data.fleet } : { vehicles: [] };

    if (!fleet.vehicles.length) {
      const totalDemand = wps.reduce((s, w) => s + Number(w.demand || 0), 0);
      fleet.vehicles = [{ id: 'veh-1', capacity: [Math.max(1, totalDemand)], start: depot_index, end: depot_index }];
    }

    const out = { waypoints: wps, fleet, depot_index };
    if (data.matrix?.distances) out.matrix = data.matrix;
    return out;
  }, []);

  const onSolveFromPath = useCallback(async (path) => {
    const parsedData = await ensureParsedForPath(path);
    await onSolveWithParsed(parsedData);
  }, [ensureParsedForPath]);

  const onSolveWithParsed = useCallback(async (parsedData) => {
    try {
      if (!parsedData?.waypoints?.length) throw new Error('Parse a file first.');
      const depotIndex = Number(parsedData.depot_index ?? 0);

      const pts = parsedData.waypoints
        .map(w => ({ lat: Number(w.lat ?? w.coordinates?.[1]), lon: Number(w.lon ?? w.coordinates?.[0]) }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

      let matrix = parsedData.matrix;
      if (!matrix?.distances && pts.length >= 2) {
        console.debug('[matrix] request', { adapter: routingAdapter, n: pts.length });
        const dmRes = await dm.mutateAsync({
          adapter: routingAdapter,
          origins: pts,
          destinations: pts,
          mode: 'driving'
        });
        matrix = dmRes?.data?.matrix || dmRes?.matrix;
        if (!matrix?.distances) throw new Error('No matrix.distances from /distance-matrix');
      }

      const fleet = Array.isArray(parsedData.fleet?.vehicles)
        ? { vehicles: parsedData.fleet.vehicles }
        : Array.isArray(parsedData.fleet) ? { vehicles: parsedData.fleet } : { vehicles: [] };

      if (!fleet.vehicles.length) {
        const totalDemand = (parsedData.waypoints || []).reduce((s, w) => s + Number(w.demand || 0), 0);
        fleet.vehicles = [{ id: 'veh-1', capacity: [Math.max(1, totalDemand)], start: depotIndex, end: depotIndex }];
      }

      const payload = { solver: solverEngine, depot_index: depotIndex, fleet, weights: { distance: 1, time: 0 } };
      if (vrpType === 'TSP') {
        payload.matrix = matrix;
      } else if (vrpType === 'CVRP') {
        payload.matrix = matrix;
        payload.demands = parsedData.waypoints.map(w => Number(w.demand || 0));
      } else if (vrpType === 'VRPTW') {
        payload.matrix = matrix;
        payload.node_time_windows = parsedData.waypoints.map(w =>
          Array.isArray(w.time_window) ? w.time_window : [0, 24 * 3600]
        );
        payload.node_service_times = parsedData.waypoints.map(w => Number(w.service_time || 0));
      } else if (vrpType === 'PDPTW') {
        payload.matrix = matrix;
        payload.node_time_windows = parsedData.waypoints.map(w =>
          Array.isArray(w.time_window) ? w.time_window : [0, 24 * 3600]
        );
        payload.node_service_times = parsedData.waypoints.map(w => Number(w.service_time || 0));
        if (Array.isArray(parsedData.pickup_delivery_pairs)) {
          payload.pickup_delivery_pairs = parsedData.pickup_delivery_pairs;
        }
        payload.demands = parsedData.waypoints.map(w => Number(w.demand || 0));
      } else if (matrix?.distances) {
        payload.matrix = matrix;
      }

      console.debug('[solver] request', { solver: solverEngine, vrpType, vehicles: fleet.vehicles.length });
      const res = await solve.mutateAsync(payload);

      const wpsForStore = parsedData.waypoints.map((w, i) => ({
        id: String(w.id ?? i),
        coordinates: [
          Number(w.lon ?? w.coordinates?.[0]),
          Number(w.lat ?? w.coordinates?.[1])
        ]
      }));

      addSolutionFromSolver(res, wpsForStore, {
        solver: solverEngine,
        adapter: routingAdapter,
        vrpType,
        id: `server-parse-${Date.now()}`
      });

      alert('Solve OK — see map & ResultSummaryPanel');
    } catch (err) {
      console.error('solve failed', err);
      alert(err?.message || 'Solve failed');
    }
  }, [dm, solve, addSolutionFromSolver, routingAdapter, solverEngine, vrpType]);

  // sanitize/auto-default export paths
  const sanitizeOutPath = (p, fallback) => {
    let s = String(p || '').trim();
    if (!s) s = fallback;
    s = s.replace(/^\/+/, ''); // relative to dataset root
    return s;
  };

  const onExportRaw = useCallback(async () => {
    if (!parsed) return alert('Parse something first.');
    const def = 'exports/parsed.json';
    const outPath = prompt(
      `Raw export path (relative to dataset root /custom_data/${dataset}/):`,
      def
    );
    if (outPath === null) return; // cancelled
    const safe = sanitizeOutPath(outPath, def);
    console.debug('[export] raw', safe);
    const contentStr = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    await writeRaw.mutateAsync({ path: safe, content: contentStr, overwrite: true });
    alert('Raw export saved.');
  }, [parsed, writeRaw, dataset]);

  const onExportVrplib = useCallback(async () => {
    if (!parsed) return alert('Parse something first.');
    const normalized = buildNormalizedProblem(parsed);
    if (!normalized) return alert('No valid waypoints to export.');
    const def = 'exports/out.vrp';
    const outPath = prompt(
      `VRPLIB export path (relative to dataset root /custom_data/${dataset}/):`,
      def
    );
    if (outPath === null) return;
    const safe = sanitizeOutPath(outPath, def);
    console.debug('[export] vrplib', safe);
    await writeVrplib.mutateAsync({
      path: safe,               // << correct key (not out_path)
      ...normalized,
    });
    alert('VRPLIB export saved.');
  }, [parsed, writeVrplib, buildNormalizedProblem, dataset]);

  // ----- derive folder list & visible files -----
  // dropdown: list of folders from current results (top-level under current browseCwd)
  const browseFolders = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      const name = typeof it === 'string' ? it : (it.name ?? it.path ?? '');
      const path = (typeof it === 'object' && it.path) ? it.path : joinPath(browseCwd, name);
      const rel = relativeToCwd(path, browseCwd);
      const parts = rel.split('/').filter(Boolean);
      if (parts.length > 1) set.add(joinPath(browseCwd, parts[0]) + '/');
      // Some backends return folders as items—catch those too
      if (isProbablyDir(it, name, path)) {
        const p = path.endsWith('/') ? path : `${path}/`;
        set.add(p);
      }
    }
    return [''].concat(Array.from(set).sort()); // '' means root of current dataset
  }, [items, browseCwd]);

  // show only files directly under browseCwd (not subfolders), and never show folders as rows
  const visibleFiles = useMemo(() => {
    const out = [];
    for (const it of items) {
      const displayName = typeof it === 'string' ? it : (it.name ?? it.path ?? '');
      const path = (typeof it === 'object' && it.path)
        ? it.path
        : joinPath(browseCwd, displayName);
      // exclude folders outright
      if (isProbablyDir(it, displayName, path)) continue;
      const rel = relativeToCwd(path, browseCwd);
      if (!rel.includes('/')) out.push({ it, displayName, path });
    }
    return out;
  }, [items, browseCwd]);

  // ===== UI
  return (
    <div className="space-y-3">
      {/* 1) Datasets & Upload */}
      <Section title="📁 Datasets & Upload" defaultOpen>
        <label className="block text-sm font-medium mb-1">Dataset</label>
        <select
          className="w-full p-1 border rounded mb-2 text-sm"
          value={dataset}
          onChange={(e) => { setDataset(e.target.value); setOffset(0); setParsed(null); setBrowseCwd(''); }}
        >
          <option value="">— Select a dataset —</option>
          {datasetOptions.map(d => (
            <option key={d.path} value={d.name}>{d.name}</option>
          ))}
        </select>

        {/* Upload-only subfolder */}
        <label className="block text-sm font-medium mb-1">Upload subfolder</label>
        <input
          className="w-full p-1 border rounded mb-2 text-sm"
          placeholder="e.g. imports/"
          value={uploadSubdir}
          onChange={(e) => setUploadSubdir(e.target.value.replace(/^\//, ''))}
          disabled={!dataset}
        />

        <div className="mb-1">
          <div className="text-sm font-medium mb-1">Upload file</div>
          <input type="file" multiple className="text-sm" onChange={onUpload} disabled={!dataset} />
          {upload.isPending && <div className="text-xs text-gray-500 mt-1">Uploading…</div>}
        </div>
      </Section>

      {/* 2) Browse Files */}
      <Section title="🗂️ Browse Files" defaultOpen>
        {/* Browsing folder (separate control) */}
        <div className="flex items-center gap-2 mb-2 text-sm">
          <label className="text-sm">Browse folder:</label>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <select
            className="p-1 w-30 border rounded"
            value={browseCwd}
            onChange={(e) => { 
              setBrowseCwd(e.target.value); setOffset(0);
             }}
            disabled={!dataset}
          >
            {browseFolders.map((f) => (
              <option key={f || '(root)'} value={f}>
                {f ? f : '(root)'}
              </option>
            ))}
          </select>
          <button
            className="px-2 py-1 border rounded text-sm disabled:opacity-50"
            disabled={!browseCwd}
            onClick={() => { setBrowseCwd(parentDir(browseCwd)); setOffset(0); }}
            title="Up one level"
          >
            Up
          </button>
          <button
            className="ml-auto px-2 py-1 border rounded text-sm disabled:opacity-50"
            onClick={refresh}
            disabled={!dataset}
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
          <input
            className="flex-1 p-1 border rounded"
            placeholder="🔍 name contains…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOffset(0); }}
            disabled={!dataset}
          />
          <input
            className="w-60 p-1 border rounded"
            placeholder=".csv,.geojson,.vrp"
            value={exts}
            onChange={(e) => { setExts(e.target.value); setOffset(0); }}
            disabled={!dataset}
          />
        </div>

        {/* Collapsible results box */}
        <Section title="Results" defaultOpen>
          <div className="max-h-60 overflow-y-auto border rounded p-2 text-sm space-y-2" aria-label="results-list">
            {!dataset && <div className="text-xs text-gray-500">Choose a dataset to browse files.</div>}

            {dataset && filesQ.isFetching && <div className="text-xs text-gray-500">Loading…</div>}
            {dataset && filesQ.isError && <div className="text-xs text-red-600">Error: {String(filesQ.error?.message || 'failed')}</div>}
            {dataset && !filesQ.isFetching && visibleFiles.length === 0 && (
              <div className="text-xs text-gray-400 italic">No files in this folder.</div>
            )}

            {dataset && visibleFiles.map(({ it, displayName, path }, idx) => (
              <div key={`${path}-${idx}`} className="p-2 border rounded">
                {/* filename (ellipsized, tooltip only — no highlight color) */}
                <div className="truncate font-mono" title={displayName}>
                  {displayName}
                </div>
                {it?.ext && <div className="text-[11px] text-gray-500">{String(it.ext)}</div>}

                {/* actions */}
                <div className="mt-1 flex flex-wrap gap-1">
                  <button
                    onClick={() => onParse(path, detectKindFromName(displayName))}
                    className="text-xs px-2 py-0.5 bg-emerald-600 text-white rounded"
                  >
                    Parse
                  </button>
                  <button
                    onClick={() => onSolveFromPath(path)}
                    className="text-xs px-2 py-0.5 bg-indigo-600 text-white rounded"
                  >
                    Solve
                  </button>
                  <button
                    onClick={() => onDelete(path)}
                    className="text-xs px-2 py-0.5 bg-rose-600 text-white rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pager */}
          {dataset && (
            <div className="mt-2 text-sm flex flex-col gap-2">
              <div>
                Page {Math.floor(offset / limit) + 1} / {Math.max(1, Math.ceil((total || 0) / limit))} ({total} items)
              </div>
              <div className="flex gap-1">
                <button
                  className="px-2 py-0.5 border rounded disabled:opacity-50"
                  disabled={offset <= 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  ⬅ Prev
                </button>
                <button
                  className="px-2 py-0.5 border rounded disabled:opacity-50"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next ➡
                </button>
                <select
                  className="px-2 w-24 p-0.5 border rounded"
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value) || 50); setOffset(0); }}
                >
                  {[25, 50, 100, 250].map(v => <option key={v} value={v}>{v}/pg</option>)}
                </select>
              </div>
            </div>
          )}
        </Section>
      </Section>

      {/* 3) Parsed & Actions */}
      <Section title="🧩 Parsed & Actions" defaultOpen>
        {!parsed && <div className="text-xs text-gray-600">Parse a file to preview/load/solve or export.</div>}
        {parsed && (
          <div className="text-xs space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded p-2">
                <div className="text-[11px] text-gray-500">Waypoints</div>
                <div className="font-medium">{parsed.waypoints?.length ?? 0}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-[11px] text-gray-500">Vehicles</div>
                <div className="font-medium">
                  {Array.isArray(parsed.fleet?.vehicles)
                    ? parsed.fleet.vehicles.length
                    : Array.isArray(parsed.fleet) ? parsed.fleet.length : 0}
                </div>
              </div>
              <div className="border rounded p-2">
                <div className="text-[11px] text-gray-500">Depot Index</div>
                <div className="font-medium">{String(parsed.depot_index ?? 0)}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-[11px] text-gray-500">Matrix</div>
                <div className="font-medium">
                  {parsed.matrix?.distances ? '✓ distances' : '—'}
                  {parsed.matrix?.durations ? ' + durations' : ''}
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {!loadedFileId ? (
                <button onClick={() => loadToMap(parsed, 'parsed')} className="text-xs px-3 py-1 bg-emerald-600 text-white rounded">➕ Load to Map</button>
              ) : (
                <button onClick={unloadFromMap} className="text-xs px-3 py-1 bg-gray-700 text-white rounded">🗑 Unload</button>
              )}
              <button onClick={() => onSolveWithParsed(parsed)} className="text-xs px-3 py-1 bg-indigo-600 text-white rounded">🧠 Solve</button>
              <button onClick={onExportRaw} className="text-xs px-3 py-1 bg-purple-600 text-white rounded">⬇️ Export RAW</button>
              <button onClick={onExportVrplib} className="text-xs px-3 py-1 bg-yellow-600 text-white rounded">⬇️ Export VRPLIB</button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
