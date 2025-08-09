'use client';

import { useState } from 'react';
import Section from '@/components/sidebar/Section';

export default function ResultSummaryPanel() {
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0);

  // Mock summary data (replace with backend result or Zustand store)
  const summary = {
    totalDistance: 280.5,
    totalTime: 7.2,
    totalCost: 132.4,
    vehiclesUsed: 4,
    routeCount: 3,
    label: "Best Route"
  };

  const handleRouteChange = (type) => {
    if (type === 'prev') {
      setCurrentRouteIndex((prev) => Math.max(0, prev - 1));
    } else if (type === 'next') {
      setCurrentRouteIndex((prev) => Math.min(summary.routeCount - 1, prev + 1));
    } else if (type === 'best') {
      setCurrentRouteIndex(0);
    } else if (type === 'eco') {
      setCurrentRouteIndex(summary.routeCount - 1); // mock
    }
  };

  const handleAction = (action) => {
    if (action === 'export') {
      console.log('Exporting result...');
    } else if (action === 'clear') {
      console.log('Clearing result...');
    } else if (action === 'visualize') {
      console.log('Visualizing result...');
    }
  };

  return (
    <Section title="📊 VRP Result Summary">
      <div className="text-sm space-y-1 mb-4">
        <div><strong>Label:</strong> {summary.label}</div>
        <div><strong>Total Distance:</strong> {summary.totalDistance} km</div>
        <div><strong>Total Time:</strong> {summary.totalTime} h</div>
        <div><strong>Total Cost:</strong> ${summary.totalCost}</div>
        <div><strong>Vehicles Used:</strong> {summary.vehiclesUsed}</div>
        <div><strong>Route Index:</strong> {currentRouteIndex + 1} / {summary.routeCount}</div>
      </div>

      {/* Route Controls */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={() => handleRouteChange('best')}
          className="text-xs px-2 py-1 bg-green-600 text-white rounded"
        >
          Best Route
        </button>
        <button
          onClick={() => handleRouteChange('eco')}
          className="text-xs px-2 py-1 bg-yellow-600 text-white rounded"
        >
          Eco Route
        </button>
        <button
          onClick={() => handleRouteChange('prev')}
          className="text-xs px-2 py-1 bg-gray-500 text-white rounded"
        >
          ⬅ Prev
        </button>
        <button
          onClick={() => handleRouteChange('next')}
          className="text-xs px-2 py-1 bg-gray-500 text-white rounded"
        >
          Next ➡
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleAction('visualize')}
          className="text-xs px-3 py-1 bg-blue-600 text-white rounded"
        >
          Visualize
        </button>
        <button
          onClick={() => handleAction('export')}
          className="text-xs px-3 py-1 bg-purple-600 text-white rounded"
        >
          Export
        </button>
        <button
          onClick={() => handleAction('clear')}
          className="text-xs px-3 py-1 bg-red-600 text-white rounded"
        >
          Clear
        </button>
      </div>
    </Section>
  );
}