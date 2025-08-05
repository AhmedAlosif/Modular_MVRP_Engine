export default function detectFeatureTypes(
  features,
  { autodetect = true, tagUntagged = true } = {}
) {
  const fileTypes = new Set();
  const detectedFeatures = {
    waypoints: [],
    vehicles: [],
    map: [],
  };

  const enrichedFeatures = features.map((feature) => {
    if (!feature.properties) feature.properties = {};
    const source = feature.properties.source?.toLowerCase();

    if (['waypoint', 'vehicle', 'map'].includes(source)) {
      fileTypes.add(source);
      detectedFeatures[source + 's'].push(feature); // plural key
    } else if (autodetect) {
      if (
        feature.geometry?.type === 'Point' &&
        feature.properties?.demand !== undefined
      ) {
        feature.properties.source = 'waypoint';
        fileTypes.add('waypoint');
        detectedFeatures.waypoints.push(feature);
      } else {
        feature.properties.source = 'map';
        fileTypes.add('map');
        detectedFeatures.map.push(feature);
      }
    } else if (tagUntagged) {
      feature.properties.source = 'map';
      fileTypes.add('map');
      detectedFeatures.map.push(feature);
    } else {
      fileTypes.add('unknown');
    }

    return feature;
  });

  return {
    enrichedFeatures,
    fileTypes: [...fileTypes],
    detectedFeatures,
  };
}
