"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import InputPage from "./input/page";
import SheetsPage from "./sheets/page";
import { useEffect, useState, useRef } from "react";
import EditRouteForm from "@/src/components/operations/daily-planner/EditRouteForm";
import { Id } from "@/convex/_generated/dataModel";

type ViewMode = "split" | "input" | "sheets";

const ViewIcon = {
  split: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="6" height="12" rx="1" fill="currentColor" opacity="0.9"/>
      <rect x="9" y="2" width="6" height="12" rx="1" fill="currentColor" opacity="0.9"/>
    </svg>
  ),
  input: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="12" rx="1" fill="currentColor" opacity="0.9"/>
    </svg>
  ),
  sheets: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="3" rx="0.5" fill="currentColor" opacity="0.5"/>
      <rect x="1" y="7" width="14" height="3" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="1" y="12" width="14" height="2" rx="0.5" fill="currentColor" opacity="0.9"/>
    </svg>
  ),
};

export default function DailyPlannerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isLight, setIsLight] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  const editRouteId = searchParams.get("editRouteId");
  const [leftWidth, setLeftWidth] = useState(65);
  const isDraggingRef = useRef(false);

  // Theme observer
  useEffect(() => {
    const check = () => setIsLight(!document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Resizer drag listeners
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newLeftWidth = (e.clientX / window.innerWidth) * 100;
      setLeftWidth(Math.min(Math.max(newLeftWidth, 20), 80));
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

  // Theme-aware class helpers
  const paneBg   = isLight ? "bg-white border-gray-200 shadow-md"       : "bg-white/10 backdrop-blur-xl border-white/10";
  const paneWrap = isLight ? "bg-white border-gray-200 shadow-md"       : "bg-white/10 backdrop-blur-xl border-white/10";
  const resizerBg = isLight ? "bg-gray-300 hover:bg-gray-400"           : "bg-black/20 hover:bg-black/30";
  const textBase  = isLight ? "text-gray-900"                           : "text-gray-900";
  const toggleBg  = isLight ? "bg-gray-100 border border-gray-200"      : "bg-white/10 border border-white/10";
  const toggleActive = isLight ? "bg-white shadow text-gray-900"        : "bg-white/20 shadow text-white";
  const toggleInactive = isLight ? "text-gray-500 hover:text-gray-700"  : "text-gray-400 hover:text-white";

  if (pathname.includes("/edit/")) return <>{children}</>;

  return (
    <div className="h-full min-h-0 flex flex-col relative overflow-hidden">

      {/* Edit slide-over */}
      {editRouteId && (
        <div className="absolute inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className={`w-[600px] h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300 ${isLight ? "bg-white border-gray-200" : "bg-white/90 border-white/40 backdrop-blur-lg"}`}>
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isLight ? "border-gray-200 bg-gray-50" : "border-white/30 bg-white/20 backdrop-blur-sm"}`}>
              <h2 className={`text-lg font-semibold ${textBase}`}>Edit Route</h2>
              <button onClick={closeEditPanel} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hidden p-6">
              <EditRouteForm routeId={editRouteId as Id<"dailyRoutes">} onSuccess={closeEditPanel} onCancel={closeEditPanel} />
            </div>
          </div>
        </div>
      )}

      {/* Mobile header */}
      <div className="lg:hidden flex-shrink-0">
        <div className={`border-b px-8 pt-6 ${isLight ? "bg-white border-gray-200" : "bg-white/0 backdrop-blur-lg border-white/10"}`}>
          <h2 className={`text-lg font-semibold mb-4 ${textBase}`}>Daily Planner</h2>
          <div className="flex gap-6">
            {[
              { href: "/operations/daily-planner/input", label: "Input" },
              { href: "/operations/daily-planner/sheets", label: "Sheets" },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                className={`pb-2 text-sm font-medium border-b-2 transition-all ${pathname.startsWith(href) ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile content */}
      <div className={`lg:hidden p-8 flex-1 overflow-y-auto scrollbar-hidden ${isLight ? "bg-white" : "bg-white/0 backdrop-blur-sm"}`}>
        {children}
      </div>

      {/* Desktop layout */}
      <div className="hidden lg:flex flex-col flex-1 overflow-hidden min-h-0">

        {/* View mode toggle bar */}
        <div className={`flex-shrink-0 flex items-center justify-end px-4 py-1.5 border-b gap-2 ${isLight ? "border-gray-200 bg-white/60" : "border-white/10 bg-black/10"}`}>
          <span className={`text-xs mr-1 ${isLight ? "text-gray-400" : "text-gray-500"}`}>View</span>
          <div className={`flex items-center rounded-lg p-0.5 gap-0.5 ${toggleBg}`}>
            {(["input", "split", "sheets"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={mode === "input" ? "New Route only" : mode === "sheets" ? "Sheets only" : "Split view"}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === mode ? toggleActive : toggleInactive
                }`}
              >
                {ViewIcon[mode]}
                <span className="capitalize">{mode === "input" ? "New Route" : mode === "split" ? "Split" : "Sheets"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Panes */}
        <div className="flex flex-1 overflow-hidden w-full relative min-h-0">

          {/* Left pane — Input */}
          {(viewMode === "split" || viewMode === "input") && (
            <div
              className={`h-full overflow-y-auto overscroll-y-contain scrollbar-hidden min-h-0 min-w-0 ${viewMode === "split" ? "border-r" : ""} ${isLight ? "bg-gray-50 border-gray-200" : "bg-white/0 backdrop-blur-lg border-white/10"}`}
              style={{ width: viewMode === "input" ? "100%" : viewMode === "split" ? `${leftWidth}%` : undefined }}
            >
              <div className={`min-h-full p-8 max-w-none w-full border rounded-xl shadow-sm ${paneWrap}`}>
                <InputPage />
              </div>
            </div>
          )}

          {/* Resizer — only in split mode */}
          {viewMode === "split" && (
            <div
              className={`w-1.5 cursor-col-resize transition-colors duration-200 flex-shrink-0 ${resizerBg}`}
              onMouseDown={startResize}
            />
          )}

          {/* Right pane — Sheets */}
          {(viewMode === "split" || viewMode === "sheets") && (
            <div className={`h-full overflow-hidden min-h-0 min-w-0 flex-1 ${viewMode === "split" ? "border-l" : ""} ${isLight ? "bg-gray-50 border-gray-200" : "bg-white/0 backdrop-blur-lg border-white/10"}`}>
              <div className={`h-full overflow-hidden p-4 w-full border rounded-xl shadow-sm ${paneBg}`}>
                <SheetsPage />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
