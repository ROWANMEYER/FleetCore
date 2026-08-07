"use client";

import { usePathname } from"next/navigation";
import InputPage from"./input/page";
import SheetsPage from"./sheets/page";
import { Suspense, useEffect, useState, useRef} from"react";
import { tokens } from"@/src/lib/design-tokens";

type ViewMode ="split" |"input" |"sheets";

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

function DailyPlannerLayoutInner({ children}: { children: React.ReactNode}) {
 const pathname = usePathname();
 const [viewMode, setViewMode] = useState<ViewMode>("sheets"); // sheets is the default view
 const [viewBarCollapsed, setViewBarCollapsed] = useState(false);
 const [inputCollapsed, setInputCollapsed] = useState(false); // split view: hide the New Route pane into a drawer
 const [leftWidth, setLeftWidth] = useState(65);
 const isDraggingRef = useRef(false);

 // Resizer drag listeners
 useEffect(() => {
 const onMouseMove = (e: MouseEvent) => {
 if (!isDraggingRef.current) return;
 const newLeftWidth = (e.clientX / window.innerWidth) * 100;
 setLeftWidth(Math.min(Math.max(newLeftWidth, 20), 80));
};
 const onMouseUp = () => {
 isDraggingRef.current = false;
 document.body.style.cursor ="default";
};
 window.addEventListener("mousemove", onMouseMove);
 window.addEventListener("mouseup", onMouseUp);
 return () => {
 window.removeEventListener("mousemove", onMouseMove);
 window.removeEventListener("mouseup", onMouseUp);
};
}, []); const startResize = () => {
 isDraggingRef.current = true;
 document.body.style.cursor ="col-resize";
 };

 const paneBg ="glass-card-premium";
 const paneWrap ="glass-card";
 const resizerBg ="bg-[var(--card-border)] hover:bg-[#06B6D4]";
 const toggleBg ="glass-card rounded-lg p-0.5 gap-0.5";
 const toggleActive = tokens.toggleActive;
 const toggleInactive = tokens.toggleInactive;

 if (pathname.includes("/edit/")) return <>{children}</>;

 return (
 <div className="h-full min-h-0 flex flex-col relative overflow-hidden"> {/* Mobile content — the Android app only shows the Input screen here
     (navigation is the bottom tab bar; Sheets/Planner are desktop-only) */}
 <div className="lg:hidden p-4 sm:p-8 flex-1 overflow-y-auto scrollbar-hidden bg-[var(--card-bg)]">
 {children}
 </div>

 {/* Desktop layout */}
 <div className="hidden lg:flex flex-col flex-1 overflow-hidden min-h-0">

 {/* View mode toggle bar — collapsible */}
 <div className="flex-shrink-0 flex items-center justify-end px-3 py-1 border-b gap-2 border-[var(--card-border)] bg-[var(--card-bg)]/60 dark:backdrop-blur-sm">
 {viewBarCollapsed ? (
 <button
 onClick={() => setViewBarCollapsed(false)}
 title="Expand view bar"
 className="flex items-center gap-1.5 py-0.5 rounded-md text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
 >
 <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md ${toggleActive}`}>
 {ViewIcon[viewMode]}
 <span className="capitalize">{viewMode ==="input" ?"New Route" : viewMode ==="split" ?"Split" :"Sheets"}</span>
 </span>
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
 </button>
 ) : (
 <>
 <span className="text-xs mr-1 text-[var(--nav-text-color)]">View</span>
 <div className={`flex items-center rounded-lg p-0.5 gap-0.5 ${toggleBg}`}>
 {(["input","split","sheets"] as ViewMode[]).map((mode) => (
 <button
 key={mode}
 onClick={() => {
 setViewMode(mode);
 if (mode !== "split") setInputCollapsed(false);
 }}
 title={mode ==="input" ?"New Route only" : mode ==="sheets" ?"Sheets only" :"Split view"}
 className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
 viewMode === mode ? toggleActive : toggleInactive
}`}
 >
 {ViewIcon[mode]}
 <span className="capitalize">{mode ==="input" ?"New Route" : mode ==="split" ?"Split" :"Sheets"}</span>
 </button>
 ))}
 </div>
 {viewMode === "split" && (
 <button
 onClick={() => setInputCollapsed((c) => !c)}
 title={inputCollapsed ?"Show New Route form" :"Hide New Route form"}
 className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
 inputCollapsed ? toggleActive : toggleInactive
}`}
 >
 {inputCollapsed ? "Show form" : "Hide form"}
 </button>
 )}
 <button
 onClick={() => setViewBarCollapsed(true)}
 title="Collapse view bar"
 className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
 >
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
 </button>
 </>
 )}
 </div>

 {/* Panes */}
 <div className="flex flex-1 overflow-hidden w-full relative min-h-0"> {/* Collapsed input drawer handle — split view with the form hidden */}
 {viewMode === "split" && inputCollapsed && (
 <div className="flex flex-col items-center justify-start pt-3 w-7 shrink-0 border-r bg-[var(--card-bg)] border-[var(--card-border)]">
 <button
 onClick={() => setInputCollapsed(false)}
 title="Show New Route form"
 className="flex items-center justify-center w-6 h-8 rounded-md text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
 >
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
 </button>
 </div>
 )}

 {/* Left pane — Input */}
 {(viewMode ==="split" || viewMode ==="input") && (viewMode !== "split" || !inputCollapsed) && (
 <div
 className={`h-full overflow-y-auto overscroll-y-contain scrollbar-hidden min-h-0 min-w-0 ${viewMode ==="split" ?"border-r" :""} bg-[var(--card-bg)] border-[var(--card-border)] `}
 style={{ width: viewMode ==="input" ?"100%" : viewMode ==="split" ?`${leftWidth}%` : undefined}}
 >
 <div className={`min-h-full p-8 max-w-none w-full border rounded-xl shadow-sm ${paneWrap}`}>
 <InputPage />
 </div>
 </div>
 )}

 {/* Resizer — only in split mode */}
 {viewMode === "split" && !inputCollapsed && (
 <div
 className={`w-1.5 cursor-col-resize transition-colors duration-200 flex-shrink-0 ${resizerBg}`}
 onMouseDown={startResize}
 />
 )}

 {/* Right pane — Sheets */}
 {(viewMode ==="split" || viewMode ==="sheets") && (
 <div className={`h-full overflow-hidden min-h-0 min-w-0 flex-1 ${viewMode ==="split" ?"border-l" :""} bg-[var(--card-bg)] border-[var(--card-border)] `}>
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

export default function DailyPlannerLayout({ children}: { children: React.ReactNode}) {
 return (
 <Suspense fallback={null}>
 <DailyPlannerLayoutInner>{children}</DailyPlannerLayoutInner>
 </Suspense>
);
}
