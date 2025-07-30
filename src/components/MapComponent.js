'use client';
import { useCallback, useMemo } from "react";
import { DeckGL } from "@deck.gl/react";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import { Map } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import useMapStore from "@/hooks/useMapStore";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export default function MapComponent() {
  const {
    waypoints,
    GeojsonFiles,
    addWaypoint,
    viewState,
    waypointsVisible,
    addOnClickEnabled,
    hoveredFeature,
    setViewState,
    setHoveredFeature,
    clearHoveredFeature,
  } = useMapStore();

  const handleMapClick = useCallback((info, event) => {
    if (!info?.object) clearHoveredFeature();
    if (!addOnClickEnabled || !info.coordinate) return;

    const [lng, lat] = info.coordinate;
    addWaypoint({
      coordinates: [lng, lat],
      id: Date.now(),
      demand: 1,
    });
  }, [addWaypoint, addOnClickEnabled, clearHoveredFeature]);

  const waypointLayer = useMemo(() => {
    if (!waypointsVisible || waypoints.length === 0) return null;

    return new ScatterplotLayer({
      id: "waypoints",
      data: waypoints,
      getPosition: (d) => d.coordinates,
      getFillColor: [255, 0, 0],
      getRadius: 10,
      pickable: true,
      radiusMinPixels: 5,
      radiusMaxPixels: 15,
      updateTriggers: {
        getPosition: waypoints,
      },
    });
  }, [waypoints, waypointsVisible]);

  const layers = useMemo(() => {
    return GeojsonFiles
      .filter(file => file.visible && file?.data?.type === "FeatureCollection" && Array.isArray(file?.data?.features))
      .map(file => new GeoJsonLayer({
        id: `geojson-${file.id}`,
        data: file.data,
        pickable: true,
        filled: true,
        stroked: true,
        getLineColor: [0, 0, 255],
        getFillColor: [0, 255, 0, 50],
        getLineWidth: 2,
        onClick: (info) => {
          if (info?.object) {
            setHoveredFeature({
              fileId: file.id,
              properties: info.object.properties,
              position: info.coordinate,
              screenX: info.x,
              screenY: info.y,
            });
          }
        }
      }));
  }, [GeojsonFiles]);

  return (
    <>
      <DeckGL
        viewState={viewState}
        controller={true}
        onViewStateChange={({ viewState: next }) => {
          setViewState(next);        // Update state
          clearHoveredFeature();     // Dismiss popup
        }}
        onClick={handleMapClick}
        layers={[waypointLayer, layers].filter(Boolean)}
        style={{ position: "absolute", top: 0, bottom: 0, width: "100%" }}
      >
        <Map mapLib={maplibregl} mapStyle={MAP_STYLE} {...viewState} />
      </DeckGL>

      {hoveredFeature && hoveredFeature.position && (
        <div
          className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{
            left: `${hoveredFeature.screenX ?? 0}px`,
            top: `${hoveredFeature.screenY ?? 0}px`,
            transform: "translate(10px, -100%)",
            pointerEvents: "none",
            zIndex: 9999
          }}
        >
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(hoveredFeature.properties, null, 2)}
          </pre>
        </div>
      )}
    </>
  );
}