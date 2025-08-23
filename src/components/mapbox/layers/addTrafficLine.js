// components/mapbox/layers/addTrafficLine.js
/* eslint-disable no-console */

/**
 * Adds/updates a traffic-colored line using line-gradient + line-progress.
 * Works with MapLibre GL JS when your GeoJSON source has lineMetrics: true.
 */
export function addTrafficLine(map, opts) {
  const {
    id = 'route-traffic',
    sourceId = `${(opts?.id || 'route-traffic')}-src`,
    routeData,
    width = 6,
    opacity = 0.95,
    colors = ['#2DC4B2', '#3BB3C3', '#669EC4'], // start → mid → end
    beforeId, // optional: place before a layer id
  } = opts || {};

  if (!map) {
    console.warn('[addTrafficLine] no map instance');
    return noopCtl();
  }

  const ensureAdded = () => {
    try {
      // Clean stale
      if (map.getLayer(id)) { try { map.removeLayer(id); } catch {} }
      if (map.getSource(sourceId)) { try { map.removeSource(sourceId); } catch {} }

      console.debug('[addTrafficLine] addSource', {
        sourceId,
        points: routeData?.geometry?.coordinates?.length ?? 0,
        lineMetrics: true
      });

      // ⬅️ REQUIRED for line-progress gradients
      map.addSource(sourceId, {
        type: 'geojson',
        data: routeData,
        lineMetrics: true
      });

      // Try gradient first
      let useGradient = true;
      try {
        map.addLayer({
          id,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': width,
            'line-opacity': opacity,
            'line-gradient': [
              'interpolate', ['linear'], ['line-progress'],
              0.0, colors[0],
              0.5, colors[1],
              1.0, colors[2],
            ],
          }
        }, beforeId);
      } catch (e) {
        console.warn('[addTrafficLine] gradient add failed, falling back to solid color', e);
        useGradient = false;
        try {
          map.addLayer({
            id,
            type: 'line',
            source: sourceId,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-width': width,
              'line-opacity': opacity,
              'line-color': colors[2] // solid last color
            }
          }, beforeId);
        } catch (e2) {
          console.error('[addTrafficLine] fallback add failed', e2);
        }
      }

      console.info('[addTrafficLine] layer added OK:', {
        id, sourceId, gradient: useGradient
      });
    } catch (e) {
      console.error('[addTrafficLine] failed to add layer/source', e);
    }
  };

  // Some styles (like Carto Positron) can be async; prefer styledata if needed
  if (map.isStyleLoaded()) {
    ensureAdded();
  } else {
    console.debug('[addTrafficLine] style not loaded; waiting once(load)');
    map.once('load', ensureAdded);
  }

  return {
    update(nextFeature) {
      try {
        const src = map.getSource(sourceId);
        if (!src) {
          console.warn('[addTrafficLine.update] source missing, re-adding');
          addTrafficLine(map, { id, sourceId, routeData: nextFeature, width, opacity, colors, beforeId });
          return;
        }
        src.setData(nextFeature);
        console.debug('[addTrafficLine.update] setData points=', nextFeature?.geometry?.coordinates?.length ?? 0);
      } catch (e) {
        console.error('[addTrafficLine.update] error', e);
      }
    },
    remove() {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch {}
      try { if (map.getSource(sourceId)) map.removeSource(sourceId); } catch {}
      console.debug('[addTrafficLine.remove] removed', { id, sourceId });
    }
  };
}

function noopCtl() { return { update() {}, remove() {} }; }
