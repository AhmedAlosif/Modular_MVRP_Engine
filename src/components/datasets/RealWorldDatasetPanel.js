'use client';

import { useEffect, useState } from 'react';
import Section from '@/components/sidebar/Section';

const PROVIDERS = ['OpenStreetMap', 'OpenTransport', 'OpenDataHub'];
const FEATURES = ['roads', 'buildings', 'pois', 'landuse'];

export default function RealWorldDatasetPanel() {
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [location, setLocation] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch existing datasets from backend
  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/datasets');
      const data = await res.json();
      setDatasets(data || []);
    } catch (err) {
      setError('Failed to fetch datasets');
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const toggleFeature = (feature) => {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/datasets/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, location, features: selectedFeatures }),
      });

      if (!res.ok) throw new Error('Download failed');
      await fetchDatasets(); // Refresh list
    } catch (err) {
      setError('Download failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action) => {
    try {
      const res = await fetch(`/api/datasets/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(`${action} failed`);
    } catch {
      setError(`Failed to ${action} dataset`);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/datasets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchDatasets(); // Refresh list
    } catch {
      setError('Delete failed');
    }
  };

  return (
    <Section title="🌍 Real-World Dataset">
      {/* Download Controls */}
      <div className="mb-4 space-y-2 text-sm">
        <label>Provider:</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full p-1 border rounded"
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <label className="block mt-2">Features:</label>
        <div className="flex flex-wrap gap-2">
          {FEATURES.map((f) => (
            <button
              key={f}
              onClick={() => toggleFeature(f)}
              className={`px-2 py-0.5 rounded text-xs border ${
                selectedFeatures.includes(f)
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <label className="block mt-2">Location:</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., Berlin"
          className="w-full p-1 border rounded"
        />

        <button
          onClick={handleDownload}
          disabled={loading}
          className="w-full mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
        >
          {loading ? 'Downloading...' : '⬇️ Download Dataset'}
        </button>
        {error && <div className="text-red-500 text-xs">{error}</div>}
      </div>

      {/* Dataset List */}
      <div className="text-sm">
        <h3 className="font-semibold mb-2">📂 Datasets</h3>
        {datasets.length === 0 && <div className="text-gray-400 italic">No datasets yet.</div>}

        <ul className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
          {datasets.map((ds) => (
            <li key={ds.id} className="border p-2 rounded shadow-sm bg-white flex flex-col">
              <div className="flex justify-between items-center">
                <div className="font-medium">{ds.location}</div>
                <div className="text-xs text-gray-500">{ds.provider}</div>
              </div>
              <div className="text-xs mt-1 text-gray-700">
                Features: {ds.features?.join(', ') || 'None'}
              </div>

              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  onClick={() => handleAction(ds.id, 'load')}
                  className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded"
                >
                  Load
                </button>
                <button
                  onClick={() => handleAction(ds.id, 'export')}
                  className="px-2 py-0.5 text-xs bg-yellow-600 text-white rounded"
                >
                  Export
                </button>
                <button
                  onClick={() => handleAction(ds.id, 'import')}
                  className="px-2 py-0.5 text-xs bg-purple-600 text-white rounded"
                >
                  Import
                </button>
                <button
                  onClick={() => handleDelete(ds.id)}
                  className="px-2 py-0.5 text-xs bg-red-600 text-white rounded"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}