'use client';

import { useState } from 'react';
import useWaypointStore from '@/hooks/useWaypointStore';
import fitToFeatures from '@/components/fitToFeatures';
import useMapStore from '@/hooks/useMapStore';

const SidebarSearchBox = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const addWaypoint = useWaypointStore((s) => s.addWaypoint);
  const setViewState = useMapStore((s) => s.setViewState);

  const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;

  const handleSearch = async (e) => {
    const value = e.target.value;
    setQuery(value);

    if (value.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `https://locationiq.com/v1/autocomplete?key=${apiKey}&q=${encodeURIComponent(value)}&format=json&limit=5`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setResults(data);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (place) => {
    const lng = parseFloat(place.lon);
    const lat = parseFloat(place.lat);

    addWaypoint({
      coordinates: [lng, lat],
      id: Date.now(),
      demand: 1,
      capacity: 5,
      serviceTime: 10,
      timeWindow: [8, 17],
    });

    fitToFeatures( [lng, lat], { setViewState });
    setQuery('');
    setResults([]);
  };

  return (
    <div className="mb-4">
      <input
        type="text"
        value={query}
        onChange={handleSearch}
        placeholder="🔍 Search address or place"
        className="w-full px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:text-white"
      />

      {loading && (
        <div className="text-xs text-gray-500 mt-1">Loading...</div>
      )}

      {results.length > 0 && (
        <ul className="mt-1 border rounded bg-white dark:bg-gray-800 shadow text-sm max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <li
              key={i}
              onClick={() => handleSelect(r)}
              className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SidebarSearchBox;
