'use client';

import useWaypointStore from '@/hooks/useWaypointStore';

export default function ExportGeoJSON() {
  const waypoints = useWaypointStore((s) => s.waypoints);

  const exportGeoJSON = () => {
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      alert('No waypoints to export.');
      return;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: waypoints.map((wp) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: wp.coordinates,
        },
        properties: {
          id: wp.id,
          type: wp.type,
          demand: wp.demand,
          capacity: wp.capacity,
          serviceTime: wp.serviceTime,
          timeWindow: wp.timeWindow,
          pairId: wp.pairId,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'waypoints.geojson';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={exportGeoJSON}
      className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 w-full mt-2"
    >
      ⬇️ Export Waypoints (GeoJSON)
    </button>
  );
}
