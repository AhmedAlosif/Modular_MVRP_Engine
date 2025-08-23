// components/map/MapboxComponent.js
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL from 'react-map-gl/mapbox';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import { ScatterplotLayer, GeoJsonLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import { EditableGeoJsonLayer, DrawRectangleMode } from '@deck.gl-community/editable-layers';
import { MapboxOverlay } from '@deck.gl/mapbox';

import useMapStore from '@/hooks/useMapStore';
import useVrpStore from '@/hooks/useVRPStore';
import useWaypointStore from '@/hooks/useWaypointStore';
import useUiStore from '@/hooks/useUIStore';
import useRouteStore from '@/hooks/useRouteStore';

import { addClusteredSource } from '@/components/mapbox/layers/addClusteredSource';
import { addTrafficLine } from '@/components/mapbox/layers/addTrafficLine';
import { createTripsLayer } from '@/components/mapbox/layers/createTripsLayer';
import { createLassoLayer } from '@/components/mapbox/layers/createLassoLayer';
import { createEtaController } from '@/components/mapbox/layers/etaLayer';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

// ───────────────── helpers ─────────────────
const rectFC = ({ west, south, east, north }, props = {}) => ({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: props,
    geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }
  }]
});

// ───────────────── component ─────────────────
export default function MapboxComponent({ mapStyle }) {
  // seed camera once (Mapbox owns camera here for simplicity)
  const seedView = useMapStore(s => s.viewState);

  const { GeojsonFiles, etaEveryMeters, etaSpeedKmh } = useVrpStore();

  const {
    waypoints, waypointsVisible, hoveredWaypoint,
    setHoveredWaypoint, addWaypoint, clearHoveredWaypoint
  } = useWaypointStore();

  const {
    hoveredFeature, setHoveredFeature, clearHoveredFeature,
    addOnClickEnabled, drawBBoxEnabled, setDrawBBoxEnabled,
    lastBbox, setLastBbox, etasEnabled, trafficEnabled, setTrafficEnabled
  } = useUiStore();

  // Flattened route store (matches your updated store)
  const routes = useRouteStore(s => s.routes);
  const currentIndex = useRouteStore(s => s.currentIndex);

  // Local toggles (match MapLibre)
  const [clustersOn, setClustersOn] = useState(true);
  const [lassoOn, setLassoOn] = useState(false);
  const [tripsOn, setTripsOn] = useState(false);

  // single-tool rule
  useEffect(() => { if (lassoOn && drawBBoxEnabled) setDrawBBoxEnabled(false); }, [lassoOn, drawBBoxEnabled, setDrawBBoxEnabled]);
  useEffect(() => { if (drawBBoxEnabled && lassoOn) setLassoOn(false); }, [drawBBoxEnabled, lassoOn]);

  // Refs
  const mapRef = useRef(null);
  const overlayRef = useRef(null); // deck overlay
  const clusterCtlRef = useRef(null);
  const trafficCtlRef = useRef(null);
  const etaCtlRef = useRef(null);

  // ───────────────── BBox state (two modes) ─────────────────
  // SHIFT-drag (live red box) — lon/lat coordinates
  const [dragA, setDragA] = useState(null); // [lng,lat]
  const [dragB, setDragB] = useState(null);
  const DRAG_MIN_LL = 1e-6;

  // Two-click (green editable) state
  const [twoClickA, setTwoClickA] = useState(null);
  const [hoverCoord, setHoverCoord] = useState(null);

  useEffect(() => {
    if (!drawBBoxEnabled) {
      setDragA(null); setDragB(null);
      setTwoClickA(null); setHoverCoord(null);
    }
  }, [drawBBoxEnabled]);

  const dragRectFC = useMemo(() => {
    if (!(drawBBoxEnabled && dragA && dragB)) return null;
    const west = Math.min(dragA[0], dragB[0]);
    const east = Math.max(dragA[0], dragB[0]);
    const south = Math.min(dragA[1], dragB[1]);
    const north = Math.max(dragA[1], dragB[1]);
    return rectFC({ west, south, east, north }, { _temp: true });
  }, [drawBBoxEnabled, dragA, dragB]);

  // ───────────────── layers ─────────────────
  // Waypoints (hide if clusters are on to avoid double-vision)
  const waypointLayer = useMemo(() => {
    if (!waypointsVisible || waypoints.length === 0 || clustersOn) return null;
    const color = (t) =>
      t === 'Depot' ? [0, 0, 255] :
        t === 'Delivery' ? [0, 128, 0] :
          t === 'Pickup' ? [255, 165, 0] :
            t === 'Backhaul' ? [255, 0, 0] : [128, 128, 128];

    return new ScatterplotLayer({
      id: 'waypoints',
      data: waypoints,
      getPosition: d => d.coordinates,
      getFillColor: d => color(d.type),
      radiusUnits: 'pixels', getRadius: 10,
      pickable: true, radiusMinPixels: 8, radiusMaxPixels: 24,
      onClick: (info) => {
        if (info.object) {
          setHoveredWaypoint({ ...info.object, position: info.coordinate, screenX: info.x, screenY: info.y });
        } else {
          clearHoveredWaypoint();
        }
      }
    });
  }, [waypoints, waypointsVisible, clustersOn, setHoveredWaypoint, clearHoveredWaypoint]);

  // GeoJSON files
  const geoLayers = useMemo(() => {
    return GeojsonFiles
      .filter(f => f.visible && f?.data?.type === 'FeatureCollection' && Array.isArray(f?.data?.features))
      .map(file => new GeoJsonLayer({
        id: `geojson-${file.id}`,
        data: file.data, pickable: true, filled: true, stroked: true,
        getLineColor: [0, 0, 255], getFillColor: [0, 255, 0, 50], getLineWidth: 2,
        onClick: (info) => {
          if (info?.object) {
            setHoveredFeature({
              fileId: file.id, properties: info.object.properties,
              position: info.coordinate, screenX: info.x, screenY: info.y
            });
          }
        }
      }));
  }, [GeojsonFiles, setHoveredFeature]);

  // Two-click green editable layer
  const bboxEditableLayer = useMemo(() => {
    if (!drawBBoxEnabled || lassoOn) return null;
    return new EditableGeoJsonLayer({
      id: 'bbox-editable',
      data: { type: 'FeatureCollection', features: [] },
      mode: DrawRectangleMode,
      selectedFeatureIndexes: [],
      onEdit: ({ updatedData }) => {
        const f = updatedData?.features?.slice(-1)?.[0];
        const ring = f?.geometry?.coordinates?.[0];
        if (!Array.isArray(ring) || ring.length < 4) return;
        const lons = ring.map(([lon]) => lon);
        const lats = ring.map(([, lat]) => lat);
        const west = Math.min(...lons), east = Math.max(...lons);
        const south = Math.min(...lats), north = Math.max(...lats);
        setLastBbox({ west, south, east, north });
        // console.debug('[bbox:two-click]', { west, south, east, north });
      },
      getLineColor: [0, 180, 80],
      getFillColor: [0, 180, 80, 60],
      lineWidthMinPixels: 2
    });
  }, [drawBBoxEnabled, lassoOn, setLastBbox]);

  // Red live drag (SHIFT mode)
  const dragLayer = useMemo(() => {
    if (!dragRectFC) return null;
    return new GeoJsonLayer({
      id: 'bbox-drag-live',
      data: dragRectFC,
      stroked: true, filled: true,
      getLineColor: [255, 0, 0], getFillColor: [255, 0, 0, 60],
      lineWidthMinPixels: 2, pickable: false
    });
  }, [dragRectFC]);

  // Last bbox outline
  const lastBboxLayer = useMemo(() => {
    if (!lastBbox) return null;
    return new GeoJsonLayer({
      id: 'bbox-last',
      data: rectFC(lastBbox, { _last: true }),
      stroked: true, filled: false,
      getLineColor: [0, 128, 255],
      lineWidthMinPixels: 2
    });
  }, [lastBbox]);

  // Build safe routes list (fallback from waypointIds)
  const routesForRender = useMemo(() => {
    if (!Array.isArray(routes) || routes.length === 0) return [];
    const byIdx = new Map(waypoints.map((w, i) => [String(i), w.coordinates]));
    return routes.map(r => {
      if (Array.isArray(r.coords) && r.coords.length) return r;
      const ids = Array.isArray(r.waypointIds) ? r.waypointIds
        : Array.isArray(r.raw?.waypoint_ids) ? r.raw.waypoint_ids
          : [];
      const coords = ids.map(id => {
        const n = Number(id);
        return Number.isFinite(n) ? byIdx.get(String(n)) : null;
      }).filter(Boolean);
      return { ...r, coords };
    });
  }, [routes, waypoints]);

  const routeLayers = useMemo(() => {
    if (!routesForRender.length) return [];
    // Hide static Deck routes when traffic gradient or trips are on
    if (trafficEnabled || tripsOn) return [];
    const palette = [[230, 57, 70], [42, 157, 143], [38, 70, 83], [233, 196, 106], [29, 53, 87]];
    return routesForRender.map((r, idx) => new PathLayer({
      id: `route-${idx}`,
      data: [Array.isArray(r.coords) ? r.coords : []],
      getPath: d => d,
      widthUnits: 'pixels',
      getWidth: (idx === currentIndex) ? 5 : 3,
      getColor: (idx === currentIndex) ? palette[idx % palette.length] : [...palette[idx % palette.length], 100],
      pickable: false,
      parameters: { depthTest: false }
    }));
  }, [routesForRender, currentIndex, trafficEnabled, tripsOn]);

  // Small debug dots along current route (optional)
  const debugRouteDots = useMemo(() => {
    const r = routesForRender?.[currentIndex];
    if (!r?.coords?.length) return null;
    return new ScatterplotLayer({
      id: 'route-vertex-dots',
      data: r.coords, getPosition: d => d,
      getFillColor: [0, 0, 0],
      radiusUnits: 'pixels', getRadius: 2.5,
      parameters: { depthTest: false }
    });
  }, [routesForRender, currentIndex]);

  // Lasso (Deck)
  const lassoLayer = useMemo(() => {
    if (!lassoOn) return null;
    return createLassoLayer({
      waypoints,
      onSelect: (ids) => console.debug('[lasso] ids:', ids),
      setLastBbox
    });
  }, [lassoOn, waypoints, setLastBbox]);

  // ETA text (Deck)
  const etaTextLayer = useMemo(() => {
    if (!useUiStore.getState().showETAs) return null;
    const r = routesForRender?.[currentIndex];
    const coords = r?.coords, times = r?.etaEpoch, idxs = r?.etaIndices;
    if (!Array.isArray(coords) || !Array.isArray(times) || !Array.isArray(idxs)) return null;
    const data = idxs.map((vi, k) => ({
      position: coords[vi],
      label: new Date((times[k + 1] || times[k] || times[0]) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
    return new TextLayer({
      id: 'eta-text', data,
      getPosition: d => d.position, getText: d => d.label,
      sizeUnits: 'pixels', getSize: 12, getColor: [20, 20, 20],
      background: true, getBackgroundColor: [255, 255, 255, 210],
      getTextAnchor: 'middle', getAlignmentBaseline: 'center',
      parameters: { depthTest: false }
    });
  }, [routesForRender, currentIndex]);

  // Trips (Deck animated)
  const [currentTime, setCurrentTime] = useState(0);
  useEffect(() => {
    if (!tripsOn) return;
    let raf = 0, start = performance.now();
    const tick = (now) => { setCurrentTime((now - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tripsOn]);

  const tripsLayer = useMemo(() => {
    if (!tripsOn) return null;
    const r = routesForRender?.[currentIndex]; if (!r?.coords?.length) return null;
    // build [lng,lat,t]
    const path = []; let acc = 0; const speed = 12; // m/s
    for (let i = 0; i < r.coords.length; i++) {
      if (i) {
        const [lng1, lat1] = r.coords[i - 1], [lng2, lat2] = r.coords[i];
        const R = 6371000, toR = d => d * Math.PI / 180;
        const dlat = toR(lat2 - lat1), dlon = toR(lng2 - lng1);
        const a = Math.sin(dlat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dlon / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(a)); acc += dist / speed;
      }
      const [lng, lat] = r.coords[i]; path.push([lng, lat, acc]);
    }
    return createTripsLayer({ id: 'trips', trips: [{ path, color: [66, 135, 245], width: 6 }], currentTime, trailLength: 600 });
  }, [tripsOn, currentTime, routesForRender, currentIndex]);

  // Compose Deck layers
  const layers = useMemo(() => {
    const L = [];
    if (waypointLayer) L.push(waypointLayer);
    L.push(...geoLayers);
    if (lassoLayer) L.push(lassoLayer);
    if (bboxEditableLayer) L.push(bboxEditableLayer); // green two-click
    if (dragLayer) L.push(dragLayer);                 // red SHIFT-drag
    if (lastBboxLayer) L.push(lastBboxLayer);
    if (etaTextLayer) L.push(etaTextLayer);
    if (tripsLayer) L.push(tripsLayer);
    if (debugRouteDots) L.push(debugRouteDots);
    L.push(...routeLayers);
    return L;
  }, [waypointLayer, geoLayers, lassoLayer, bboxEditableLayer, dragLayer, lastBboxLayer, etaTextLayer, tripsLayer, debugRouteDots, routeLayers]);

  // ───────────────── Map load & Deck overlay wiring ─────────────────
  const handleDeckClick = useCallback((info) => {
    // Clear popups on empty
    if (!info?.object) { clearHoveredFeature(); clearHoveredWaypoint(); }

    // ── Two-click BBox (no Shift)
    if (drawBBoxEnabled && info?.coordinate) {
      const shift = info?.srcEvent?.shiftKey ?? info?.sourceEvent?.shiftKey ?? false;
      if (!shift) {
        if (!twoClickA) {
          setTwoClickA(info.coordinate);
          setHoverCoord(info.coordinate);
        } else {
          const a = twoClickA, b = info.coordinate;
          const west = Math.min(a[0], b[0]);
          const east = Math.max(a[0], b[0]);
          const south = Math.min(a[1], b[1]);
          const north = Math.max(a[1], b[1]);
          if ((east - west) > 1e-6 && (north - south) > 1e-6) {
            setLastBbox({ west, south, east, north });
          }
          setTwoClickA(null); setHoverCoord(null);
        }
        return; // ⛔ don’t fall through to click-to-add
      }
    }

    // ── Click-to-add (only when BBox tool is OFF)
    if (addOnClickEnabled && !drawBBoxEnabled && info?.coordinate) {
      const [lng, lat] = info.coordinate;
      addWaypoint({
        coordinates: [lng, lat],
        id: Date.now(),
        type: 'Delivery',
        demand: 1, capacity: 5, serviceTime: 10, timeWindow: [8, 17]
      });
    }
  }, [
    drawBBoxEnabled, twoClickA,
    addOnClickEnabled, addWaypoint,
    clearHoveredFeature, clearHoveredWaypoint,
    setLastBbox
  ]);

  const onDeckPointerDown = useCallback((info, evt) => {
    if (!(drawBBoxEnabled && !lassoOn)) return;
    const shift = evt?.srcEvent?.shiftKey ?? info?.srcEvent?.shiftKey ?? false;
    if (!shift) return; // only SHIFT-drag uses our red live box
    const coord = info?.coordinate; if (!coord) return;

    // freeze map pan while drawing
    mapRef.current?.getMap?.()?.dragPan?.disable?.();

    setDragA(coord);
    setDragB(coord);
    evt?.stopPropagation?.(); evt?.preventDefault?.();
  }, [drawBBoxEnabled, lassoOn]);

  const onDeckPointerMove = useCallback((info, evt) => {
    if (!(drawBBoxEnabled && !lassoOn) || !dragA) return;
    const shift = evt?.srcEvent?.shiftKey ?? info?.srcEvent?.shiftKey ?? false;
    if (!shift) return;
    const coord = info?.coordinate; if (!coord) return;
    setDragB(coord);
    evt?.stopPropagation?.(); evt?.preventDefault?.();
  }, [drawBBoxEnabled, lassoOn, dragA]);

  const onDeckPointerUp = useCallback((info, evt) => {
    if (!(drawBBoxEnabled && !lassoOn)) return;
    const shift = evt?.srcEvent?.shiftKey ?? info?.srcEvent?.shiftKey ?? false;
    if (!shift) return;

    const map = mapRef.current?.getMap?.(); map?.dragPan?.enable?.();

    if (dragA && dragB) {
      const west = Math.min(dragA[0], dragB[0]);
      const east = Math.max(dragA[0], dragB[0]);
      const south = Math.min(dragA[1], dragB[1]);
      const north = Math.max(dragA[1], dragB[1]);
      if ((east - west) > DRAG_MIN_LL && (north - south) > DRAG_MIN_LL) {
        setLastBbox({ west, south, east, north });
        // console.debug('[bbox] SHIFT-drag', { west, south, east, north });
      }
    }
    setDragA(null); setDragB(null);
    evt?.stopPropagation?.(); evt?.preventDefault?.();
  }, [drawBBoxEnabled, lassoOn, dragA, dragB, setLastBbox]);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    // Deck overlay
    if (!overlayRef.current) {
      overlayRef.current = new MapboxOverlay({
        interleaved: true,
        // disable rotate gestures so SHIFT is free for BBox
        controller: { dragRotate: false, touchRotate: false, scrollZoom: true, dragPan: !(drawBBoxEnabled || lassoOn) }
      });
      map.addControl(overlayRef.current);
    }
    overlayRef.current.setProps({
      layers,
      onClick: handleDeckClick,
      onPointerDown: onDeckPointerDown,
      onPointerMove: onDeckPointerMove,
      onPointerUp: onDeckPointerUp
    });

    // Clusters mount
    if (clustersOn && !clusterCtlRef.current) {
      const fcNow = {
        type: 'FeatureCollection',
        features: (waypointsVisible ? waypoints : []).map(w => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: w.coordinates }, properties: { id: w.id }
        }))
      };
      clusterCtlRef.current = addClusteredSource(map, { id: 'wp-clusters', data: fcNow, clusterRadius: 40 });
    }

    // expose for quick console tests
    if (typeof window !== 'undefined') window.__vrpMap = map;
  }, [layers, handleDeckClick, onDeckPointerDown, onDeckPointerMove, onDeckPointerUp, clustersOn, waypoints, waypointsVisible, drawBBoxEnabled, lassoOn]);

  const onBBoxOverlayClick = useCallback((e) => {
    if (!drawBBoxEnabled) return;
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    const el = e.currentTarget; // the overlay div
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { lng, lat } = map.unproject([x, y]);

    if (!twoClickA) {
      setTwoClickA([lng, lat]);
      setHoverCoord([lng, lat]);
    } else {
      const a = twoClickA, b = [lng, lat];
      const west = Math.min(a[0], b[0]);
      const east = Math.max(a[0], b[0]);
      const south = Math.min(a[1], b[1]);
      const north = Math.max(a[1], b[1]);
      if ((east - west) > 1e-6 && (north - south) > 1e-6) {
        setLastBbox({ west, south, east, north });
      }
      setTwoClickA(null);
      setHoverCoord(null);
    }
  }, [drawBBoxEnabled, twoClickA, setLastBbox]);

  // Keep overlay up-to-date
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({
        layers,
        onClick: handleDeckClick,
        onPointerDown: onDeckPointerDown,
        onPointerMove: onDeckPointerMove,
        onPointerUp: onDeckPointerUp,
        controller: { dragRotate: false, touchRotate: false, scrollZoom: true, dragPan: !(drawBBoxEnabled || lassoOn) }
      });
    }
  }, [layers, handleDeckClick, onDeckPointerDown, onDeckPointerMove, onDeckPointerUp, drawBBoxEnabled, lassoOn]);

  // Cleanup
  useEffect(() => {
    return () => {
      const map = mapRef.current?.getMap?.();
      if (map && overlayRef.current) {
        try { map.removeControl(overlayRef.current); } catch { }
        overlayRef.current = null;
      }
      clusterCtlRef.current?.remove(); clusterCtlRef.current = null;
      trafficCtlRef.current?.remove(); trafficCtlRef.current = null;
      etaCtlRef.current?.remove(); etaCtlRef.current = null;
    };
  }, []);

  // Cluster data updates
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    if (!clustersOn) {
      clusterCtlRef.current?.remove(); clusterCtlRef.current = null;
      return;
    }
    if (!clusterCtlRef.current) {
      clusterCtlRef.current = addClusteredSource(map, {
        id: 'wp-clusters',
        data: { type: 'FeatureCollection', features: [] },
        clusterRadius: 40
      });
    }
    const fc = {
      type: 'FeatureCollection',
      features: (waypointsVisible ? waypoints : []).map(w => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: w.coordinates }, properties: { id: w.id }
      }))
    };
    clusterCtlRef.current.update(fc);
  }, [clustersOn, waypoints, waypointsVisible]);

  // Map click: cluster single point → popup; else click-to-add handled by Deck
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    const onMapClick = (ev) => {
      // always clear popups
      clearHoveredFeature(); clearHoveredWaypoint();

      if (!drawBBoxEnabled) return; // let overlay handle other clicks

      const coord = [ev.lngLat.lng, ev.lngLat.lat];

      if (!twoClickA) {
        setTwoClickA(coord);
        setHoverCoord(coord);
      } else {
        const a = twoClickA, b = coord;
        const west = Math.min(a[0], b[0]);
        const east = Math.max(a[0], b[0]);
        const south = Math.min(a[1], b[1]);
        const north = Math.max(a[1], b[1]);
        if ((east - west) > 1e-6 && (north - south) > 1e-6) {
          setLastBbox({ west, south, east, north });
        }
        setTwoClickA(null); setHoverCoord(null);
      }
    };

    map.on('click', onMapClick);
    return () => map.off('click', onMapClick);
  }, [drawBBoxEnabled, twoClickA, setLastBbox, clearHoveredFeature, clearHoveredWaypoint]);

  // DOM-level capturing fallback: always catches clicks even if Deck overlay eats them
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    const container = map.getCanvasContainer?.() || map.getContainer?.();
    if (!container) return;

    const onContainerClick = (e) => {
      // Only handle BBox when tool is ON; otherwise ignore
      if (!drawBBoxEnabled) return;

      // Compute lng/lat from the DOM click
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const { lng, lat } = map.unproject([x, y]);

      // Two-click logic (no Shift)
      if (!twoClickA) {
        setTwoClickA([lng, lat]);
        setHoverCoord([lng, lat]);
      } else {
        const a = twoClickA, b = [lng, lat];
        const west = Math.min(a[0], b[0]);
        const east = Math.max(a[0], b[0]);
        const south = Math.min(a[1], b[1]);
        const north = Math.max(a[1], b[1]);
        if ((east - west) > 1e-6 && (north - south) > 1e-6) {
          setLastBbox({ west, south, east, north });
        }
        setTwoClickA(null);
        setHoverCoord(null);
      }

      // Important: do NOT stopPropagation here — we just ensure BBox is written.
      // Deck overlay / other handlers can still do their thing.
    };

    // Use capture=true so this fires even if something stops bubbling later
    container.addEventListener('click', onContainerClick, true);
    return () => container.removeEventListener('click', onContainerClick, true);
  }, [drawBBoxEnabled, twoClickA, setLastBbox]);


  // Traffic gradient sync (native Mapbox GL)
  useEffect(() => {
    const map = mapRef.current?.getMap?.(); if (!map) return;

    const sync = () => {
      const st = useRouteStore.getState();
      const r = st?.routes?.[st.currentIndex];
      const coords = Array.isArray(r?.coords) ? r.coords : [];
      if (!trafficEnabled || coords.length < 2) {
        trafficCtlRef.current?.remove(); trafficCtlRef.current = null; return;
      }
      const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
      if (!trafficCtlRef.current) {
        trafficCtlRef.current = addTrafficLine(map, { id: 'route-traffic', sourceId: 'route-traffic-src', routeData: line, width: 6 });
      } else {
        trafficCtlRef.current.update(line);
      }
    };

    const u = useRouteStore.subscribe(sync);
    sync();
    return () => { try { u && u(); } catch { } trafficCtlRef.current?.remove(); trafficCtlRef.current = null; };
  }, [trafficEnabled]);

  // ETA controller (native GL)
  useEffect(() => {
    const map = mapRef.current?.getMap?.(); if (!map) return;

    const getCoords = () => {
      const st = useRouteStore.getState();
      return st?.routes?.[st.currentIndex]?.coords || [];
    };

    if (!etasEnabled) { etaCtlRef.current?.remove(); etaCtlRef.current = null; return; }

    const coords = getCoords();
    if (coords.length < 2) { etaCtlRef.current?.remove(); etaCtlRef.current = null; return; }

    if (!etaCtlRef.current) etaCtlRef.current = createEtaController(map, { id: 'route-etas', sourceId: 'route-etas-src' });
    etaCtlRef.current.update(coords, { speedKmh: etaSpeedKmh, everyMeters: etaEveryMeters });

    const u = useRouteStore.subscribe(() => {
      const c2 = getCoords();
      if (c2.length >= 2) etaCtlRef.current?.update(c2, { speedKmh: etaSpeedKmh, everyMeters: etaEveryMeters });
      else { etaCtlRef.current?.remove(); etaCtlRef.current = null; }
    });

    return () => { try { u && u(); } catch { } etaCtlRef.current?.remove(); etaCtlRef.current = null; };
  }, [etasEnabled, etaEveryMeters, etaSpeedKmh]);

  // ───────────────── UI: small toggles like MapLibre ─────────────────
  return (
    <>
      <div className="absolute top-2 right-2 z-50 bg-black/90 text-white px-2 py-1 rounded shadow text-xs space-x-2">
        <label><input type="checkbox" checked={clustersOn} onChange={e => setClustersOn(e.target.checked)} /> Clusters</label>
        <label><input type="checkbox" checked={trafficEnabled} onChange={e => setTrafficEnabled(e.target.checked)} /> Traffic</label>
        <label><input type="checkbox" checked={lassoOn} onChange={e => setLassoOn(e.target.checked)} /> Lasso</label>
        <label><input type="checkbox" checked={tripsOn} onChange={e => setTripsOn(e.target.checked)} /> Trips</label>
      </div>

      <MapGL
        ref={mapRef}
        mapboxAccessToken={mapboxgl.accessToken}
        mapStyle={mapStyle || MAP_STYLE}
        initialViewState={seedView}
        onLoad={handleMapLoad}
        style={{ position: 'absolute', inset: 0 }}
      />
      {/* BBox click-capture overlay (only active when BBox tool is ON) */}
      <div
        data-testid="bbox-click-overlay"
        onClick={onBBoxOverlayClick}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 40,                 // below your z-50 toggles
          pointerEvents: drawBBoxEnabled ? 'auto' : 'none',
          background: 'transparent',
        }}
      />

      {/* Feature popup */}
      {hoveredFeature?.position && (
        <div
          className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{ left: `${hoveredFeature.screenX ?? 0}px`, top: `${hoveredFeature.screenY ?? 0}px`, transform: 'translate(10px, -100%)', pointerEvents: 'none', zIndex: 9999 }}
        >
          <pre className="whitespace-pre-wrap">{JSON.stringify(hoveredFeature.properties, null, 2)}</pre>
        </div>
      )}

      {/* Waypoint popup */}
      {hoveredWaypoint?.coordinates && (
        <div
          className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{ left: `${hoveredWaypoint.screenX ?? 0}px`, top: `${hoveredWaypoint.screenY ?? 0}px`, transform: 'translate(10px, -100%)', pointerEvents: 'none', zIndex: 9999 }}
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
