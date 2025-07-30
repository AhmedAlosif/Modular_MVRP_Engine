'use client';
import { useCallback, useState } from 'react';
import useMapStore from '@/hooks/useMapStore';
import { parseInBatches } from '@loaders.gl/core';
import fitToFeatures from '@/components/fitToFeatures';
import { GeoJSONLoader } from '@loaders.gl/gis';

export default function FileUpload() {
  const [errors, setErrors] = useState([]);
  const addGeojsonFile = useMapStore((s) => s.addGeojsonFile);
  const setViewState = useMapStore((s) => s.setViewState);

  const handleFiles = useCallback(async (event) => {
    setErrors([]);
    const files = Array.from(event.target.files);
    const GeojsonFiles = useMapStore.getState().GeojsonFiles;
    const existingNames = new Set(GeojsonFiles.map(f => f.name));

    for (const file of files) {
      if (existingNames.has(file.name)) {
        setErrors((prev) => [...prev, `Skipped duplicate: ${file.name}`]);
        continue;
      }

      const ext = file.name.split('.').pop().toLowerCase();
      const mime = file.type;

      const isGeo = (ext === 'geojson' || ext === 'json' || mime.includes('geo+json'));
      if (!isGeo) {
        setErrors((prev) => [...prev, `Unsupported format: ${file.name}`]);
        continue;
      }

      try {
        const allFeatures = [];

        const batches = await parseInBatches(file, GeoJSONLoader);
        for await (const batch of batches) {
          if (batch?.data) {
            const features = batch.data.features || batch.data || [];
            allFeatures.push(...features);
          }
        }

        if (allFeatures.length) {
          addGeojsonFile({
            id: Date.now(),
            name: file.name,
            visible: true,
            data: {
              type: "FeatureCollection",
              features: allFeatures
            }
          });

          fitToFeatures(allFeatures, { setViewState });
        }
      } catch (err) {
        setErrors((prev) => [...prev, `Failed to load ${file.name}: ${err.message}`]);
      }
    }
  }, [addGeojsonFile, setViewState]);

  return (
    <div className="p-2">
      <input
        type="file"
        accept=".geojson,.json,.kml,.gpx"
        multiple
        onChange={handleFiles}
        className="text-sm"
      />
      {errors.length > 0 && (
        <div className="text-red-600 mt-2 text-xs">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
    </div>
  );
}
