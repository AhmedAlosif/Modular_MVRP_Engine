'use client';

import { useState } from 'react';
import useWaypointStore from '@/hooks/useWaypointStore';
import fitToFeatures from '@/components/map/fitToFeatures';
import useMapStore from '@/hooks/useMapStore';

const SidebarSearchBox = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [coordError, setCoordError] = useState('');

  const addWaypoint = useWaypointStore((s) => s.addWaypoint);
  const setViewState = useMapStore((s) => s.setViewState);

  const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;

  const validateLatLon = (input) => {
    if (typeof input !== 'string') return { valid: false, reason: 'Input must be a string' };

    const trimmed = input.trim();
    const regex = /^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/;
    const match = trimmed.match(regex);
    if (!match) return { valid: false, reason: 'Not in valid lat,lon format' };

    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[3]);

    if (isNaN(lat) || isNaN(lon)) return { valid: false, reason: 'Invalid number format' };
    if (lat < -90 || lat > 90) return { valid: false, reason: '(Lat,Log) Latitude must be between -90 and 90' };
    if (lon < -180 || lon > 180) return { valid: false, reason: '(Lat,Log) Longitude must be between -180 and 180' };

    return { valid: true, lat, lon };
  };

  const handleSearch = async (value) => {
    setCoordError('');
    setResults([]);

    const validation = validateLatLon(String(value).trim());
    if (validation.valid) {
      const { lat, lon } = validation;

      addWaypoint({
        coordinates: [lon, lat],
        id: Date.now(),
        demand: 1,
        capacity: 5,
        serviceTime: 10,
        timeWindow: [8, 17],
      });

      fitToFeatures([lon, lat], { setViewState });
      setQuery('');
      return;
    }

    else if (typeof value === 'string' && value.includes(",")) {
      setCoordError(validation.reason);
      return;
    }

    if (value.length < 3) return;

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

    fitToFeatures([lng, lat], { setViewState });
    setQuery('');
    setResults([]);
  };

  return (
    <div className="mb-4">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const val = e.target.value;
          setQuery(val); // ✅ Always update input field
          if (val.length >= 3 && !validateLatLon(val).valid) {
            handleSearch(val); // ✅ Forward search only if not valid coordinate
          } else {
            setResults([]); // ✅ Clear forward suggestions
          }
          setCoordError(''); // Clear error as user types
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const validation = validateLatLon(query);
            if (validation.valid) {
              const { lat, lon } = validation;
              addWaypoint({
                coordinates: [lon, lat],
                id: Date.now(),
                demand: 1,
                capacity: 5,
                serviceTime: 10,
                timeWindow: [8, 17],
              });
              fitToFeatures([lon, lat], { setViewState });
              setQuery('');
              setResults([]);
            } else if (query.includes(',')) {
              setCoordError(validation.reason || 'Invalid coordinates');
            }
          }
        }}
        placeholder="🔍 Search place or coordinate"
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
      {coordError && (
        <div className="text-xs text-red-600 mt-1">{coordError}</div>
      )}
    </div>
  );
};

export default SidebarSearchBox;
