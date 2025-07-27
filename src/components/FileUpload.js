'use client';
import { useCallback } from "react";
import useMapStore from "@/hooks/useMapStore";

export default function FileUpload() {
  const setGeojsonData = useMapStore((s) => s.setGeojsonData);

  const handleFile = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        setGeojsonData(json);
      } catch (err) {
        console.error("Invalid GeoJSON:", err);
      }
    };
    reader.readAsText(file);
  }, [setGeojsonData]);

  return (
    <div className="p-2">
      <input
        type="file"
        accept=".geojson,.json"
        onChange={handleFile}
        className="text-sm"
      />
    </div>
  );
}
