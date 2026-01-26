"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import InputPage from "./input/page";
import SheetsPage from "./sheets/page";
import { useEffect, useState, useRef } from "react";

export default function DailyPlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (path: string) => pathname.startsWith(path);
  const isEditPage = pathname.includes("/edit/");

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

  if (isEditPage) {
    return <>{children}</>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Mobile/Tablet Header & Tabs (Hidden on Desktop) */}
      <div className="lg:hidden">
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
      <div className="hidden lg:flex flex-1 overflow-hidden w-full relative">
        
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
