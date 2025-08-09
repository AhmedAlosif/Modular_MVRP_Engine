import { WebMercatorViewport } from '@math.gl/web-mercator';

export default function fitToFeatures(features, { setViewState, padding = 60 } = {}) {
    if (!setViewState) {
    throw new Error("fitToFeatures: setViewState is required");
  }
  const width = window.innerWidth;
  const height = window.innerHeight;

  let bounds;

  if (!features || features.length === 0) return;

  // Handle single [lng, lat] point
  if (
    Array.isArray(features) &&
    typeof features[0] === 'number' &&
    typeof features[1] === 'number'
  ) {
    const [lng, lat] = features;
    const delta = 0.005; // ~500m
    bounds = [
      [lng - delta, lat - delta],
      [lng + delta, lat + delta],
    ];
  } else {
    // Extract all feature coordinates
    const coords = features.flatMap((f) => {
      const g = f.geometry;
      if (!g) return [];
      if (g.type === 'Point') return [g.coordinates];
      if (g.type === 'LineString' || g.type === 'MultiPoint') return g.coordinates;
      if (g.type === 'Polygon' || g.type === 'MultiLineString') return g.coordinates.flat();
      if (g.type === 'MultiPolygon') return g.coordinates.flat(2);
      return [];
    });

    const longitudes = coords.map((c) => c[0]);
    const latitudes = coords.map((c) => c[1]);

    if (!longitudes.length || !latitudes.length) return;

    bounds = [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ];
  }

  // Calculate the view state that fits the bounds
  const viewport = new WebMercatorViewport({ width, height });
  const { longitude, latitude, zoom } = viewport.fitBounds(bounds, { padding });

  setViewState({
    longitude,
    latitude,
    zoom,
    pitch: 0,
    bearing: 0,
  });
}
