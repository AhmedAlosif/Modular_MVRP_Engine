'use client';
import { useCallback, useState } from 'react';
import useMapStore from '@/hooks/useMapStore';
import { parseInBatches } from '@loaders.gl/core';
import fitToFeatures from '@/components/fitToFeatures';
import { GeoJSONLoader } from '@loaders.gl/gis';
import useVrpStore from '@/hooks/useVRPStore';
import useWaypointStore from '@/hooks/useWaypointStore';

export default function FileUpload() {
  const [errors, setErrors] = useState([]);
  const addGeojsonFile = useVrpStore((s) => s.addGeojsonFile);
  const setViewState = useMapStore((s) => s.setViewState);

  const handleFiles = useCallback(async (event) => {
    setErrors([]);
    const files = Array.from(event.target.files);
    const GeojsonFiles = useVrpStore.getState().GeojsonFiles;
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
          const fileData = {
            id: Date.now(),
            name: file.name,
            visible: true,
            data: {
              type: "FeatureCollection",
              features: allFeatures
            }
          };

          addGeojsonFile(fileData);
          fitToFeatures(allFeatures, { setViewState });

          // Detect enriched waypoint format
          const waypointFeatures = allFeatures.filter(
            f => f?.geometry?.type === 'Point' && f?.properties?.coordinates
          );

          const basicPointFeatures = allFeatures.filter(
            f => f?.geometry?.type === 'Point' && Array.isArray(f?.geometry?.coordinates)
          );

          const addWaypoint = useWaypointStore.getState().addWaypoint;

          const featuresToUse = waypointFeatures.length ? waypointFeatures : basicPointFeatures;

          featuresToUse.forEach(f => {
            const coords = f.geometry.coordinates;
            const props = f.properties || {};

            addWaypoint({
              id: props.id ?? Date.now(),
              coordinates: coords,
              type: props.type ?? 'customer',
              demand: props.demand ?? 1,
              capacity: props.capacity ?? null,
              serviceTime: props.serviceTime ?? null,
              timeWindow: Array.isArray(props.timeWindow) ? props.timeWindow : null,
              pairId: props.pairId ?? null,
            });
          });
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
