'use client';
import { useCallback, useState, useRef } from 'react';
import useMapStore from '@/hooks/useMapStore';
import { parseInBatches, selectLoader } from '@loaders.gl/core';
import { GeoJSONLoader, KMLLoader, GPXLoader } from '@loaders.gl/gis';
import fitToFeatures from '@/components/fitToFeatures';

const SUPPORTED_LOADERS = [GeoJSONLoader, KMLLoader, GPXLoader];

export default function FileUpload() {
  const [errors, setErrors] = useState([]);
  const setGeojsonData = useMapStore((s) => s.setGeojsonData);
  const setViewState = useMapStore((s) => s.setViewState);

  const handleFiles = useCallback(async (event) => {
    setErrors([]);
    const files = Array.from(event.target.files);
    const geojsonData = useMapStore.getState().geojsonData;
    const existingFiles = geojsonData?.__fileNames || [];
    const seenNames = new Set(existingFiles);
    let allFeatures = [];

    for (const file of files) {
      if (seenNames.has(file.name)) {
        setErrors((prev) => [...prev, `Skipped duplicate: ${file.name}`]);
        continue;
      }

      const ext = file.name.split('.').pop().toLowerCase();
      const mime = file.type;

      // Only allow known formats
      const isGeo = (ext === 'geojson' || ext === 'json' || mime.includes('geo+json'));

      if (!isGeo) {
        setErrors((prev) => [...prev, `Unsupported format: ${file.name}`]);
        continue;
      }

      let loader;
      try {
        const batches = await parseInBatches(file, loader);
        for await (const batch of batches) {
          if (batch?.data) {
            const features = batch.data.features || batch.data || [];
            allFeatures.push(...features);
          }
        }

        seenNames.add(file.name);
      } catch (err) {
        setErrors((prev) => [...prev, `Failed to load ${file.name}: ${err.message}`]);
      }
    }

    if (allFeatures.length) {
      const merged = {
        type: 'FeatureCollection',
        features: allFeatures,
        __fileNames: Array.from(seenNames),
      };

      setGeojsonData(merged);
      fitToFeatures(allFeatures, { setViewState });
    }
  }, [setGeojsonData, setViewState]);

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
