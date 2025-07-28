'use client';
import { useCallback, useState } from "react";
import useMapStore from "@/hooks/useMapStore";
import { parseInBatches } from "@loaders.gl/core";
import { GeoJSONLoader, KMLLoader, GPXLoader } from "@loaders.gl/gis";
import { useRef } from "react";

const SUPPORTED_LOADERS = [GeoJSONLoader, KMLLoader, GPXLoader];

export default function FileUpload() {
  const [errors, setErrors] = useState([]);
  const setGeojsonData = useMapStore((s) => s.setGeojsonData);
  const setViewState = useMapStore((s) => s.setViewState);
  const lastBounds = useRef(null);


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

      try {
        const batches = await parseInBatches(file, SUPPORTED_LOADERS);
        for await (const batch of batches) {
          if (batch?.data) {
            const features = batch.data.features || batch.data || [];
            allFeatures.push(...features);
          }
        }

        seenNames.add(file.name);
      } catch (err) {
        setErrors((prev) => [...prev, `Failed to stream ${file.name}: ${err.message}`]);
      }
    }

    if (allFeatures.length) {
      const merged = {
        type: "FeatureCollection",
        features: allFeatures,
        __fileNames: Array.from(seenNames),
      };

      setGeojsonData(merged);

      // Auto-zoom view to data
      const coords = allFeatures.flatMap(f => {
        const g = f.geometry;
        if (!g) return [];
        if (g.type === "Point") return [g.coordinates];
        if (g.type === "LineString" || g.type === "MultiPoint") return g.coordinates;
        if (g.type === "Polygon" || g.type === "MultiLineString") return g.coordinates.flat();
        if (g.type === "MultiPolygon") return g.coordinates.flat(2);
        return [];
      });

      const longitudes = coords.map(c => c[0]);
      const latitudes = coords.map(c => c[1]);

      if (longitudes.length && latitudes.length) {
        const bounds = {
          minLng: Math.min(...longitudes),
          maxLng: Math.max(...longitudes),
          minLat: Math.min(...latitudes),
          maxLat: Math.max(...latitudes),
        };
        setViewState({
          longitude: (bounds.minLng + bounds.maxLng) / 2,
          latitude: (bounds.minLat + bounds.maxLat) / 2,
          zoom: 10,
          pitch: 0,
          bearing: 0,
        });
        console.log("FileUpload")
      }
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
