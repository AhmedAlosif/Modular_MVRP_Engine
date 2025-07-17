"use client";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import Section from "./Section";
import dynamic from "next/dynamic";
import { useMapLogic } from "@/hooks/useMapLogic";

const FileUpload = dynamic(() => import("./FileUpload"), { ssr: false });

export default function Sidebar({
  
  onImportGeojson,
  onSearchChange = () => { },
  searchQuery = "",
  suggestions = [],
  loading = false,
  onSuggestionClick = () => { },
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const {
    waypointsVisible,
    setWaypointsVisible,
    onResetWaypoints,
    onToggleVisibility,
    newWaypoint,
    waypoints,
    setNewWaypoint,
    onAddWaypoint,
  } = useMapLogic();

  return (
    <div
      className={`absolute top-0 left-0 h-full bg-white dark:bg-gray-800 border-r dark:border-gray-700 shadow-lg z-20 transition-all duration-300 ease-in-out ${sidebarOpen ? "w-72" : "w-12"
        }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b dark:border-gray-600">
        <h2
          className={`text-sm font-semibold text-gray-800 dark:text-white transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
            }`}
        >
          Controls
        </h2>
        <button
          className="text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <ChevronLeftIcon className="h-5 w-5" />
          ) : (
            <ChevronRightIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Content */}
      <div
        className={`overflow-y-auto h-[calc(100%-3rem)] px-4 py-4 space-y-6 transition-opacity duration-300 ${sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
      >
        {/* 🔍 Search Section */}
        <Section title="🔍 Search Location">
          <input
            type="text"
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="e.g. Berlin, park"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
          />
          {loading && <p className="text-xs text-gray-500 mt-1">Loading...</p>}
          {suggestions.length > 0 && (
            <ul className="mt-2 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-md shadow text-sm max-h-48 overflow-y-auto z-50">
              {suggestions.map((place, idx) => (
                <li
                  key={idx}
                  onClick={() => onSuggestionClick(place)}
                  className="px-2 py-1 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800 text-gray-800 dark:text-white"
                >
                  {place.display_name || place.properties?.name}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 📂 GeoJSON Upload */}
        <Section title="📂 Import GeoJSON">
          <FileUpload onImport={onImportGeojson} />
        </Section>

        {/* 🚚 Fleet */}
        <Section title="🚚 Fleet Config">
          <input
            type="number"
            placeholder="Fleet size"
            className="w-full px-2 py-1 border rounded-md text-sm dark:bg-gray-700 dark:text-white"
          />
          <select className="w-full px-2 py-1 border rounded-md text-sm dark:bg-gray-700 dark:text-white">
            <option>Truck</option>
            <option>Bike</option>
            <option>Van</option>
          </select>
        </Section>

        {/* 🧠 Solver */}
        <Section title="🧠 Solver Settings">
          <select className="w-full px-2 py-1 border rounded-md text-sm dark:bg-gray-700 dark:text-white">
            <option>OR-Tools</option>
            <option>VROOM</option>
            <option>jsprit</option>
          </select>
          <input
            type="number"
            placeholder="Max stops per vehicle"
            className="w-full px-2 py-1 border rounded-md text-sm dark:bg-gray-700 dark:text-white"
          />
        </Section>

        {/* 📥 Import VRP */}
        <Section title="📥 Import VRP">
          <input type="file" accept=".json" className="text-sm" />
        </Section>

        {/* 📤 Export */}
        <Section title="📤 Export GeoJSON">
          <button className="w-full text-center bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 text-sm">
            Export
          </button>
        </Section>

        {/* Waypoint Controls */}
        <Section title="🗺️ Waypoints">
          <div className="flex justify-between mb-2">
            <button
              onClick={onResetWaypoints}
              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Reset
            </button>
            <button
              onClick={onToggleVisibility}
              className="text-xs px-2 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              {waypointsVisible ? "Hide" : "Show"}
            </button>
          </div>

          {/* Waypoint Manual Add */}
          <div className="flex mb-2 space-x-2">
            <input
              type="text"
              value={newWaypoint}
              onChange={(e) => setNewWaypoint(e.target.value)}
              placeholder="Lng,Lat"
              className="w-full px-2 py-1 border rounded text-sm dark:bg-gray-700 dark:text-white"
            />
            <button
              onClick={() => {
                const parts = newWaypoint.split(",").map(Number);
                if (parts.length === 2 && parts.every((n) => !isNaN(n))) {
                  onAddWaypoint(parts);
                  setNewWaypoint("");
                }
              }}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add
            </button>
          </div>

          {/* Waypoint List with Actions */}
          <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
            {waypoints.map(([lng, lat], index) => (
              <li key={index} className="flex items-center justify-between">
                <span className="truncate text-gray-700 dark:text-gray-200">
                  {lng.toFixed(4)}, {lat.toFixed(4)}
                </span>
                <div className="space-x-1">
                  <button
                    onClick={() => onMoveWaypoint(index, -1)}
                    className="text-xs px-1 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMoveWaypoint(index, 1)}
                    className="text-xs px-1 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={index === waypoints.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => onRemoveWaypoint(index)}
                    className="text-xs px-1 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="🗺️ Waypoint Controls">
          <button
            onClick={onAddWaypoint}
            className="w-full bg-blue-600 text-white text-sm px-2 py-1 rounded"
          >
            ➕ Add Waypoint
          </button>

          <button
            onClick={() => setWaypoints([])}
            className="w-full bg-red-500 text-white text-sm px-2 py-1 rounded mt-2"
          >
            ❌ Reset Waypoints
          </button>

          <button
            onClick={() => setWaypointsVisible((v) => !v)}
            className="w-full bg-gray-500 text-white text-sm px-2 py-1 rounded mt-2"
          >
            {waypointsVisible ? "🙈 Hide" : "👁 Show"} Waypoints
          </button>
        </Section>
        {/* 📊 Output */}
        <Section title="📊 Route Summary">
          <p className="text-sm text-gray-600 dark:text-gray-300">Distance: 12.5 km</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">CO₂: 4.3 kg</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Vehicles: 2</p>
        </Section>
      </div>
    </div>
  );
}