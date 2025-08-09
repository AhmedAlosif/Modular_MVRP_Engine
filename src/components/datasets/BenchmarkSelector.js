'use client';

import { useEffect, useState } from 'react';
import Section from '@/components/sidebar/Section';

export default function BenchmarkSelector({ fetchBenchmarks, onSelect }) {
  const [type, setType] = useState('');
  const [availableTypes, setAvailableTypes] = useState([]);
  const [instances, setInstances] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filters, setFilters] = useState({
    size: '',
    category: '',
    search: '',
  });

  // Fetch benchmark list
  useEffect(() => {
    async function load() {
      const result = await fetchBenchmarks(); // expected format: { types, data }
      setAvailableTypes(result.types);
      setType(result.types[0]);
      setInstances(result.data);
    }
    load();
  }, [fetchBenchmarks]);

  // Apply filters
  useEffect(() => {
    if (!type || !instances[type]) return;

    let list = instances[type];

    if (filters.size) list = list.filter(name => name.includes(filters.size));
    if (filters.category) list = list.filter(name => name.toLowerCase().startsWith(filters.category));
    if (filters.search.trim()) {
      const s = filters.search.toLowerCase();
      list = list.filter(name => name.toLowerCase().includes(s));
    }

    setFiltered(list);
  }, [type, filters, instances]);

  return (
    <Section title="🧪 Benchmark Selector">
      {/* Benchmark Type Dropdown */}
      <label className="block text-sm font-medium mb-1">Benchmark Type:</label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="w-full p-1 border rounded mb-3 text-sm"
      >
        {availableTypes.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Filters Row */}
      <div className="flex gap-2 mb-2 text-sm">
        <select
          value={filters.size}
          onChange={(e) => setFilters(f => ({ ...f, size: e.target.value }))}
          className="w-1/2 p-1 border rounded"
        >
          <option value="">Size</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}
          className="w-1/2 p-1 border rounded"
        >
          <option value="">Type</option>
          <option value="c">C</option>
          <option value="r">R</option>
          <option value="rc">RC</option>
        </select>
      </div>

      {/* Search Filter */}
      <input
        type="text"
        placeholder="🔍 Search instances"
        value={filters.search}
        onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
        className="w-full p-1 border rounded mb-3 text-sm"
      />

      {/* Instance List */}
      <div className="max-h-56 overflow-y-auto border rounded p-2 text-sm space-y-1">
        {filtered.map(name => (
          <div key={name} className="flex justify-between items-center">
            <span className="truncate">{name}</span>
            <button
              onClick={() => onSelect(type, name)}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Load
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-gray-400 italic text-xs">No matching instances</div>
        )}
      </div>
    </Section>
  );
}
