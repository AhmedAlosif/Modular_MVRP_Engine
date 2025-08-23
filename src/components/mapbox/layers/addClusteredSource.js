// Add / update / remove a clustered source + 3 layers (clusters, count, unclustered)
export function addClusteredSource(map, { id, data, clusterRadius = 40 }) {
  if (map.getSource(id)) map.removeSource(id);
  ['clusters','cluster-count','unclustered'].forEach(l => {
    if (map.getLayer(`${id}-${l}`)) map.removeLayer(`${id}-${l}`);
  });

  map.addSource(id, {
    type: 'geojson',
    data,
    cluster: true,
    clusterRadius,
    clusterProperties: {}, // add rollups if you want
  });

  map.addLayer({
    id: `${id}-clusters`,
    type: 'circle',
    source: id,
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['step', ['get', 'point_count'], 16, 50, 22, 200, 30],
      'circle-color': ['step', ['get', 'point_count'], '#9ecae1', 50, '#6baed6', 200, '#2171b5'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1
    }
  });

  map.addLayer({
    id: `${id}-cluster-count`,
    type: 'symbol',
    source: id,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#073b4c' }
  });

  map.addLayer({
    id: `${id}-unclustered`,
    type: 'circle',
    source: id,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 6,
      'circle-color': '#34d399',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1
    }
  });

  return {
    update(nextData) { map.getSource(id)?.setData(nextData); },
    remove() {
      ['clusters','cluster-count','unclustered'].forEach(l => {
        const lid = `${id}-${l}`; if (map.getLayer(lid)) map.removeLayer(lid);
      });
      if (map.getSource(id)) map.removeSource(id);
    }
  };
}
