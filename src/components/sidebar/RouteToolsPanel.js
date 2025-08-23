'use client';
import { useState, useMemo } from 'react';
import Section from '@/components/sidebar/Section';
import useRouteStore from '@/hooks/useRouteStore';
import useUiStore from '@/hooks/useUIStore';
import { computeETAsFromMatrix } from '@/utils/eta';

export default function RouteToolsPanel() {
  const { solutions } = useRouteStore(); 
  const { currentSolutionIndex } = useRouteStore();
  const { currentRouteIndex } = useRouteStore();

  // optional global toggle (if you don't have these in UI store, falls back to no-op)
  const showETAs = useUiStore(s => s.showETAs) ?? false;
  const setShowETAs = useUiStore(s => s.setShowETAs) || (() => { });

  const [busy, setBusy] = useState(false);
  const activeRoute = useMemo(() => {
    const sol = solutions?.[currentSolutionIndex];
    return sol?.routes?.[currentRouteIndex] || null;
  }, [solutions, currentSolutionIndex, currentRouteIndex]);

  const handleComputeETAs = async () => {
    if (!activeRoute?.coords?.length) return;
    setBusy(true);
    try {
      const { times, indices } = await computeETAsFromMatrix(activeRoute.coords, {
        profile: 'driving'
      });

      // Merge onto current route (immutable clone up to the route)
      useRouteStore.setState(s => {
        const sols = Array.isArray(s.solutions) ? [...s.solutions] : [];
        const sol = { ...(sols[currentSolutionIndex] || {}) };
        const routes = Array.isArray(sol.routes) ? [...sol.routes] : [];
        const r = { ...(routes[currentRouteIndex] || {}) };
        r.etaEpoch = times;        // epoch seconds; length ~ sampled pts
        r.etaIndices = indices;    // which vertex each time belongs to
        routes[currentRouteIndex] = r;
        sol.routes = routes;
        sols[currentSolutionIndex] = sol;
        return { solutions: sols };
      });

      setShowETAs(true);
      console.debug('[ETA] computed', { count: (times || []).length });
    } catch (e) {
      console.error('[ETA] error', e);
      alert(`ETA compute failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearETAs = () => {
    if (!activeRoute) return;
    useRouteStore.setState(s => {
      const sols = [...(s.solutions || [])];
      const sol = { ...(sols[currentSolutionIndex] || {}) };
      const routes = [...(sol.routes || [])];
      const r = { ...(routes[currentRouteIndex] || {}) };
      delete r.etaEpoch;
      delete r.etaIndices;
      routes[currentRouteIndex] = r;
      sol.routes = routes;
      sols[currentSolutionIndex] = sol;
      return { solutions: sols };
    });
  };

  return (
    <Section title="🛠 Route Tools">
      {!activeRoute ? (
        <div className="text-xs text-gray-500">No active route.</div>
      ) : (
        <>
          <div className="text-xs mb-2">
            Points: {activeRoute.coords?.length ?? 0}{' '}
            {activeRoute.etaEpoch ? `• ETAs: ${activeRoute.etaEpoch.length}` : ''}
          </div>

          <div className="flex gap-2">
            <button
              disabled={busy || !(activeRoute.coords?.length > 1)}
              onClick={handleComputeETAs}
              className="px-2 py-1 text-xs rounded bg-blue-600 text-white disabled:bg-gray-400"
            >
              {busy ? 'Computing…' : 'Compute ETAs'}
            </button>

            <button
              onClick={() => setShowETAs(!showETAs)}
              className="px-2 py-1 text-xs rounded bg-slate-700 text-white"
            >
              {showETAs ? 'Hide ETAs' : 'Show ETAs'}
            </button>

            <button
              onClick={handleClearETAs}
              className="px-2 py-1 text-xs rounded bg-gray-200"
            >
              Clear ETAs
            </button>
          </div>
        </>
      )}
    </Section>
  );
}
