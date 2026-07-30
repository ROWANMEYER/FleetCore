"use client";

import Link from"next/link";
import { usePathname, useRouter, useSearchParams} from"next/navigation";
import InputPage from"./input/page";
import SheetsPage from"./sheets/page";
import { Suspense, useEffect, useState, useRef} from"react";
import EditRouteForm from"@/src/components/operations/daily-planner/EditRouteForm";
import { Id} from"@/convex/_generated/dataModel";
import { X} from"lucide-react";
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
 const searchParams = useSearchParams();
 const router = useRouter();
 const [viewMode, setViewMode] = useState<ViewMode>("split");

 const editRouteId = searchParams.get("editRouteId");
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
}, []);

 const startResize = () => {
 isDraggingRef.current = true;
 document.body.style.cursor ="col-resize";
};

 const closeEditPanel = () => {
 const params = new URLSearchParams(searchParams.toString());
 params.delete("editRouteId");
 router.push(`?${params.toString()}`);
};

 const paneBg ="glass-card-premium";
 const paneWrap ="glass-card";
 const resizerBg ="bg-[var(--card-border)] hover:bg-[#06B6D4]";
 const textBase ="";
 const toggleBg ="glass-card rounded-lg p-0.5 gap-0.5";
 const toggleActive = tokens.toggleActive;
 const toggleInactive = tokens.toggleInactive;

 if (pathname.includes("/edit/")) return <>{children}</>;

 return (
 <div className="h-full min-h-0 flex flex-col relative overflow-hidden">

 {/* Edit slide-over */}
 {editRouteId && (
 <div className="absolute inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
 <div className="w-[600px] h-full shadow-2xl border-l flex flex-col animate-in slide-in-from-right duration-300 bg-[var(--card-bg)] border-[var(--card-border)] ">
 <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
 <h2 className={`text-lg font-semibold ${textBase}`}>Edit Route</h2>
 <button onClick={closeEditPanel} className="text-[var(--nav-text-color)] hover:text-[var(--nav-text-color)] p-1 rounded-full hover:bg-[var(--card-bg)] transition-colors"><X className="w-5 h-5" /></button>
 </div>
 <div className="flex-1 overflow-y-auto scrollbar-hidden p-6">
 <EditRouteForm routeId={editRouteId as Id<"dailyRoutes">} onSuccess={closeEditPanel} onCancel={closeEditPanel} />
 </div>
 </div>
 </div>
)}

 {/* Mobile header */}
 <div className="lg:hidden flex-shrink-0">
 <div className="border-b px-8 pt-6 bg-[var(--card-bg)] border-[var(--card-border)] ">
 <h2 className={`text-lg font-semibold mb-4 ${textBase}`}>Daily Planner</h2>
 <div className="flex gap-6">
 {[
 { href:"/operations/daily-planner/input", label:"Input"},
 { href:"/operations/daily-planner/sheets", label:"Sheets"},
].map(({ href, label}) => (
 <Link key={href} href={href}
 className={`pb-2 text-sm font-medium border-b-2 transition-all ${
 pathname.startsWith(href)
 ?"border-[#06B6D4] text-[var(--foreground)]"
 :"border-transparent text-[var(--nav-text-color)] hover:text-[var(--foreground)] dark:hover:text-white"
}`}
 >
 {label}
 </Link>
))}
 </div>
 </div>
 </div>

 {/* Mobile content */}
 <div className="lg:hidden p-8 flex-1 overflow-y-auto scrollbar-hidden bg-[var(--card-bg)]">
 {children}
 </div>

 {/* Desktop layout */}
 <div className="hidden lg:flex flex-col flex-1 overflow-hidden min-h-0">

 {/* View mode toggle bar */}
 <div className="flex-shrink-0 flex items-center justify-end px-4 py-1.5 border-b gap-2 border-[var(--card-border)] bg-[var(--card-bg)]/60 dark:backdrop-blur-sm">
 <span className="text-xs mr-1 text-[var(--nav-text-color)]">View</span>
 <div className={`flex items-center rounded-lg p-0.5 gap-0.5 ${toggleBg}`}>
 {(["input","split","sheets"] as ViewMode[]).map((mode) => (
 <button
 key={mode}
 onClick={() => setViewMode(mode)}
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
 </div>

 {/* Panes */}
 <div className="flex flex-1 overflow-hidden w-full relative min-h-0">

 {/* Left pane — Input */}
 {(viewMode ==="split" || viewMode ==="input") && (
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
 {viewMode ==="split" && (
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
