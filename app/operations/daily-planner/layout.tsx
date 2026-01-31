"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import InputPage from "./input/page";
import SheetsPage from "./sheets/page";
import { useEffect, useState, useRef } from "react";
import EditRouteForm from "@/src/components/operations/daily-planner/EditRouteForm";
import { Id } from "@/convex/_generated/dataModel";

export default function DailyPlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const isActive = (path: string) => pathname.startsWith(path);
  const isEditPage = pathname.includes("/edit/");
  
  // URL-driven Edit State
  const editRouteId = searchParams.get("editRouteId");

  const [leftWidth, setLeftWidth] = useState(65);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const totalWidth = window.innerWidth;
      const newLeftWidth = (e.clientX / totalWidth) * 100;
      setLeftWidth(newLeftWidth);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "default";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const startResize = () => {
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
  };

  const closeEditPanel = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("editRouteId");
    router.push(`?${params.toString()}`);
  };

  if (isEditPage) {
    return <>{children}</>;
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Slide-over Overlay */}
      {editRouteId && (
        <div className="absolute inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[600px] h-full bg-white shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">Edit Route</h2>
              <button 
                onClick={closeEditPanel}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <EditRouteForm 
                routeId={editRouteId as Id<"dailyRoutes">}
                onSuccess={closeEditPanel}
                onCancel={closeEditPanel}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile/Tablet Header & Tabs (Hidden on Desktop) */}
      <div className="lg:hidden flex-shrink-0">
        <div className="border-b px-8 pt-6">
          <h2 className="text-lg font-semibold mb-4">Daily Planner</h2>
          <div className="flex gap-6">
            <Link
              href="/operations/daily-planner/input"
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                isActive("/operations/daily-planner/input")
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Input
            </Link>
            
            <Link
              href="/operations/daily-planner/sheets"
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                isActive("/operations/daily-planner/sheets")
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Sheets
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet Content (Hidden on Desktop) */}
      <div className="lg:hidden p-8 flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Desktop Split View (Resizable) */}
      <div className="hidden lg:flex flex-1 overflow-hidden w-full relative min-h-0">
        
        {/* Left Pane — Input */}
        <div 
          className="h-full overflow-y-auto min-h-0" 
          style={{ width: `${leftWidth}%` }} 
        > 
          <div className="p-8 max-w-none w-full"> 
            <InputPage /> 
          </div> 
        </div> 
      
        {/* Resizer */} 
        <div 
          className="w-2 cursor-col-resize bg-gray-200 hover:bg-gray-300" 
          onMouseDown={startResize}
        /> 
      
        {/* Right Pane — Sheets */} 
        <div 
          className="h-full overflow-y-auto min-h-0 flex-1" 
        > 
          <div className="p-4 w-full"> 
            <SheetsPage /> 
          </div> 
        </div> 
      </div>
    </div>
  );
}
