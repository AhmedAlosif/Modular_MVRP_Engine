'use client';

import { useEffect, useMemo, useState } from 'react';
import Section from '@/components/sidebar/Section';
import {
  useBenchmarks,
  useBenchmarkFiles,
  useBenchmarkLoad
} from '@/hooks/useBackend';
import useWaypointStore from '@/hooks/useWaypointStore';
import useFleetStore from '@/hooks/useFleetStore';
import useMapStore from '@/hooks/useMapStore';
import fitToFeatures from '@/components/map/fitToFeatures';

export default function BenchmarkSelector() {
  // ---- stores / helpers ----
  const addWaypoint = useWaypointStore(s => s.addWaypoint);
  const removeWaypointsByFileId = useWaypointStore(s => s.removeWaypointsByFileId); // make sure this exists
  const setViewState = useMapStore(s => s.setViewState);

  const setVehiclesSoft = (vehicles) => {
    const st = useFleetStore.getState();
    if (typeof st.setVehicles === 'function') st.setVehicles(vehicles);
    else if (typeof st.replaceAll === 'function') st.replaceAll(vehicles);
    else if (typeof st.addVehicle === 'function') {
      // rudimentary fallback
      vehicles.forEach(v => st.addVehicle(v));
    }
  };

  // ---- datasets ----
  const benchmarksQ = useBenchmarks(); // { datasets: [{name}, ...] }
  const datasetOptions = benchmarksQ.data?.datasets?.map(d => d.name) ?? [];

  const [dataset, setDataset] = useState('');
  useEffect(() => {
    if (!dataset && datasetOptions.length) setDataset(datasetOptions[0]);
  }, [dataset, datasetOptions]);

  // ---- server-side file search / paging ----
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const filesParams = useMemo(() => {
    if (!dataset) return null;
    return {
      dataset,
      q: search || undefined,
      limit,
      offset,
      // You can also pass: exts: '.vrp,.txt', kind: 'instances', sort: 'name', order: 'asc'
    };
  }, [dataset, search, limit, offset]);

  const filesQ = useBenchmarkFiles(filesParams);
  const items = filesQ.data?.items ?? [];
  const total = filesQ.data?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  // ---- load instance ----
  const [currentFileId, setCurrentFileId] = useState(null); // for clearing waypoints from this load
  const loadQ = useBenchmarkLoad();

  const handleLoad = async (name) => {
    if (!dataset || !name) return;
    try {
      const res = await loadQ.refetch({ // useQuery-style API: ensure we call queryFn with params
        throwOnError: true,
        queryKey: ['benchmarkLoad', { dataset, name }]
      });
      const payload =
        res?.data ??
        (loadQ.data?.data && dataset === loadQ.data?.args?.dataset ? loadQ.data?.data : null);

      // If your hook is mutation-like, replace the above with:
      // const { data: payload } = await loadQ.mutateAsync({ dataset, name });

      const data = payload || loadQ.data?.data || loadQ.data; // be defensive
      if (!data) throw new Error('Empty load response');

      const fileId = `bench:${dataset}:${name}:${Date.now()}`;

      // waypoints: backend shape -> UI shape
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

      // push them (append)
      wp.forEach(addWaypoint);

      // fleet
      const vehicles =
        Array.isArray(data.fleet) ? data.fleet
          : Array.isArray(data.fleet?.vehicles) ? data.fleet.vehicles
            : [];
      setVehiclesSoft(vehicles);

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
      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 p-1 border rounded text-sm"
          placeholder="🔍 Search (e.g. c101, R1, 100)"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
        />
        <select
          className="w-24 p-1 border rounded text-sm"
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
              {it.pair?.solution && (
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
        <div>
          Page {page} / {pages} ({total} items)
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
        </div>
      </div>

      {/* Loaded state */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-600">
            {currentFileId ? 'Instance loaded.' : 'No instance loaded.'}
          </div>
          {currentFileId && (
            <button
              onClick={clearLoaded}
              className="text-xs px-2 py-0.5 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Clear loaded
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}
