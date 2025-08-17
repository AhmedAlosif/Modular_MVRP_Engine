'use client';
import { useEffect, useMemo } from 'react';
import Section from '@/components/sidebar/Section';
import useRouteStore from '@/hooks/useRouteStore';

export default function ResultSummaryPanel() {
  const routes       = useRouteStore(s => s.routes);
  const summary      = useRouteStore(s => s.summary);
  const currentIndex = useRouteStore(s => s.currentIndex);
  const setIndex     = useRouteStore(s => s.setIndex);
  const removeAt     = useRouteStore(s => s.removeRouteAt);
  const clearAll     = useRouteStore(s => s.clearAllRoutes);

  useEffect(() => {
    if (!routes || routes.length === 0) {
      if (currentIndex !== 0) setIndex(0);
      return;
    }
    if (currentIndex < 0 || currentIndex >= routes.length) {
      setIndex(Math.min(routes.length - 1, Math.max(0, currentIndex)));
    }
  }, [routes, currentIndex, setIndex]);

  const current = useMemo(
    () => (routes && routes.length ? routes[currentIndex] : null),
    [routes, currentIndex]
  );

  const routeCount = routes?.length ?? 0;

  const onPrev = () => setIndex(currentIndex - 1);
  const onNext = () => setIndex(currentIndex + 1);
  const onBest = () => setIndex(0);
  const onEco  = () => setIndex(routeCount - 1);

  const onClearCurrent = () => {
    if (routeCount > 0) removeAt(currentIndex);
  };

  const onExport = () => {
    if (!current) return;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `route-${currentIndex + 1}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section title="📊 VRP Result Summary">
      {summary && (
        <div className="text-sm space-y-1 mb-4">
          <div className="font-medium">Solution: <span className="text-gray-800">{summary.label}</span></div>
          <div>Solver: <strong>{current?.meta?.solver ?? 'unknown'}</strong></div>
          <div>Adapter: <strong>{current?.meta?.adapter ?? 'unknown'}</strong></div>
          <div>Type: <strong>{current?.meta?.vrpType ?? 'unknown'}</strong></div>

          <div><strong>Total Distance:</strong> {(summary.totalDistance ?? 0).toFixed(2)} km</div>
          <div><strong>Total Duration:</strong> {Math.round((summary.totalDuration ?? 0) / 60)} min</div>
          <div><strong>Vehicles Used:</strong> {summary.vehiclesUsed ?? 0}</div>
          <div><strong>Route:</strong> {routeCount ? `${currentIndex + 1} / ${routeCount}` : '—'}</div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={onBest} className="text-xs px-2 py-1 bg-green-600 text-white rounded">Best Route</button>
        <button onClick={onEco}  className="text-xs px-2 py-1 bg-yellow-600 text-white rounded">Eco Route</button>
        <button onClick={onPrev} disabled={currentIndex <= 0} className="text-xs px-2 py-1 bg-gray-500 text-white rounded disabled:opacity-50">⬅ Prev</button>
        <button onClick={onNext} disabled={currentIndex >= routeCount - 1} className="text-xs px-2 py-1 bg-gray-500 text-white rounded disabled:opacity-50">Next ➡</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={onExport} className="text-xs px-3 py-1 bg-blue-600 text-white rounded">Export</button>
        <button onClick={onClearCurrent} disabled={!routeCount} className="text-xs px-3 py-1 bg-orange-600 text-white rounded disabled:opacity-50">Clear Current</button>
        <button onClick={clearAll} disabled={!routeCount} className="text-xs px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50">Clear All</button>
      </div>
    </Section>
  );
}
