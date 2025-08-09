'use client';
import { useCallback, useMemo } from "react";
import { DeckGL } from "@deck.gl/react";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import Map from 'react-map-gl/maplibre';
import maplibregl from "maplibre-gl";
import useMapStore from "@/hooks/useMapStore";
import useVrpStore from "@/hooks/useVRPStore";
import useWaypointStore from "@/hooks/useWaypointStore";
import useUiStore from "@/hooks/useUIStore";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export default function MapComponent() {
  const {
    viewState,
    setViewState,
  } = useMapStore();

  const {
    GeojsonFiles,
  } = useVrpStore();

  const {
    waypoints,
    waypointsVisible,
    hoveredWaypoint,
    setHoveredWaypoint,
    addWaypoint,
    clearHoveredWaypoint,
  } = useWaypointStore();

  const {
    hoveredFeature,
    setHoveredFeature,
    clearHoveredFeature,
    addOnClickEnabled,
  } = useUiStore();

  const handleMapClick = useCallback((info) => {
    if (!info?.object) {
      clearHoveredFeature()
      clearHoveredWaypoint();
    };
    if (!addOnClickEnabled || !info.coordinate) return;

    const [lng, lat] = info.coordinate;
    addWaypoint({
      coordinates: [lng, lat],
      id: Date.now(),
      demand: 1,
      capacity: 5,        // Example values
      serviceTime: 10,    // Example values
      timeWindow: [8, 17] // Example values
    });
  }, [addWaypoint, addOnClickEnabled, clearHoveredFeature, clearHoveredWaypoint]);

  const waypointLayer = useMemo(() => {
    if (!waypointsVisible || waypoints.length === 0) return null;
    const getWaypointColor = (type) => {
      switch (type) {
        case 'Depot':
          return [0, 0, 255];       // Blue
        case 'Delivery':
          return [0, 128, 0];       // Green
        case 'Pickup':
          return [255, 165, 0];     // Orange
        case 'Backhaul':
          return [255, 0, 0];       // Red
        default:
          return [128, 128, 128];   // Gray
      }
    };

    return new ScatterplotLayer({
      id: "waypoints",
      data: waypoints,
      getPosition: (d) => d.coordinates,
      getFillColor: (d) => getWaypointColor(d.type),
      getRadius: 10,
      pickable: true,
      radiusMinPixels: 5,
      radiusMaxPixels: 15,
      updateTriggers: {
        getPosition: waypoints,
      },
      onClick: (info) => {
        if (info.object) {
          setHoveredWaypoint({
            coordinates: info.object.coordinates,
            id: info.object.id,
            type: info.object.type,
            demand: info.object.demand,
            capacity: info.object.capacity,
            serviceTime: info.object.serviceTime,
            timeWindow: info.object.timeWindow,
            pairId: info.object.pairId ?? null,
            position: info.coordinate,
            screenX: info.x,
            screenY: info.y,
          });
          console.log("Hovered waypoint:", info.object);
        } else {
          clearHoveredWaypoint();
        }
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
          clearHoveredWaypoint();    // Dismiss waypoint hover
        }}
        onClick={handleMapClick}
        layers={[waypointLayer, layers].filter(Boolean)}
        style={{ position: "absolute", top: 0, bottom: 0, width: "100%" }}
      >
        <Map
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          {...viewState}
        />
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
      {hoveredWaypoint?.coordinates && (
        <div
          className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{
            left: `${hoveredWaypoint.screenX ?? 0}px`,
            top: `${hoveredWaypoint.screenY ?? 0}px`,
            transform: 'translate(10px, -100%)',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          <div className="text-xs">
            <strong>Type:</strong> {hoveredWaypoint.type}<br />
            <strong>Demand:</strong> {hoveredWaypoint.demand}<br />
            <strong>Capacity:</strong> {hoveredWaypoint.capacity ?? '—'}<br />
            <strong>Service Time:</strong> {hoveredWaypoint.serviceTime ?? '—'}<br />
            <strong>Time Window:</strong> {Array.isArray(hoveredWaypoint.timeWindow)
              ? hoveredWaypoint.timeWindow.join(', ')
              : hoveredWaypoint.timeWindow ?? '—'}<br />
            <strong>Pair ID:</strong> {hoveredWaypoint.pairId ?? '—'}<br />
            <strong>Coordinates:</strong> {hoveredWaypoint.coordinates.join(', ')}
          </div>
        </div>
      )}
    </>
  );
}