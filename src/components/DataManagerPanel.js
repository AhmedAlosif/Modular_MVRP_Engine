'use client';

import { useState } from 'react';
import Section from '@/components/Section';
import useMapStore from '@/hooks/useMapStore';
import useVrpStore from '@/hooks/useVRPStore';
import FileUpload from '@/components/FileUpload';

export default function DataManagerPanel() {
    const { GeojsonFiles, removeGeojsonFile, setGeojsonFiles, zoomToFile, toggleFileVisibility, addGeojsonFile } = useVrpStore();
    const setViewState = useMapStore((s) => s.setViewState);
    const [exportType, setExportType] = useState('waypoints');
    const [importOptions, setImportOptions] = useState({
        autodetect: true,
        skipDuplicates: false,
        tagUntagged: true,
    });

    const handleExport = () => {
        const files = useVrpStore.getState().GeojsonFiles;
        let filtered = [];

        switch (exportType) {
            case 'waypoints':
                filtered = files.filter(f => f.data?.features?.some(ft => ft.properties?.source === 'waypoint'));
                break;
            case 'layers':
                filtered = files.filter(f => f.data?.features?.some(ft => ft.properties?.source === 'map'));
                break;
            case 'vehicles':
                filtered = files.filter(f => f.data?.features?.some(ft => ft.properties?.source === 'vehicle'));
                break;
            case 'all':
            default:
                filtered = files;
        }

        const blob = new Blob([
            JSON.stringify({
                type: 'FeatureCollection',
                features: filtered.flatMap(f => f.data.features || [])
            }, null, 2)
        ], { type: 'application/json' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportType}-export.geojson`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleRemove = (id) => {
        removeGeojsonFile(id);
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
                                <button onClick={() => removeGeojsonFile(file.id)}>🗑 Remove</button>
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