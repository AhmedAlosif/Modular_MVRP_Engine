'use client';

import { useState } from 'react';
import Section from '@/components/sidebar/Section';
import useMapStore from '@/hooks/useMapStore';
import useVrpStore from '@/hooks/useVRPStore';
import FileUpload from '@/components/data/FileUpload';
import useWaypointStore from '@/hooks/useWaypointStore';
import useFleetStore from '@/hooks/useFleetStore';
import { waypointsToFeatures, vehiclesToFeatures, collectAllFeatures, downloadAsGeoJSON } from '@/utils/geojsonExport';

export default function DataManagerPanel() {
    const { GeojsonFiles, removeGeojsonFile, setGeojsonFiles, zoomToFile, toggleFileVisibility, addGeojsonFile } = useVrpStore();
    const setViewState = useMapStore((s) => s.setViewState);
    const [exportType, setExportType] = useState('waypoints');
    const removeWaypointsByFileId = useWaypointStore((s) => s.removeWaypointsByFileId);
    const [importOptions, setImportOptions] = useState({
        autodetect: true,
        skipDuplicates: true,
        tagUntagged: true,
    });

    const waypoints = useWaypointStore(s => s.waypoints);
    const vehicles = useFleetStore?.(s => s.vehicles) ?? []; // optional if you have it

    const handleExport = () => {
        const files = useVrpStore.getState().GeojsonFiles;

        const wpFeatures = waypointsToFeatures(waypoints);
        const vehFeatures = vehiclesToFeatures(vehicles /*, optional depot [lng,lat] */);

        const all = collectAllFeatures({
            importedFiles: files,
            waypointFeatures: wpFeatures,
            vehicleFeatures: vehFeatures,
        });

        // Filter by exportType
        let featuresToExport = all;
        if (exportType === 'waypoints') {
            featuresToExport = all.filter(f => f?.properties?._featureType === 'waypoint');
        } else if (exportType === 'vehicles') {
            featuresToExport = all.filter(f => f?.properties?._featureType === 'vehicle');
        } else if (exportType === 'layers') {
            // "map layers" = anything not waypoint/vehicle
            featuresToExport = all.filter(f => f?.properties?._featureType !== 'waypoint'
                && f?.properties?._featureType !== 'vehicle');
        }

        downloadAsGeoJSON(`${exportType}-export.geojson`, featuresToExport);
    };

    const handleRemove = (fileId) => {
        removeGeojsonFile(fileId);
        removeWaypointsByFileId(fileId);
    };

    return (
        <Section title="📁 Data Manager">
            <Section title="⬆️ Import Options">
                <div className="text-xs space-y-1">
                    <label>
                        <input type="checkbox" checked={importOptions.autodetect}
                            onChange={(e) => setImportOptions(o => ({ ...o, autodetect: e.target.checked }))} /> Autodetect type
                    </label><br />
                    <label>
                        <input type="checkbox" checked={importOptions.skipDuplicates}
                            onChange={(e) => setImportOptions(o => ({ ...o, skipDuplicates: e.target.checked }))} /> Skip duplicates
                    </label><br />
                    <label>
                        <input type="checkbox" checked={importOptions.tagUntagged}
                            onChange={(e) => setImportOptions(o => ({ ...o, tagUntagged: e.target.checked }))} /> Tag untagged features as map
                    </label>
                </div>
            </Section>
            <Section title="📂 Imported Files">
                <FileUpload
                    importOptions={importOptions}
                />

                {GeojsonFiles.length === 0 ? (
                    <div> </div>
                ) : (
                    GeojsonFiles.map(file => (
                        <div key={file.id} className="p-2 border rounded mb-1">
                            {/* ✅ File Name */}
                            <div className="font-medium text-sm">{file.name}</div>

                            {/* ✅ File Type Tags */}
                            <div className="flex gap-2 text-xs text-gray-600 mt-1">
                                {(file.fileTypes ?? ['unknown']).map((type, i) => (
                                    <span
                                        key={i}
                                        className={`px-2 py-0.5 rounded 
  ${type === 'waypoint' ? 'bg-emerald-100 text-emerald-800' :
                                                type === 'vehicle' ? 'bg-blue-100 text-blue-800' :
                                                    type === 'map' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-gray-100 text-gray-800'}`}>
                                        {type}
                                    </span>
                                ))}
                            </div>

                            {/* ✅ Action Buttons */}
                            <div className="flex space-x-2 mt-2 text-sm">
                                <button onClick={() => toggleFileVisibility(file.id)}>
                                    👁 {file.visible ? 'Hide' : 'Show'}
                                </button>
                                <button onClick={() => handleRemove(file.id)}>🗑 Remove</button>
                                <button onClick={() => zoomToFile(file.name, setViewState)}>🎯 Zoom</button>
                            </div>
                        </div>
                    ))
                )}
            </Section>
            <Section title="⬇️ Export">
                <select
                    value={exportType}
                    onChange={(e) => setExportType(e.target.value)}
                    className="w-full p-1 text-sm border rounded mb-2"
                >
                    <option value="waypoints">Waypoints</option>
                    <option value="layers">Map Layers</option>
                    <option value="vehicles">Vehicles</option>
                    <option value="all">Full Dataset</option>
                </select>

                <button
                    onClick={handleExport}
                    className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                    💾 Export Selected
                </button>
            </Section>

            <Section title="🔄 Sync (Future)">
                <div className="text-xs text-gray-400">
                    Integration with backend coming soon (load/save)
                </div>
            </Section>
        </Section>
    );
}