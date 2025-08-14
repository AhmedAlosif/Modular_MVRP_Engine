'use client';

import Section from '@/components/sidebar/Section';
import useRouteStore from '@/hooks/useRouteStore';
import React from 'react';

export default function ResultSummaryPanel() {
  const routes = useRouteStore(s => s.routes);
  const summary = useRouteStore(s => s.summary);
  const currentIndex = useRouteStore(s => s.currentIndex);
  const setIndex = useRouteStore(s => s.setIndex);
  const clearRoutes = useRouteStore(s => s.clearRoutes);

  if (!routes.length || !summary) {
    return (
      <Section title="📊 VRP Result Summary">
        <div className="text-sm text-gray-500">No results yet. Run the solver to see routes.</div>
      </Section>
    );
  }

  const route = routes[currentIndex];

  const handleRouteChange = (type) => {
    if (type === 'prev') setIndex(currentIndex - 1);
    if (type === 'next') setIndex(currentIndex + 1);
    if (type === 'best') setIndex(0);
    if (type === 'last') setIndex(routes.length - 1);
  };

  const handleAction = (action) => {
    if (action === 'clear') clearRoutes();
    if (action === 'export') {
      // quick export current route as GeoJSON LineString
      const gj = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: route.coords },
          properties: { vehicleId: route.vehicleId, index: route.index }
        }]
      };
      const blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `route-${route.index + 1}.geojson`; a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Section title="📊 VRP Result Summary">
      <div className="text-sm space-y-1 mb-4">
        <div><strong>Label:</strong> {summary.label}</div>
        <div><strong>Total Distance:</strong> {summary.totalDistance.toFixed(2)} km</div>
        <div><strong>Total Time:</strong> {(summary.totalDuration / 3600).toFixed(2)} h</div>
        <div><strong>Vehicles Used:</strong> {summary.vehiclesUsed}</div>
        <div><strong>Route:</strong> {currentIndex + 1} / {summary.routeCount}</div>
        <div className="mt-2 text-xs text-gray-600">
          <strong>Current Vehicle:</strong> {route.vehicleId} ·
          <span className="ml-2">Distance: {route.totalDistance.toFixed(2)} km</span> ·
          <span className="ml-2">Time: {(route.totalDuration / 3600).toFixed(2)} h</span>
        </div>
      </div>

      {/* Route Controls */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button onClick={() => handleRouteChange('best')} className="text-xs px-2 py-1 bg-green-600 text-white rounded">Best</button>
        <button onClick={() => handleRouteChange('last')} className="text-xs px-2 py-1 bg-emerald-600 text-white rounded">Eco/Last</button>
        <button onClick={() => handleRouteChange('prev')} className="text-xs px-2 py-1 bg-gray-500 text-white rounded">⬅ Prev</button>
        <button onClick={() => handleRouteChange('next')} className="text-xs px-2 py-1 bg-gray-500 text-white rounded">Next ➡</button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => handleAction('export')} className="text-xs px-3 py-1 bg-purple-600 text-white rounded">
          Export Current
        </button>
        <button onClick={() => handleAction('clear')} className="text-xs px-3 py-1 bg-red-600 text-white rounded">
          Clear
        </button>
      </div>
    </Section>
  );
}
