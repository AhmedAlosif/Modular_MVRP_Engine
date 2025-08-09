'use client';

import { useRef, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import useMapStore from '@/hooks/useMapStore';
import useVrpStore from '@/hooks/useVRPStore';
import useWaypointStore from '@/hooks/useWaypointStore';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default function MapboxComponent({ mapStyle }) {
    const mapRef = useRef(null);
    const viewState = useMapStore((s) => s.viewState);
    const setViewState = useMapStore((s) => s.setViewState);

    const geojsonFiles = useVrpStore((s) => s.GeojsonFiles);
    const waypoints = useWaypointStore((s) => s.waypoints);

    // Update map view state
    const handleMove = (evt) => {
        setViewState(evt.viewState);
    };

    // Fit to features when new files are loaded
    useEffect(() => {
        if (mapRef.current && geojsonFiles.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            geojsonFiles.forEach((file) => {
                file.data.features.forEach((f) => {
                    if (f.geometry.type === 'Point') {
                        bounds.extend(f.geometry.coordinates);
                    } else if (f.geometry.type === 'LineString' || f.geometry.type === 'Polygon') {
                        f.geometry.coordinates.flat(Infinity).forEach((coord) => bounds.extend(coord));
                    }
                });
            });
            if (!bounds.isEmpty()) {
                mapRef.current.fitBounds(bounds, { padding: 50 });
            }
        }
    }, [geojsonFiles]);

    return (
        <Map
            ref={mapRef}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={viewState}
            onMove={handleMove}
            mapStyle={mapStyle || 'mapbox://styles/mapbox/streets-v12'}
            style={{ width: '100%', height: '100%' }}
        >
            {/* Render uploaded GeoJSON layers */}
            {geojsonFiles.map((file) => (
                <Source key={file.id} type="geojson" data={file.data}>
                    <Layer
                        id={`layer-${file.id}`}
                        type="line"
                        paint={{ 'line-color': '#007cbf', 'line-width': 2 }}
                    />
                    <Layer
                        id={`points-${file.id}`}
                        type="circle"
                        paint={{
                            'circle-radius': 5,
                            'circle-color': '#FF5722',
                            'circle-stroke-color': '#fff',
                            'circle-stroke-width': 1,
                        }}
                    />
                </Source>
            ))}

            {/* Render waypoints */}
            {waypoints.length > 0 && (
                <Source
                    id="waypoints"
                    type="geojson"
                    data={{
                        type: 'FeatureCollection',
                        features: waypoints.map((wp) => ({
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: wp.coordinates },
                            properties: { id: wp.id, type: wp.type || 'customer' },
                        })),
                    }}
                >
                    <Layer
                        id="waypoints-layer"
                        type="circle"
                        paint={{
                            'circle-radius': 6,
                            'circle-color': [
                                'match',
                                ['get', 'type'],
                                'depot', '#2196F3',
                                'customer', '#4CAF50',
                                '#9E9E9E',
                            ],
                            'circle-stroke-color': '#fff',
                            'circle-stroke-width': 1,
                        }}
                    />
                </Source>
            )}
        </Map>
    );
}
