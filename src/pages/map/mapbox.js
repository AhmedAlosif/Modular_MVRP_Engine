'use client';

import dynamic from 'next/dynamic';
import Sidebar from '@/components/sidebar/Sidebar';
import useMapStore from '@/hooks/useMapStore';

const MapboxComponent = dynamic(() => import('@/components/map/MapboxComponent'), { ssr: false });

export default function MapboxPage() {
  const mapStyle = useMapStore((s) => s.mapStyle);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 relative">
        <MapboxComponent mapStyle={mapStyle} />
      </div>
    </div>
  );
}
