'use client';
import Sidebar from "@/components/sidebar/Sidebar";
import MapComponent from "@/components/map/MapComponent";

export default function MapLibrePage() {

  return (
    <div className="flex flex-row w-screen h-screen overflow-hidden">
      <Sidebar/>
      <div className="flex-1 relative">
        <MapComponent />
      </div>
    </div>
  );
}
