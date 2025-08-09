'use client';

import { useState } from 'react';
import Section from '@/components/sidebar/Section';

export default function CustomDatasetPanel() {
  const [datasets, setDatasets] = useState([]);
  const [errors, setErrors] = useState([]);

  const handleImport = async (event) => {
    const files = Array.from(event.target.files);
    setErrors([]);

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();

      if (!['vrp', 'json'].includes(ext)) {
        setErrors((prev) => [...prev, `Unsupported format: ${file.name}`]);
        continue;
      }

      try {
        const text = await file.text();
        const content = ext === 'json' ? JSON.parse(text) : text;

        const newItem = {
          id: Date.now() + Math.random(),
          name: file.name,
          type: ext === 'vrp' ? 'VRPLib (.vrp)' : 'Custom JSON',
          content,
        };

        setDatasets((prev) => [...prev, newItem]);
      } catch (err) {
        setErrors((prev) => [...prev, `Failed to import ${file.name}: ${err.message}`]);
      }
    }
  };

  const handleAction = (id, action) => {
    const item = datasets.find((d) => d.id === id);
    if (!item) return;

    if (action === 'load') {
      console.log('Load:', item.name, item.content);
    } else if (action === 'export') {
      const blob = new Blob(
        [typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } else if (action === 'delete') {
      setDatasets((prev) => prev.filter((d) => d.id !== id));
    }
  };

  return (
    <Section title="📁 Custom Datasets">
      {/* Import Control */}
      <div className="mb-4 space-y-2 text-sm">
        <input
          type="file"
          multiple
          accept=".vrp,.json"
          onChange={handleImport}
          className="w-full text-sm"
        />
        {errors.length > 0 && (
          <div className="text-red-600 text-xs space-y-1">
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
      </div>

      {/* Dataset List */}
      <div className="text-sm">
        <h3 className="font-semibold mb-2">📦 Uploaded Datasets</h3>
        {datasets.length === 0 ? (
          <div className="text-gray-400 italic">No custom datasets yet.</div>
        ) : (
          <ul className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
            {datasets.map((ds) => (
              <li key={ds.id} className="border p-2 rounded shadow-sm bg-white flex flex-col">
                <div className="flex justify-between items-center">
                  <div className="font-medium">{ds.name}</div>
                  <div className="text-xs text-gray-500">{ds.type}</div>
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
                    onClick={() => handleAction(ds.id, 'delete')}
                    className="px-2 py-0.5 text-xs bg-red-600 text-white rounded"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}