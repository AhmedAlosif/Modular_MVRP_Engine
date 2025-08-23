// components/map/MapLibreComponent.js
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeckGL } from '@deck.gl/react';
import { ScatterplotLayer, GeoJsonLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import MapGL from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { EditableGeoJsonLayer, DrawRectangleMode } from '@deck.gl-community/editable-layers';

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
import ContextMenu from '@/components/mapbox/ui/ContextMenu';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const EPS = 1e-6;
const PROGRAMMATIC_COOLDOWN_MS = 900;

const camEq = (a = {}, b = {}) =>
  Math.abs((a.longitude ?? 0) - (b.longitude ?? 0)) < EPS &&
  Math.abs((a.latitude ?? 0) - (b.latitude ?? 0)) < EPS &&
  Math.abs((a.zoom ?? 0) - (b.zoom ?? 0)) < EPS &&
  Math.abs((a.bearing ?? 0) - (b.bearing ?? 0)) < EPS &&
  Math.abs((a.pitch ?? 0) - (b.pitch ?? 0)) < EPS;

const camFromMap = (m) => {
  const c = m.getCenter();
  return { longitude: c.lng, latitude: c.lat, zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
};

function rectFC({ west, south, east, north }, props = {}) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: props,
      geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }
    }]
  };
}

