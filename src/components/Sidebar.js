'use client';
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import Section from "@/components/Section";
import useWaypointStore from "@/hooks/useWaypointStore";
import FileUpload from "@/components/FileUpload";
import WaypointSidebar from "@/components/WaypointSidebar";
import FleetConfigSidebar from "@/components/FleetConfigSidebar";
import SidebarSearchBox from "@/components/SidebarSearchBox";
import useVrpStore from "@/hooks/useVRPStore";
import useMapStore from "@/hooks/useMapStore";
import ExportGeoJSON from "@/components/ExportGeoJSON";

const API_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY;

export default function Sidebar({ }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    addWaypoint,
  } = useWaypointStore();

  const {
    GeojsonFiles,
    toggleFileVisibility,
    removeGeojsonFile,
    zoomToFile,
    setGeojsonFiles,
  } = useVrpStore();

  const{ 
    setViewState,
  } = useMapStore();

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
          <SidebarSearchBox apiKey={API_KEY} onWaypoint={addWaypoint} />
        </Section>

        {/* 📂 GeoJSON Upload */}
        <Section title="📂 Import GeoJSON">
          <FileUpload onImport={(data) => {
            setGeojsonFiles(data);
          }} />
          {GeojsonFiles.map(file => (
            <div key={file.id} className="p-2 border rounded mb-1">
              <div className="font-medium">{file.name}</div>
              <div className="flex space-x-2 mt-1">
                <button onClick={() => toggleFileVisibility(file.id)}>👁 {file.visible ? 'Hide' : 'Show'}</button>
                <button onClick={() => removeGeojsonFile(file.id)}>🗑 Remove</button>
                <button onClick={() => zoomToFile(file.name, setViewState)}>🎯 Zoom</button>
              </div>
            </div>
          ))}
        </Section>

        {/* 🚚 Fleet */}
        <FleetConfigSidebar />
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

        {/* 🗺️ Waypoints */}
        <WaypointSidebar />
        {/* 📤 Export */}
        <Section title="📤 Export GeoJSON">
          <ExportGeoJSON />
        </Section>

        {/* 📊 Summary */}
        <Section title="📊 Route Summary">
          <p className="text-sm text-gray-600 dark:text-gray-300">Distance: 12.5 km</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">CO₂: 4.3 kg</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Vehicles: 2</p>
        </Section>
      </div>
    </div>
  );
}
