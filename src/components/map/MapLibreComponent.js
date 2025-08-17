// components/map/MapLibreComponent.js
'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, GeoJsonLayer, PathLayer } from '@deck.gl/layers';
import { EditableGeoJsonLayer, DrawRectangleMode } from '@deck.gl-community/editable-layers';
import Map from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';

import useMapStore from '@/hooks/useMapStore';
import useVrpStore from '@/hooks/useVRPStore';
import useWaypointStore from '@/hooks/useWaypointStore';
import useUiStore from '@/hooks/useUIStore';
import useRouteStore from '@/hooks/useRouteStore';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

function rectFC({ minLon, minLat, maxLon, maxLat }, props = {}) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: props,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
            [minLon, minLat]
          ]]
        }
      }
    ]
  };
}

export default function MapLibreComponent() {
  const { viewState, setViewState } = useMapStore();
  const { GeojsonFiles } = useVrpStore();

  const {
    waypoints, waypointsVisible, hoveredWaypoint,
    setHoveredWaypoint, addWaypoint, clearHoveredWaypoint
  } = useWaypointStore();

  const {
    hoveredFeature, setHoveredFeature, clearHoveredFeature,
    addOnClickEnabled, drawBBoxEnabled, lastBbox, setLastBbox
  } = useUiStore();

  const routes = useRouteStore(s => s.routes);

  // --- Map ref & drawing state ---
  const mapRef = useRef(null);

  // press&drag rectangle
  const [isDragDrawing, setIsDragDrawing] = useState(false);
  const [mouseDownXY, setMouseDownXY] = useState(null); // [x,y]
  const [currXY, setCurrXY] = useState(null);
  const DRAG_MIN = 3; // pixels

  // editable layer (two-click) backing data
  const [editData, setEditData] = useState({ type: 'FeatureCollection', features: [] });

  // Build the live rectangle FC while dragging (in screen px → lng/lat)
  const dragRectFC = useMemo(() => {
    if (!drawBBoxEnabled || !isDragDrawing || !mouseDownXY || !currXY) return null;
    const map = mapRef.current?.getMap?.();
    if (!map) return null;

    const [x1, y1] = mouseDownXY;
    const [x2, y2] = currXY;
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

    const sw = map.unproject([minX, maxY]); // lon/lat
    const ne = map.unproject([maxX, minY]);

    const west = Math.min(sw.lng, ne.lng);
    const east = Math.max(sw.lng, ne.lng);
    const south = Math.min(sw.lat, ne.lat);
    const north = Math.max(sw.lat, ne.lat);

    return rectFC({ minLon: west, minLat: south, maxLon: east, maxLat: north }, { _temp: true });
  }, [drawBBoxEnabled, isDragDrawing, mouseDownXY, currXY]);

  // Persisted last bbox (blue outline)
  const lastBboxFC = useMemo(() => (lastBbox ? rectFC(lastBbox, { _last: true }) : null), [lastBbox]);

  // ---------- Mouse handlers (drag) ----------
  const onMapMouseDown = useCallback((e) => {
    if (!drawBBoxEnabled) return;
    const map = mapRef.current?.getMap?.();
    map?.dragPan?.disable();            // stop map from moving
    setMouseDownXY([e.point.x, e.point.y]);
    setCurrXY([e.point.x, e.point.y]);
    setIsDragDrawing(true);
  }, [drawBBoxEnabled]);

  const onMapMouseMove = useCallback((e) => {
    if (!drawBBoxEnabled || !mouseDownXY) return;
    setCurrXY([e.point.x, e.point.y]);
  }, [drawBBoxEnabled, mouseDownXY]);

  const onMapMouseUp = useCallback((e) => {
    const map = mapRef.current?.getMap?.();

    if (drawBBoxEnabled && isDragDrawing && mouseDownXY && currXY && map) {
      const [x1, y1] = mouseDownXY;
      const [x2, y2] = currXY;
      const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);

      if (dx > DRAG_MIN && dy > DRAG_MIN) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

        const sw = map.unproject([minX, maxY]); // lon/lat
        const ne = map.unproject([maxX, minY]);

        const south = Math.min(sw.lat, ne.lat);
        const north = Math.max(sw.lat, ne.lat);
        const west = Math.min(sw.lng, ne.lng);
        const east = Math.max(sw.lng, ne.lng);

        setLastBbox({ minLon: west, minLat: south, maxLon: east, maxLat: north });
        console.debug('[bbox] drag setLastBbox', { south, west, north, east });
      }
    }
    // reset + re-enable pan
    setIsDragDrawing(false);
    setMouseDownXY(null);
    setCurrXY(null);
    map?.dragPan?.enable();
  }, [drawBBoxEnabled, isDragDrawing, mouseDownXY, currXY, setLastBbox]);

  // ---------- Two-click mode (editable layer) ----------
  const handleEditBBox = useCallback((info) => {
    if (!drawBBoxEnabled) return;
    // Only react when a rectangle is actually completed/added
    const okTypes = new Set(['addFeature', 'completeEdit', 'finishMovePosition']);
    if (!okTypes.has(info?.editType)) return;

    const f = info?.updatedData?.features?.slice(-1)?.[0];
    const ring = f?.geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 4) return;

    const lons = ring.map(([lon]) => lon);
    const lats = ring.map(([, lat]) => lat);

    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    setLastBbox({ minLon: west, minLat: south, maxLon: east, maxLat: north });
    setEditData({ type: 'FeatureCollection', features: [] }); // clear
    console.debug('[bbox] two-click setLastBbox', { south, west, north, east });
  }, [drawBBoxEnabled, setLastBbox]);

  // ---------- Layers ----------
  const routeLayers = useMemo(() => {
    if (!Array.isArray(routes) || routes.length === 0) return [];
    const palette = [[230, 57, 70], [42, 157, 143], [38, 70, 83], [233, 196, 106], [29, 53, 87]];
    return routes.map((r, idx) => new PathLayer({
      id: `route-path-${idx}`,
      data: [r.coords],
      getPath: d => d,
      getColor: palette[idx % palette.length],
      widthUnits: 'pixels',
      getWidth: 4,
      pickable: true,
      parameters: { depthTest: false },
      updateTriggers: { getPath: r.coords }
    }));
  }, [routes]);

  const waypointLayer = useMemo(() => {
    if (!waypointsVisible || waypoints.length === 0) return null;
    const color = (type) => {
      switch (type) {
        case 'Depot': return [0, 0, 255];
        case 'Delivery': return [0, 128, 0];
        case 'Pickup': return [255, 165, 0];
        case 'Backhaul': return [255, 0, 0];
        default: return [128, 128, 128];
      }
    };
    return new ScatterplotLayer({
      id: 'waypoints',
      data: waypoints,
      getPosition: d => d.coordinates,
      getFillColor: d => color(d.type),
      radiusUnits: 'pixels',
      getRadius: 10,
      pickable: true,
      radiusMinPixels: 8,
      radiusMaxPixels: 24,
      updateTriggers: { getPosition: waypoints },
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
            screenY: info.y
          });
        } else {
          clearHoveredWaypoint();
        }
      }
    });
  }, [waypoints, waypointsVisible, setHoveredWaypoint, clearHoveredWaypoint]);

  const geoLayers = useMemo(() => {
    return GeojsonFiles
      .filter(f => f.visible && f?.data?.type === 'FeatureCollection' && Array.isArray(f?.data?.features))
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
              screenY: info.y
            });
          }
        }
      }));
  }, [GeojsonFiles, setHoveredFeature]);

  const dragLayer = useMemo(() => {
    if (!dragRectFC) return null;
    return new GeoJsonLayer({
      id: 'bbox-drag-live',
      data: dragRectFC,
      stroked: true,
      filled: true,
      getLineColor: [255, 0, 0],
      getFillColor: [255, 0, 0, 60],
      lineWidthMinPixels: 2,
      pickable: false
    });
  }, [dragRectFC]);

  const lastBboxLayer = useMemo(() => {
    if (!lastBbox) return null;
    return new GeoJsonLayer({
      id: 'bbox-last',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [lastBbox.west, lastBbox.south],
              [lastBbox.east, lastBbox.south],
              [lastBbox.east, lastBbox.north],
              [lastBbox.west, lastBbox.north],
              [lastBbox.west, lastBbox.south]
            ]]
          }
        }]
      },
      stroked: true,
      filled: false,
      getLineColor: [0, 128, 255],
      lineWidthMinPixels: 2
    });
  }, [lastBbox]);

  const editableLayer = useMemo(() => {
    if (!drawBBoxEnabled) return null;
    return new EditableGeoJsonLayer({
      id: 'bbox-editable',
      data: { type: 'FeatureCollection', features: [] },
      mode: DrawRectangleMode,
      selectedFeatureIndexes: [],
      onEdit: ({ updatedData, editType }) => {
        const f = updatedData?.features?.slice(-1)[0];
        const ring = f?.geometry?.coordinates?.[0];
        if (!Array.isArray(ring) || ring.length < 4) return;
        const lons = ring.map(p => p[0]);
        const lats = ring.map(p => p[1]);
        const west = Math.min(...lons);
        const east = Math.max(...lons);
        const south = Math.min(...lats);
        const north = Math.max(...lats);
        setLastBbox({ west, south, east, north });
      },
      getLineColor: [0, 180, 80],
      getFillColor: [0, 180, 80, 60],
      lineWidthMinPixels: 2
    });
  }, [drawBBoxEnabled, setLastBbox]);

  const layers = useMemo(() => {
    const L = [];
    if (waypointLayer) L.push(waypointLayer);
    L.push(...geoLayers);
    if (editableLayer) L.push(editableLayer);
    if (dragLayer) L.push(dragLayer);
    if (lastBboxLayer) L.push(lastBboxLayer);
    L.push(...routeLayers);
    return L;
  }, [waypointLayer, geoLayers, editableLayer, dragLayer, lastBboxLayer, routeLayers]);

  // Add waypoint click (disabled while drawing bbox)
  const handleMapClick = useCallback((info) => {
    if (!info?.object) {
      clearHoveredFeature();
      clearHoveredWaypoint();
    }
    if (!addOnClickEnabled || !info.coordinate) return;
    if (drawBBoxEnabled && (isDragDrawing || mouseDownXY)) return;

    const [lng, lat] = info.coordinate;
    addWaypoint({
      coordinates: [lng, lat],
      id: Date.now(),
      demand: 1,
      capacity: 5,
      serviceTime: 10,
      timeWindow: [8, 17]
    });
  }, [addWaypoint, addOnClickEnabled, drawBBoxEnabled, isDragDrawing, mouseDownXY, clearHoveredFeature, clearHoveredWaypoint]);

  return (
    <>
      <DeckGL
        viewState={viewState}
        controller={{
          // Disable DeckGL panning while draw mode is ON
          dragPan: !drawBBoxEnabled,
          scrollZoom: true,
          doubleClickZoom: true
        }}
        onViewStateChange={({ viewState: next }) => {
          setViewState(next);
          clearHoveredFeature();
          clearHoveredWaypoint();
        }}
        onClick={handleMapClick}
        layers={layers}
        style={{
          position: 'absolute',
          top: 0, bottom: 0, width: '100%',
          cursor: drawBBoxEnabled ? (isDragDrawing ? 'crosshair' : 'crosshair') : 'grab'
        }}
      >
        <Map
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          {...viewState}
          // Mouse handlers for press&drag rectangle
          onMouseDown={drawBBoxEnabled ? onMapMouseDown : undefined}
          onMouseMove={drawBBoxEnabled ? onMapMouseMove : undefined}
          onMouseUp={drawBBoxEnabled ? onMapMouseUp : undefined}
        />
      </DeckGL>

      {/* Feature popup */}
      {hoveredFeature?.position && (
        <div
          className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{
            left: `${hoveredFeature.screenX ?? 0}px`,
            top: `${hoveredFeature.screenY ?? 0}px`,
            transform: 'translate(10px, -100%)',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <pre className="whitespace-pre-wrap">{JSON.stringify(hoveredFeature.properties, null, 2)}</pre>
        </div>
      )}

      {/* Waypoint popup */}
      {hoveredWaypoint?.coordinates && (
        <div
          className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{
            left: `${hoveredWaypoint.screenX ?? 0}px`,
            top: `${hoveredWaypoint.screenY ?? 0}px`,
            transform: 'translate(10px, -100%)',
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <div className="text-xs">
            <strong>Type:</strong> {hoveredWaypoint.type}<br />
            <strong>Demand:</strong> {hoveredWaypoint.demand}<br />
            <strong>Capacity:</strong> {hoveredWaypoint.capacity ?? '—'}<br />
            <strong>Service Time:</strong> {hoveredWaypoint.serviceTime ?? '—'}<br />
            <strong>Time Window:</strong> {Array.isArray(hoveredWaypoint.timeWindow) ? hoveredWaypoint.timeWindow.join(', ') : (hoveredWaypoint.timeWindow ?? '—')}<br />
            <strong>Pair ID:</strong> {hoveredWaypoint.pairId ?? '—'}<br />
            <strong>Coordinates:</strong> {hoveredWaypoint.coordinates.join(', ')}
          </div>
        </div>
      )}
    </>
  );
}