export default function MapLibreComponent() {
  // ── stores
  const { viewState: storeView, setViewState: setStoreView } = useMapStore();
  const { GeojsonFiles, etaEveryMeters, etaSpeedKmh } = useVrpStore();

  // ✅ read the flat route array & current index
  const routes = useRouteStore(s => s.routes);
  const currentIndex = useRouteStore(s => s.currentIndex);
  const wps = useWaypointStore(s => s.waypoints);

  const {
    waypoints, waypointsVisible, hoveredWaypoint,
    setHoveredWaypoint, addWaypoint, clearHoveredWaypoint
  } = useWaypointStore();

  const {
    hoveredFeature, setHoveredFeature, clearHoveredFeature,
    addOnClickEnabled, drawBBoxEnabled, setDrawBBoxEnabled,
    lastBbox, setLastBbox, etasEnabled, trafficEnabled, setTrafficEnabled
  } = useUiStore();

  // ── local UI toggles
  const [clustersOn, setClustersOn] = useState(true);
  const [lassoOn, setLassoOn] = useState(false);
  const [tripsOn, setTripsOn] = useState(false);


  // BBox state (drag + two-click)
  const [twoClickA, setTwoClickA] = useState(null); // first corner for two-click mode
  const [hoverCoord, setHoverCoord] = useState(null); // live pointer for two-click preview

  // Reset twoClickA when user turns BBox off
  useEffect(() => {
    if (!drawBBoxEnabled) {
      setTwoClickA(null);
      setDragA(null);
      setDragB(null);
    }
  }, [drawBBoxEnabled]);

  // single-tool rule
  useEffect(() => { if (lassoOn && drawBBoxEnabled) setDrawBBoxEnabled(false); }, [lassoOn, drawBBoxEnabled, setDrawBBoxEnabled]);
  useEffect(() => { if (drawBBoxEnabled && lassoOn) setLassoOn(false); }, [drawBBoxEnabled, lassoOn]);

  // ── route access + version
  const getActiveRoute = useCallback(() => {
    const rs = useRouteStore.getState();
    return rs?.routes?.[rs.currentIndex] || null;
  }, []);

  const [routeVer, setRouteVer] = useState(0);
  useEffect(() => {
    const u = useRouteStore.subscribe(() => setRouteVer(v => v + 1));
    return () => { try { u && u(); } catch { } };
  }, []);

  // ── refs
  const mapRef = useRef(null);
  const deckRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Pause Deck's RAF unless animating
  useEffect(() => {
    const deck = deckRef.current?.deck;
    if (deck) deck.setProps({ _animate: !!tripsOn });
  }, [tripsOn]);

  // ── camera: Deck drives, Map follows via context
  const lastUserMoveTs = useRef(0);
  const isInteracting = useRef(false);
  const pendingViewRef = useRef(null);
  const cooldownTimerRef = useRef(null);

  // user → store (throttled)
  const deckToStoreTimer = useRef(0);
  const onDeckViewChange = useCallback(({ viewState }) => {
    lastUserMoveTs.current = performance.now();
    if (deckToStoreTimer.current) clearTimeout(deckToStoreTimer.current);
    const vs = {
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      bearing: viewState.bearing ?? 0,
      pitch: viewState.pitch ?? 0
    };
    deckToStoreTimer.current = setTimeout(() => { setStoreView(vs); }, 100);
  }, [setStoreView]);
  useEffect(() => () => deckToStoreTimer.current && clearTimeout(deckToStoreTimer.current), []);

  const onInteractionStateChange = useCallback((s) => {
    const active = !!(s?.isDragging || s?.isPanning || s?.isZooming || s?.isRotating || s?.inTransition);
    isInteracting.current = active;
    if (active) lastUserMoveTs.current = performance.now();
    if (active) { clearHoveredFeature(); clearHoveredWaypoint(); }  // clear popups on move start
  }, [clearHoveredFeature, clearHoveredWaypoint]);

  // also arm cooldown on map moveend (no React state)
  useEffect(() => {
    const map = mapRef.current?.getMap?.(); if (!map) return;
    const start = () => { isInteracting.current = true; lastUserMoveTs.current = performance.now(); };
    const end = () => {
      isInteracting.current = false;
      lastUserMoveTs.current = performance.now();
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => {
        const deck = deckRef.current?.deck;
        const m = mapRef.current?.getMap?.();
        const target = pendingViewRef.current;
        if (!deck || !m || !target) return;
        pendingViewRef.current = null;
        const current = camFromMap(m);
        if (camEq(current, target)) return;
        deck.setProps({ viewState: target });
        requestAnimationFrame(() => deck.setProps({ viewState: null }));
      }, PROGRAMMATIC_COOLDOWN_MS);
    };
    map.on('movestart', start);
    map.on('moveend', end);
    return () => { map.off('movestart', start); map.off('moveend', end); clearTimeout(cooldownTimerRef.current); };
  }, [mapLoaded]);

  // store → Deck (programmatic)
  useEffect(() => {
    const deck = deckRef.current?.deck;
    const map = mapRef.current?.getMap?.();
    if (!deck || !map || !storeView) return;

    const since = performance.now() - lastUserMoveTs.current;
    const cooling = isInteracting.current || since < PROGRAMMATIC_COOLDOWN_MS;
    if (cooling) { pendingViewRef.current = storeView; return; }

    const current = camFromMap(map);
    if (camEq(current, storeView)) return;

    deck.setProps({ viewState: storeView });
    requestAnimationFrame(() => deck.setProps({ viewState: null }));
  }, [storeView]);

  // seed store on load (once)
  useEffect(() => {
    if (!mapLoaded) return;
    const m = mapRef.current?.getMap?.(); if (!m) return;
    setStoreView(camFromMap(m));
  }, [mapLoaded, setStoreView]);

  // ── BBox (Deck pointer events)
  const [dragA, setDragA] = useState(null);
  const [dragB, setDragB] = useState(null);
  const DRAG_MIN_LL = 1e-6;
  // Disable boxZoom (only) while BBox tool is active
  useEffect(() => {
    const m = mapRef.current?.getMap?.();
    if (!m) return;

    // rotation is already disabled elsewhere, just ensure boxZoom doesn’t interfere
    try {
      if (drawBBoxEnabled) {
        m.boxZoom?.disable?.();
      } else {
        m.boxZoom?.enable?.();
      }
    } catch { }
  }, [drawBBoxEnabled]);

  // drag-to-draw (DeckGL pointer)
  const onDeckPointerDown = useCallback((evt) => {
    if (!(drawBBoxEnabled && !lassoOn)) return;
    const shift = evt?.srcEvent?.shiftKey;
    if (!shift) return;                 // let EditableGeoJsonLayer handle normal BBox
    evt.stopPropagation?.();
    evt.preventDefault?.();

    const coord = evt?.coordinate;
    if (!coord) return;

    // freeze map pan while drawing
    mapRef.current?.getMap?.()?.dragPan?.disable?.();

    setDragA(coord);
    setDragB(coord);       // start live rect immediately
  }, [drawBBoxEnabled, lassoOn]);

  const onDeckPointerMove = useCallback((evt) => {
    if (!(drawBBoxEnabled && !lassoOn)) return;
    if (!dragA) return;
    if (!dragA) return;                 // only active during SHIFT mode
    const shift = evt?.srcEvent?.shiftKey;
    if (!shift) return;

    evt.stopPropagation?.();
    evt.preventDefault?.();

    const coord = evt?.coordinate;
    if (!coord) return;
    setDragB(coord);
  }, [drawBBoxEnabled, lassoOn, dragA]);

  const onDeckPointerUp = useCallback((evt) => {
    if (!(drawBBoxEnabled && !lassoOn)) return;
    const shift = evt?.srcEvent?.shiftKey;
    if (!shift) return;                 // normal mode handled by editable layer

    evt.stopPropagation?.();
    evt.preventDefault?.();

    const map = mapRef.current?.getMap?.();
    map?.dragPan?.enable?.();

    if (dragA && dragB) {
      const west = Math.min(dragA[0], dragB[0]);
      const east = Math.max(dragA[0], dragB[0]);
      const south = Math.min(dragA[1], dragB[1]);
      const north = Math.max(dragA[1], dragB[1]);
      if ((east - west) > DRAG_MIN_LL && (north - south) > DRAG_MIN_LL) {
        setLastBbox({ west, south, east, north });
        console.debug('[bbox] setLastBbox', { west, south, east, north });
      }
    }
    setDragA(null);
    setDragB(null);
  }, [drawBBoxEnabled, lassoOn, dragA, dragB, setLastBbox]);

  const dragRectFC = useMemo(() => {
    if (!(drawBBoxEnabled && dragA && dragB)) return null;
    const west = Math.min(dragA[0], dragB[0]);
    const east = Math.max(dragA[0], dragB[0]);
    const south = Math.min(dragA[1], dragB[1]);
    const north = Math.max(dragA[1], dragB[1]);
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { _temp: true },
        geometry: {
          type: 'Polygon',
          coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
        }
      }]
    };
  }, [drawBBoxEnabled, dragA, dragB]);

  // ── layers

  // waypoints (hidden when clusters are on)
  const waypointLayer = useMemo(() => {
    if (!waypointsVisible || waypoints.length === 0 || clustersOn) return null;
    const color = (t) => t === 'Depot' ? [0, 0, 255]
      : t === 'Delivery' ? [0, 128, 0]
        : t === 'Pickup' ? [255, 165, 0]
          : t === 'Backhaul' ? [255, 0, 0]
            : [128, 128, 128];
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

  // geojson files
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
              fileId: file.id,
              properties: info.object.properties,
              position: info.coordinate,
              screenX: info.x, screenY: info.y
            });
          }
        }
      }));
  }, [GeojsonFiles, setHoveredFeature]);

  // BBox drag layer
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
        console.debug('[bbox:two-click]', { west, south, east, north });
      },
      getLineColor: [0, 180, 80],
      getFillColor: [0, 180, 80, 60],
      lineWidthMinPixels: 2
    });
  }, [drawBBoxEnabled, lassoOn, setLastBbox]);

  // Build renderable routes; fall back to waypoint_ids if coords are absent

  // build a safe list of routes with coords; if missing, derive from waypoint_ids
  const routesForRender = useMemo(() => {
    if (!Array.isArray(routes) || routes.length === 0) return [];
    const byIdx = new (globalThis.Map)(wps.map((w, i) => [String(i), w.coordinates]));
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
  }, [routes, wps]);

  const routeLayers = useMemo(() => {
    if (!routesForRender.length) return [];
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
  }, [routesForRender, currentIndex]);

  const debugRouteLine = useMemo(() => {
    const r = getActiveRoute();
    if (!r?.coords?.length) return null;
    return new PathLayer({
      id: 'debug-route-line',
      data: [r.coords],
      getPath: d => d,
      getColor: [0, 0, 0, 160],
      widthUnits: 'pixels',
      getWidth: 2,
      parameters: { depthTest: false }
    });
  }, [routeVer, getActiveRoute]);

  const debugRouteDots = useMemo(() => {
    const r = getActiveRoute();
    if (!r?.coords?.length) return null;
    return new ScatterplotLayer({
      id: 'debug-route-dots',
      data: r.coords.map((c, i) => ({ coord: c, i })),
      getPosition: d => d.coord,
      getFillColor: [0, 0, 0],
      radiusUnits: 'pixels',
      getRadius: 2.5,
      parameters: { depthTest: false }
    });
  }, [routeVer, getActiveRoute]);
  // and include it in your layers stack if you like

  const dragLayer = useMemo(() => {
    if (!dragRectFC) return null;
    return new GeoJsonLayer({
      id: 'bbox-drag-live',
      data: dragRectFC,
      stroked: true, filled: true,
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
      data: rectFC(lastBbox, { _last: true }),
      stroked: true, filled: false,
      getLineColor: [0, 128, 255],
      lineWidthMinPixels: 2
    });
  }, [lastBbox]);

  // route vertex dots for visibility
  const routeDots = useMemo(() => {
    const r = routesForRender?.[currentIndex];
    if (!r?.coords?.length) return null;
    // small black dots along the current route
    return new ScatterplotLayer({
      id: 'route-vertex-dots',
      data: r.coords,
      getPosition: d => d,
      getFillColor: [0, 0, 0],
      radiusUnits: 'pixels',
      getRadius: 2.5,
      parameters: { depthTest: false }
    });
  }, [routesForRender, currentIndex]);

  const lassoLayer = useMemo(() => {
    if (!lassoOn) return null;
    return createLassoLayer({ waypoints, onSelect: (ids) => console.debug('[lasso] ids:', ids), setLastBbox });
  }, [lassoOn, waypoints, setLastBbox]);

  const etaTextLayer = useMemo(() => {
    if (!useUiStore.getState().showETAs) return null;
    const route = getActiveRoute();
    const coords = route?.coords, times = route?.etaEpoch, idxs = route?.etaIndices;
    if (!Array.isArray(coords) || !Array.isArray(times) || !Array.isArray(idxs)) return null;
    const data = idxs.map((vi, k) => ({
      position: coords[vi],
      label: new Date((times[k + 1] || times[k] || times[0]) * 1000)
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
    return new TextLayer({
      id: 'eta-text', data,
      getPosition: d => d.position, getText: d => d.label,
      sizeUnits: 'pixels', getSize: 12, getColor: [20, 20, 20],
      background: true, getBackgroundColor: [255, 255, 255, 210],
      getTextAnchor: 'middle', getAlignmentBaseline: 'center',
      parameters: { depthTest: false }
    });
  }, [routeVer, getActiveRoute]);

  // Trips (animated)
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
    const route = getActiveRoute(); if (!route?.coords?.length) return null;
    const path = []; let acc = 0, speed = 12;
    for (let i = 0; i < route.coords.length; i++) {
      if (i) {
        const [lng1, lat1] = route.coords[i - 1], [lng2, lat2] = route.coords[i];
        const R = 6371000, toR = d => d * Math.PI / 180;
        const dlat = toR(lat2 - lat1), dlon = toR(lng2 - lng1);
        const a = Math.sin(dlat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dlon / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(a)); acc += dist / speed;
      }
      const [lng, lat] = route.coords[i]; path.push([lng, lat, acc]);
    }
    return createTripsLayer({ id: 'trips', trips: [{ path, color: [66, 135, 245], width: 6 }], currentTime, trailLength: 600 });
  }, [tripsOn, currentTime, routeVer, getActiveRoute]);

  const layers = useMemo(() => {
    const L = [];
    if (debugRouteLine) L.push(debugRouteLine);
    if (debugRouteDots) L.push(debugRouteDots);

    if (waypointLayer) L.push(waypointLayer);
    L.push(...geoLayers);
    if (lassoLayer) L.push(lassoLayer);
    if (bboxEditableLayer) L.push(bboxEditableLayer);
    if (dragLayer) L.push(dragLayer);
    if (lastBboxLayer) L.push(lastBboxLayer);
    if (etaTextLayer) L.push(etaTextLayer);
    if (tripsLayer) L.push(tripsLayer);
    L.push(...routeLayers);
    return L;
  }, [bboxEditableLayer, debugRouteLine, debugRouteDots, waypointLayer, geoLayers, lassoLayer, dragLayer, lastBboxLayer, etaTextLayer, tripsLayer, routeLayers]);

  // ── clusters
  const clusterCtlRef = useRef(null);

  // mount/unmount
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded) return;

    if (!clustersOn) {
      clusterCtlRef.current?.remove();
      clusterCtlRef.current = null;
      return;
    }

    if (!clusterCtlRef.current) {
      const fcNow = {
        type: 'FeatureCollection',
        features: (waypointsVisible ? waypoints : []).map(w => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: w.coordinates }, properties: { id: w.id }
        }))
      };
      clusterCtlRef.current = addClusteredSource(map, { id: 'wp-clusters', data: fcNow, clusterRadius: 40 });
    }
    return () => { if (!clustersOn) { clusterCtlRef.current?.remove(); clusterCtlRef.current = null; } };
  }, [mapLoaded, clustersOn, waypoints, waypointsVisible]);

  // data updates
  useEffect(() => {
    if (!clusterCtlRef.current) return;
    const fc = {
      type: 'FeatureCollection',
      features: (waypointsVisible ? waypoints : []).map(w => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: w.coordinates }, properties: { id: w.id }
      }))
    };
    clusterCtlRef.current.update(fc);
  }, [waypoints, waypointsVisible]);

  // map clicks: cluster single point → popup; otherwise click-to-add
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded) return;

    const onMapClick = (ev) => {
      // always clear
      clearHoveredFeature(); clearHoveredWaypoint();

      // cluster single point?
      if (clustersOn) {
        const feats = map.queryRenderedFeatures(ev.point);
        const f = feats?.find(ft => ft?.source === 'wp-clusters' && !ft?.properties?.cluster);
        if (f) {
          const id = f.properties.id;
          const wp = useWaypointStore.getState().waypoints.find(w => String(w.id) === String(id));
          if (wp) {
            setHoveredWaypoint({ ...wp, position: [ev.lngLat.lng, ev.lngLat.lat], screenX: ev.point.x, screenY: ev.point.y });
            return;
          }
        }
      }

      // empty space → add waypoint (if enabled and not drawing)
      if (addOnClickEnabled && !(drawBBoxEnabled && dragA && dragB)) {
        addWaypoint({
          coordinates: [ev.lngLat.lng, ev.lngLat.lat],
          id: Date.now(), type: 'Delivery',
          demand: 1, capacity: 5, serviceTime: 10, timeWindow: [8, 17]
        });
      }
    };

    map.on('click', onMapClick);
    return () => map.off('click', onMapClick);
  }, [mapLoaded, clustersOn, addOnClickEnabled, drawBBoxEnabled, dragA, dragB, addWaypoint, clearHoveredFeature, clearHoveredWaypoint, setHoveredWaypoint]);

  // Also hook Deck onClick so click-to-add works even when Map doesn't receive the event
  const onDeckClick = useCallback((info) => {
    // Clear popups on empty
    if (!info?.object) { clearHoveredFeature(); clearHoveredWaypoint(); }

    // ----- Two-click BBox -----
    if (drawBBoxEnabled && !lassoOn && info?.coordinate) {
      // Shift: skip two-click (let user do map gestures unhindered)
      const shift = info?.srcEvent?.shiftKey;
      if (!shift) {
        if (!twoClickA) {
          setTwoClickA(info.coordinate);
          setHoverCoord(info.coordinate);
          console.debug('[bbox] two-click: set A', info.coordinate);
        } else {
          const a = twoClickA, b = info.coordinate;
          const west = Math.min(a[0], b[0]);
          const east = Math.max(a[0], b[0]);
          const south = Math.min(a[1], b[1]);
          const north = Math.max(a[1], b[1]);
          if (Math.abs(east - west) > 1e-6 && Math.abs(north - south) > 1e-6) {
            setLastBbox({ west, south, east, north });
            console.debug('[bbox] two-click: box', { west, south, east, north });
          }
          setTwoClickA(null);
          setHoverCoord(null);
        }
        return; // ⛔ don’t fall through to click-to-add
      }
    }

    // ----- Click-to-add waypoint (only when BBox tool is OFF) -----
    if (addOnClickEnabled && !drawBBoxEnabled && info?.coordinate) {
      const [lng, lat] = info.coordinate;
      addWaypoint({
        coordinates: [lng, lat],
        id: Date.now(),
        demand: 1,
        capacity: 5,
        serviceTime: 10,
        timeWindow: [8, 17],
        type: 'Delivery'
      });
    }
  }, [
    drawBBoxEnabled, lassoOn, twoClickA,
    addOnClickEnabled, addWaypoint,
    clearHoveredFeature, clearHoveredWaypoint, setLastBbox
  ]);

  // ── traffic & ETAs (native GL)
  const trafficCtlRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded) return;

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
  }, [mapLoaded, trafficEnabled]);

  const etaCtlRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded) return;

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
  }, [etasEnabled, etaEveryMeters, etaSpeedKmh, mapLoaded]);

  // ── render
  const initialView = storeView || { longitude: -73.985, latitude: 40.758, zoom: 12, bearing: 0, pitch: 0 };
  const deckController = useMemo(() => ({
    dragPan: !(drawBBoxEnabled || lassoOn),   // disable pan while drawing/lasso
    scrollZoom: true,
    doubleClickZoom: true,
    touchRotate: false,
    dragRotate: false,
  }), [drawBBoxEnabled, lassoOn]);

  return (
    <>
      {/* quick toggles */}
      <div className="absolute top-2 right-2 z-50 bg-black/90 text-white px-2 py-1 rounded shadow text-xs space-x-2">
        <label><input type="checkbox" checked={clustersOn} onChange={e => setClustersOn(e.target.checked)} /> Clusters</label>
        <label><input type="checkbox" checked={trafficEnabled} onChange={e => setTrafficEnabled(e.target.checked)} /> Traffic</label>
        <label><input type="checkbox" checked={lassoOn} onChange={e => setLassoOn(e.target.checked)} /> Lasso</label>
        <label><input type="checkbox" checked={tripsOn} onChange={e => setTripsOn(e.target.checked)} /> Trips</label>
      </div>

      <DeckGL
        ref={deckRef}
        initialViewState={initialView}
        controller={deckController}
        onViewStateChange={onDeckViewChange}
        onInteractionStateChange={onInteractionStateChange}
        useDevicePixels={1}
        layers={layers}
        onPointerDown={onDeckPointerDown}
        onPointerMove={onDeckPointerMove}
        onPointerUp={onDeckPointerUp}
        onClick={onDeckClick}
        style={{ position: 'absolute', inset: 0, cursor: (drawBBoxEnabled || lassoOn) ? 'crosshair' : 'grab' }}
      >
        <MapGL
          ref={mapRef}
          mapLib={maplibregl}
          mapStyle={MAP_STYLE}
          renderWorldCopies={false}
          fadeDuration={0}
          dragRotate={false}
          touchZoomRotate={false}
          style={{ position: 'absolute', inset: 0 }}
          onLoad={() => {
            setMapLoaded(true);
            const m = mapRef.current?.getMap?.();
            try { m.dragRotate?.disable(); } catch { }
            try { m.touchZoomRotate?.disableRotation(); } catch { }
          }}
        />
      </DeckGL>

      <ContextMenu
        mapRef={mapRef}
        items={[{
          label: 'Add waypoint here',
          onClick: ({ lng, lat }) => {
            try {
              const st = window?.useWaypointStore?.getState?.();
              const wp = { id: `ctx-${Date.now()}`, coordinates: [lng, lat], type: 'Delivery', demand: 1, capacity: 5, serviceTime: 10, timeWindow: [8, 17] };
              if (st?.setWaypointsVisible && st.waypointsVisible === false) st.setWaypointsVisible(true);
              st?.addWaypoint?.(wp);
            } catch (e) { console.error('[ctx] addWaypoint error', e); }
          }
        }]}
      />

      {/* popups */}
      {hoveredFeature?.position && (
        <div className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{ left: `${hoveredFeature.screenX ?? 0}px`, top: `${hoveredFeature.screenY ?? 0}px`, transform: 'translate(10px, -100%)', pointerEvents: 'none', zIndex: 9999 }}>
          <pre className="whitespace-pre-wrap">{JSON.stringify(hoveredFeature.properties, null, 2)}</pre>
        </div>
      )}

      {hoveredWaypoint?.coordinates && (
        <div className="absolute bg-white text-black p-2 rounded shadow-lg text-sm"
          style={{ left: `${hoveredWaypoint.screenX ?? 0}px`, top: `${hoveredWaypoint.screenY ?? 0}px`, transform: 'translate(10px, -100%)', pointerEvents: 'none', zIndex: 9999 }}>
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
