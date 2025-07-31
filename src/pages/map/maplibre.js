'use client';
import Sidebar from "@/components/Sidebar";
import MapComponent from "@/components/MapComponent";

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
