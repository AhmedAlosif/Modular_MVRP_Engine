// components/DatabaseSelector.js
"use client";
import { useState, useEffect } from "react";
import fs from "fs/promises"; // Only works server-side
import path from "path";

export default function DatabaseSelector({ onSelect }) {
  const [dbType, setDbType] = useState("benchmarks");
  const [instances, setInstances] = useState([]);

  useEffect(() => {
    fetch(`/api/instances?type=${dbType}`)
      .then((res) => res.json())
      .then((data) => setInstances(data.files));
  }, [dbType]);

  return (
    <div className="space-y-2">
      <select
        className="w-full border px-2 py-1"
        value={dbType}
        onChange={(e) => setDbType(e.target.value)}
      >
        <option value="custom">Custom</option>
        <option value="realworld">Real World</option>
        <option value="benchmarks">Benchmarks</option>
      </select>

      <ul className="space-y-1">
        {instances.map((name) => (
          <li key={name}>
            <button
              className="text-blue-600 hover:underline"
              onClick={() => onSelect({ dbType, name })}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
