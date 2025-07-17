"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Head from "next/head";


const DynamicMapComponent = dynamic(() => import("../components/MapComponent"), {
  ssr: false,
});

export default function Home() {
  const [geojsonFile, setGeojsonFile] = useState(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationTags, setLocationTags] = useState([]);
  const [vrpConfig, setVrpConfig] = useState({ fleetSize: 1, vehicleType: "van", constraints: "" });
  const [selectedSolver, setSelectedSolver] = useState("ortools");
  const [vrpOutput, setVrpOutput] = useState(null);
  const [vrpInstanceFile, setVrpInstanceFile] = useState(null);
  const [mapProps, setMapProps] = useState(null);

  const handleFileChange = (e) => setGeojsonFile(e.target.files[0]);
  const handleVrpInstanceChange = (e) => setVrpInstanceFile(e.target.files[0]);

  const handleExportGeoJSON = () => {
    alert("Export to GeoJSON not implemented yet.");
  };

  const handleSubmitLocationQuery = () => {
    alert(`Querying for ${locationQuery} with tags ${locationTags.join(", ")}`);
  };

  const handleRunSolver = () => {
    alert(`Running ${selectedSolver} with fleet size ${vrpConfig.fleetSize}`);
  };

  useEffect(() => {
    setMapProps({ geojsonFile, vrpInstanceFile });
  }, [geojsonFile, vrpInstanceFile]);

  return (
    <>
      <Head>
        <title>VRP Map Interface</title>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>

      <div className="flex flex-row h-screen">
        {/* Sidebar */}
        <aside className="w-80 p-4 overflow-y-auto bg-white border-r border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">GeoJSON Input</h2>
          <input type="file" accept=".geojson" onChange={handleFileChange} className="mb-4 w-full text-sm text-gray-700" />
          <button onClick={handleExportGeoJSON} className="w-full mb-6 bg-blue-600 text-white py-1 px-3 rounded hover:bg-blue-700">Export Features</button>

          <h2 className="text-lg font-semibold text-gray-800 mb-2">Location Search</h2>
          <input
            type="text"
            placeholder="Enter place name"
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            className="mb-2 w-full px-2 py-1 border rounded"
          />
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags:</label>
            <div className="flex flex-wrap gap-2">
              {['building', 'highway', 'landuse', 'natural'].map(tag => (
                <label key={tag} className="text-sm text-gray-600">
                  <input
                    type="checkbox"
                    value={tag}
                    checked={locationTags.includes(tag)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setLocationTags(prevTags => {
                        const tags = new Set(prevTags);
                        if (checked) tags.add(tag);
                        else tags.delete(tag);
                        return Array.from(tags);
                      });
                    }}
                    className="mr-1"
                  />
                  {tag}
                </label>
              ))}
            </div>
          </div>
          <button onClick={handleSubmitLocationQuery} className="w-full mb-6 bg-blue-600 text-white py-1 px-3 rounded hover:bg-blue-700">Search</button>

          <h2 className="text-lg font-semibold text-gray-800 mb-2">VRP Config</h2>
          <div className="mb-2">
            <label className="block text-sm font-medium">Fleet Size</label>
            <input type="number" value={vrpConfig.fleetSize} onChange={(e) => setVrpConfig({ ...vrpConfig, fleetSize: e.target.value })} className="w-full px-2 py-1 border rounded" />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium">Vehicle Type</label>
            <select value={vrpConfig.vehicleType} onChange={(e) => setVrpConfig({ ...vrpConfig, vehicleType: e.target.value })} className="w-full px-2 py-1 border rounded">
              <option value="van">Van</option>
              <option value="bike">Bike</option>
              <option value="truck">Truck</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium">Constraints</label>
            <textarea value={vrpConfig.constraints} onChange={(e) => setVrpConfig({ ...vrpConfig, constraints: e.target.value })} className="w-full px-2 py-1 border rounded" />
          </div>

          <h2 className="text-lg font-semibold text-gray-800 mb-2">Solver</h2>
          <select value={selectedSolver} onChange={(e) => setSelectedSolver(e.target.value)} className="w-full mb-2 px-2 py-1 border rounded">
            <option value="ortools">Google OR-Tools</option>
            <option value="jsprit">jsprit-python</option>
            <option value="vrpy">vrpy</option>
          </select>
          <button onClick={handleRunSolver} className="w-full mb-6 bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700">Run Solver</button>

          <h2 className="text-lg font-semibold text-gray-800 mb-2">VRP Output</h2>
          <pre className="bg-gray-100 p-2 text-xs h-32 overflow-y-scroll">{vrpOutput ? JSON.stringify(vrpOutput, null, 2) : "No output yet"}</pre>

          <h2 className="text-lg font-semibold text-gray-800 mt-4 mb-2">Import VRP Instance</h2>
          <input type="file" accept=".json,.csv" onChange={handleVrpInstanceChange} className="mb-4 w-full text-sm text-gray-700" />

          <h2 className="text-lg font-semibold text-gray-800 mb-2">Create VRP Instance</h2>
          <textarea placeholder="Define your VRP instance here..." className="w-full h-32 px-2 py-1 border rounded text-sm" />
        </aside>

        {/* Map */}
        <main className="flex-1 h-full">
          {mapProps && <DynamicMapComponent {...mapProps} />}
        </main>
      </div>
    </>
  );
}
