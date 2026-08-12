"use client";

import { useState, useEffect, Suspense, useMemo, useRef} from"react";
import { createPortal } from"react-dom";
import { useQuery, useMutation, useAction} from"convex/react";
import { useSearchParams, useRouter} from"next/navigation";
import { api} from"@/convex/_generated/api";
import { Id} from"@/convex/_generated/dataModel";
import { useAuth, useRegionArg} from"@/src/components/auth/AuthProvider";
import { calculateLoadAmount, parseNumberSafe, routeRevenue} from"@/convex/utils";
import { SkeletonLine, SkeletonKpiGrid} from"@/src/components/common/Skeleton";
import { EmptyState} from"@/src/components/common/EmptyState";
import { useToast } from"@/src/components/common/Toast";
import { useEscapeToClose} from"@/src/components/common/useKeyboardShortcut";
import { SheetExportRow} from"@/src/types/sheetExport";
import { exportCSV} from"@/src/lib/exports/exportCSV";
import { exportJSON} from"@/src/lib/exports/exportJSON";
import { exportExcelWithTemplate} from"@/src/lib/exports/exportExcelWithTemplate";
import { exportPDF} from"@/src/lib/exports/exportPDF";
import { generateInvoicePDF} from"@/src/pdf/invoiceTemplate";
import { buildInvoiceData} from"@/src/pdf/invoiceBuilder";
import { InvoiceData} from"@/src/pdf/types"; import InvoiceDeliveryPanel from"@/src/components/operations/invoice/InvoiceDeliveryPanel";
import { registerCaptureEscape} from"@/src/components/operations/invoice/invoiceEscape";
 import ImportLoadsModal from"./ImportLoadsModal";
 import EditRouteForm from"@/src/components/operations/daily-planner/EditRouteForm";
import SpreadsheetDataTable, { type SpreadsheetExtraColumn } from"@/src/components/operations/daily-planner/SpreadsheetDataTable";
import CommitDateInput from"@/src/components/common/CommitDateInput";
import { RegionCell, REGION_META } from"@/src/components/operations/daily-planner/RegionCell";
import MobileSheetsView from"@/src/components/operations/daily-planner/MobileSheetsView";
import { useIsMobile } from"@/src/hooks/useIsMobile";
import { AnalyticsKpiCard } from"@/src/components/common/AnalyticsKpiCard";
import { gradients } from"@/src/lib/design-tokens";

// Offline cache key — last-fetched sheets data for read-only offline viewing
const OFFLINE_CACHE_KEY = "fleetcore-sheets-cache-v1";
// Persisted sheets UI state — density, search, filters, sort, date range, and
// column layout survive page lifecycle. Declared at module scope so every lazy
// state initializer can read it regardless of declaration order (a component-
// local const caused a TDZ ReferenceError in the filters initializer, which
// silently reset all filters on every visit).
const SHEETS_UI_KEY = "fleetcore-sheets-ui-v1";
// Floating restore pill — the user can drag it anywhere on the screen; its
// position survives in localStorage so it stays where they left it (same UX
// as the mobile sheets minimize/restore).
const RESTORE_PILL_POS_KEY = "fleetcore-sheets-restore-pos";
// Approximate pill size used to keep it on-screen after resize; the drag
// handler clamps with the real measured size.
const RESTORE_PILL_EST_SIZE = { w: 120, h: 40 };
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 BarChart,
 Bar,
 LineChart,
 Line,
 PieChart,
 Pie,
 Cell,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
} from"recharts";


// --- Export Utilities ---


function mapSheetsToExportRows(sheets: any[]): SheetExportRow[] {
 return sheets.map((s) => {
 const routeKm = Number(s.kilometers) || 0;
 
 const totalRevenue = routeRevenue(s); // matches the summary sheet & cards
 
 const amount = totalRevenue; // Actual total revenue from all loads
 const ratePerKm = routeKm > 0 ? Number((amount / routeKm).toFixed(2)) : 0;
 
 // Flatten locations
 const allFroms = s.loads?.flatMap((l: any) => l.fromLocations || []) || [];
 const allTos = s.loads?.flatMap((l: any) => l.toLocations || []) || [];
 const uniqueFroms = Array.from(new Set(allFroms)).join(",");
 const uniqueTos = Array.from(new Set(allTos)).join(",");

 // Status: Capitalize or use mapped status
 const statusMap: Record<string, string> = {
"planned":"Planned",
"completed":"Completed",
"locked":"Locked"
};
 const status = statusMap[s.status] || s.status ||"Planned";

 return {
 date: s.routeDate ||"",
 truck: s.truckFleetNo?.toString() ?? s.truckFleetNoStr ??"",
 trailer: s.trailerFleetNo?.toString() ?? s.trailerFleetNoStr ??"",
 driver: s.driverName ||"",
 client: s.client ||"",
 from: uniqueFroms,
 to: uniqueTos,
 routeKm,
 amount,
 ratePerKm,
 status,
};
});
}

function ExportDropdown({
 onExport,
 compact = false,
}: {
 onExport: (type: 'csv' | 'excel' | 'json' | 'pdf') => void;
 compact?: boolean;
}) {
 const [isOpen, setIsOpen] = useState(false);

 return (
 <div className="relative">
 <button
 onClick={() => setIsOpen(!isOpen)}
 title="Export"
 className={compact
 ?"flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--foreground)] shadow-sm transition-all hover:bg-[var(--card-bg)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
 :"flex items-center gap-2 bg-[var(--card-bg)]/60 border border-[var(--card-border)] px-4 py-2 rounded-md text-sm font-medium hover:bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] shadow-sm transition-all"}
 >
 {compact ? (
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
 <path d="M12 3v12"></path>
 <path d="M7 10l5 5 5-5"></path>
 <path d="M5 21h14"></path>
 </svg>
) : (
 <>
 <span>Export</span>
 <span className="text-xs text-[var(--nav-text-color)]">▼</span>
 </>
)}
 </button>

 {isOpen && (
 <>
 <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
 <div className="absolute right-0 mt-2 w-48 bg-[var(--card-bg)] backdrop-blur-lg border border-[var(--card-border)] rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-2">
 <button
 onClick={() => { onExport('excel'); setIsOpen(false);}}
 className="w-full text-left px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--card-bg)]/80 flex items-center gap-2"
 >
 <span className="text-green-600 font-bold">xlsx</span> Excel
 </button>
 <button
 onClick={() => { onExport('csv'); setIsOpen(false);}}
 className="w-full text-left px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--card-bg)]/80 flex items-center gap-2"
 >  <span className="text-blue-600 font-bold">csv</span> CSV
 </button>
 <button
 onClick={() => { onExport('json'); setIsOpen(false);}}
 className="w-full text-left px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--card-bg)]/80 flex items-center gap-2"
 >
 <span className="text-yellow-600 font-bold">json</span> JSON
 </button>
 <button
 onClick={() => { onExport('pdf'); setIsOpen(false);}}
 className="w-full text-left px-4 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--card-bg)]/80 flex items-center gap-2"
 >
 <span className="text-red-600 font-bold">pdf</span> PDF (with KPIs & Charts)
 </button>
 </div>
 </>
)}
 </div>
);
}

// --- End Export Utilities ---

// ── Truck revenue trend chart (shared) ───────────────────────────────────
// Horizontal bar chart of a truck's last N routes with the current route
// highlighted. Used by both the route detail card and the route analytics
// view so the two stay visually identical. Bars are clickable to drill
// into that route's detail (when onBarClick is provided).
function TruckRevenueTrendChart({
 routes,
 chartMax,
 currentRouteId,
 truckFleetNoStr,
 onBarClick,
 legend = (
 <>
 <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#06B6D4] inline-block" /> This route</span>
 <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-cyan-200 inline-block" /> Previous</span>
 </>
 ),
}: {
 routes?: any[];
 chartMax: number;
 currentRouteId: string;
 truckFleetNoStr: string;
 onBarClick?: (route: any) => void;
 legend?: React.ReactNode;
}) {
 return (
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
 <div className="flex items-center justify-between mb-3">
 <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]">Revenue · Last {routes?.length ?? 0} Routes</p>
 <span className="text-[10px] font-bold text-[#06B6D4] bg-[rgba(6,182,212,0.08)] px-2 py-0.5 rounded-full">Truck {truckFleetNoStr}</span>
 </div>
 {!routes ? (
 <p className="text-xs text-[var(--nav-text-color)] text-center py-4">Loading…</p>
 ) : (
 <div className="flex items-end gap-1 h-24">
 {routes.map((r: any, i: number) => {
 const rev = Number(r.rate) || 0;
 const pct = (rev / chartMax) * 100;
 const isThis = r._id === currentRouteId;
 return (
 <div key={i} className="flex-1 flex flex-col items-center gap-1">
 <div className="w-full flex items-end cursor-pointer group" style={{ height: "72px" }} onClick={() => onBarClick?.(r)} title="Click to view route details">
 <div
 className={`w-full rounded-t transition-all ${isThis ? "bg-[#06B6D4]" : "bg-cyan-200 group-hover:bg-cyan-400"}`}
 style={{ height: `${Math.max(pct, 4)}%` }}
 />
 </div>
 <span className="text-[8px] text-[var(--nav-text-color)] truncate w-full text-center">
 {r.routeDate?.slice(5)}
 </span>
 </div>
 );
 })}
 </div>
 )}
 <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--nav-text-color)]">
 {legend}
 </div>
 </div>
 );
}

// ZAR + unit helpers (module scope so both the sheets table and the route
// detail/analytics components share them).
const formatZAR = (value: number) => {
// [HYDRATION SAFE] Use deterministic formatting
const parts = value.toFixed(2).split(".");
const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,"");
return`R ${integerPart},${parts[1]}`;
};

const unitMap: Record<string, string> = {
tons:"t",
pallets:"pallets",
bales:"bales",
bags:"bags",
};

// Month label for the ‹ › month stepper (same style as the dashboard filter).
const monthLabel = (ym: string) => {
 const d = new Date(ym +"-01");
 return d.toLocaleDateString("en-ZA", { month:"long", year:"numeric"});
};

// ── Region column for the spreadsheet table ────────────────────────────────
// Inline region dropdown (admins only) — the same control as the All Regions
// table; regional users see the badge read-only (region reassignment is an
// admin-only server-side operation).
const sheetsRegionColumn: SpreadsheetExtraColumn = {
 key:"region",
 label:"Region",
 defaultWidth: 140,
 minWidth: 112,
 render: (row) => <RegionCell row={row} />,
};

// ── Route Analytics view ──────────────────────────────────────────────
// Route-scoped analytics, mirroring the dashboard's Analytics Dashboard:
 // KPI cards with progress bars, revenue trend for the truck's last 7
 // routes, and a per-client revenue breakdown. Opened from the ANALYTICS
 // button on the route detail card (desktop + mobile).
function RouteAnalyticsView({ route, onBarClick }: { route: any; onBarClick: (route: any) => void }) {
 const { token } = useAuth();
 const region = useRegionArg();
 const routeKm = Number(route.kilometers) || 0;
 const loads = route.loads ?? [];
 const totalRevenue = loads.reduce((sum: number, l: any) => {
 const qty = parseNumberSafe(l.quantity);
 const rate = parseNumberSafe(l.rate);
 return sum + calculateLoadAmount(qty, rate, l.rateType ||"per_unit");
}, 0);
 const rPerKm = routeKm > 0 ? totalRevenue / routeKm : 0;
 const totalQty = loads.reduce((sum: number, l: any) => sum + parseNumberSafe(l.quantity), 0);
 const qtyUnit = loads[0]?.quantityType ||"t";

 // Truck revenue trend (same query as the detail card)
 const recentRoutes = useQuery(api.dailyRoutes.getRecentRoutesByTruck, {
 truckFleetNoStr: route.truckFleetNoStr ??"",
 limit: 7,
 token,
 region,
});
 const chartMax = recentRoutes ? Math.max(...recentRoutes.map((r: any) => Number(r.rate) || 0), 1) : 1;

 // Per-client revenue breakdown from this route's loads (inline — tiny
 // per-load computation; useMemo here trips the React Compiler's
 // "existing memoization could not be preserved" on the fresh loads array)
 const clientBreakdown = (() => {
 const map = new Map<string, number>();
 for (const l of loads) {
 const qty = parseNumberSafe(l.quantity);
 const rate = parseNumberSafe(l.rate);
 const amt = calculateLoadAmount(qty, rate, l.rateType ||"per_unit");
 const key = l.client ||"Unknown";
 map.set(key, (map.get(key) || 0) + amt);
}
 return [...map.entries()]
 .map(([name, value]) => ({ name, value }))
 .sort((a, b) => b.value - a.value);
})();
 const maxClientValue = Math.max(...clientBreakdown.map((c) => c.value), 1);

 return (
 <div className="p-4 space-y-4 sm:p-5 sm:space-y-5 text-[var(--foreground)]">
 {/* ── Breadcrumb + status ── */}
 <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-[var(--nav-text-color)] font-medium uppercase tracking-wider">
 <span>Fleet › Routes › Truck {route.truckFleetNoStr} · {route.routeDate}</span>
 <span className="px-3 py-1 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] text-[10px] font-bold">
 {(route.status ||"planned").toUpperCase()}
 </span>
 </div>

 {/* ── KPI cards with progress bars (mirrors dashboard analytics) ── */}
 <div className="grid grid-cols-2 gap-2.5">
 <AnalyticsKpiCard
 label="Revenue"
 badge="Total"
 value={formatZAR(totalRevenue)}
 valueClass="text-xl font-black text-emerald-400"
 barPercent={(totalRevenue / Math.max(chartMax, 1)) * 100}
 />
 <AnalyticsKpiCard
 label="Distance"
 badge="Coverage"
 badgeClass="text-cyan-400"
 value={`${routeKm.toLocaleString()} km`}
 valueClass="text-xl font-black text-cyan-400"
 barClass="bg-cyan-500"
 barPercent={(routeKm / 5000) * 100}
 />
 <AnalyticsKpiCard
 label="Revenue/KM"
 badge="Efficiency"
 badgeClass="text-purple-400"
 value={formatZAR(rPerKm)}
 valueClass="text-xl font-black text-purple-400"
 barClass="bg-purple-500"
 barPercent={(rPerKm / 50) * 100}
 />
 <AnalyticsKpiCard
 label="Load Weight"
 badge={qtyUnit}
 badgeClass="text-orange-400"
 value={totalQty.toLocaleString()}
 valueClass="text-xl font-black text-orange-400"
 barClass="bg-orange-500"
 barPercent={(totalQty / 34) * 100}
 />
 </div>

 {/* ── Revenue trend (last 7 routes, this truck) ── */}
 <TruckRevenueTrendChart
 routes={recentRoutes}
 chartMax={chartMax}
 currentRouteId={route._id}
 truckFleetNoStr={route.truckFleetNoStr}
 onBarClick={onBarClick}
 />

 {/* ── Client revenue breakdown ── */}
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
 <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)] mb-3">Revenue by Client</p>
 {clientBreakdown.length === 0 ? (
 <p className="text-xs text-[var(--nav-text-color)] text-center py-4 italic">No loads</p>
) : (
 <div className="space-y-3">
 {clientBreakdown.map((c) => (
 <div key={c.name}>
 <div className="flex items-center justify-between text-xs mb-1">
 <span className="font-semibold truncate">{c.name}</span>
 <span className="font-black text-[#06B6D4]">{formatZAR(c.value)}</span>
 </div>
 <div className="w-full bg-[var(--card-border)] rounded-full h-1.5">
 <div className="bg-gradient-to-r from-[#06B6D4] to-[#0891B2] h-1.5 rounded-full" style={{ width:`${(c.value / maxClientValue) * 100}%` }} />
 </div>
 </div>
))}
 </div>
)}
 </div>   </div>
 );
}


// ── Aggregate route summary (mobile) ─────────────────────────────────────
// Summarizes the routes currently visible on the mobile sheets screen:
// aggregate KPI cards, per-route revenue bars (tap to drill into a route)
// and a status mix. Opened from the graph icon on the restore pill, which
// is always available once the screen is minimized.
const SUMMARY_LEVEL_CLS: Record<string, string> = {
 red: "bg-red-50 text-red-700 border-red-200",
 yellow: "bg-amber-50 text-amber-700 border-amber-200",
 green: "bg-emerald-50 text-emerald-700 border-emerald-200",
 blue: "bg-blue-50 text-blue-700 border-blue-200",
};

function RoutesSummaryView({
 routes,
 riskStatusOf,
}: {
 routes: any[];
 riskStatusOf: (route: any) => { label: string; level: "red" | "yellow" | "green" | "blue" };
}) {
 const totalRevenue = routes.reduce((s: number, r: any) => s + routeRevenue(r), 0);
 const totalKm = routes.reduce((s: number, r: any) => s + (Number(r.kilometers) || 0), 0);
 const rPerKm = totalKm > 0 ? totalRevenue / totalKm : 0;
 const statusCounts = new Map<string, { count: number; level: "red" | "yellow" | "green" | "blue" }>();
 for (const r of routes) {
 const { label, level } = riskStatusOf(r);
 const cur = statusCounts.get(label);
 statusCounts.set(label, { count: (cur?.count ?? 0) + 1, level });
}

 if (routes.length === 0) {
 return (
 <div className="p-8 text-center">
 <p className="text-sm font-semibold text-[var(--foreground)]">No routes to summarize</p>
 <p className="text-xs text-[var(--nav-text-color)] mt-1">
 There are no routes visible for the current filters and date.
 </p>
 </div>
 );
}

 return (
 <div className="p-4 space-y-4 text-[var(--foreground)]">
 {/* ── Aggregate KPI cards ── */}
 <div className="grid grid-cols-2 gap-2.5">
 {[
 { label: "ROUTES", value: String(routes.length), sub: "Visible", accent: "border-l-cyan-500" },
 { label: "TOTAL REVENUE", value: formatZAR(totalRevenue), sub: "All loads", accent: "border-l-emerald-500" },
 { label: "DISTANCE", value: `${totalKm.toLocaleString()} km`, sub: "Combined", accent: "border-l-green-500" },
 { label: "REVENUE / KM", value: formatZAR(rPerKm), sub: rPerKm > 0 ? "Fleet average" : "—", accent: "border-l-purple-500" },
 ].map((k) => (
 <div key={k.label} className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 border-l-4 ${k.accent}`}>
 <p className="text-[10px] font-semibold text-[var(--nav-text-color)] uppercase tracking-wider">{k.label}</p>
 <p className="text-lg font-black mt-1 truncate">{k.value}</p>
 {k.sub && <p className="text-[10px] text-[var(--nav-text-color)] mt-0.5 truncate">{k.sub}</p>}
 </div>
 ))}
 </div>

 {/* ── Status mix ── */}
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
 <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)] mb-3">Status Mix</p>
 <div className="flex flex-wrap gap-1.5">
 {[...statusCounts.entries()].map(([label, { count, level }]) => (
 <span
 key={label}
 className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${SUMMARY_LEVEL_CLS[level] ?? "bg-[var(--card-bg)] text-[var(--nav-text-color)] border-[var(--card-border)]"}`}
 >
 {label}
 <span className="font-black">{count}</span>
 </span>
 ))}
 </div>
 </div>
 </div>
 );
}

// ── Email Route Summary modal ────────────────────────────────────────────
// Themed recipient picker for emailing the routes currently visible on the
// mobile summary sheet (HTML transport report in the body, like QuickSend).
function SendSummaryEmailModal({
 isOpen,
 onClose,
 initialSubject,
 onSend,
}: {
 isOpen: boolean;
 onClose: () => void;
 initialSubject: string;
 onSend: (recipientIds: Id<"recipients">[], subject: string) => Promise<void>;
}) {
 const recipients = useQuery(api.recipients.list);
 const [selectedIds, setSelectedIds] = useState<Id<"recipients">[]>([]);
 const [subject, setSubject] = useState(initialSubject);
 const [isSending, setIsSending] = useState(false);
 const { addToast } = useToast();

 // Escape closes this modal first (capture phase + stopImmediatePropagation),
 // so it wins over the summary sheet's own bubble-phase Escape handler.
 useEffect(() => registerCaptureEscape(document, onClose), [onClose]);

 useEffect(() => {
 if (isOpen) {
 setSubject(initialSubject);
 setSelectedIds([]);
 }
 }, [isOpen, initialSubject]);

 const toggleRecipient = (id: Id<"recipients">) => {
 setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (selectedIds.length === 0) { addToast("Please select at least one recipient.", "error"); return; }
 setIsSending(true);
 try {
 await onSend(selectedIds, subject);
 } catch { /* parent handles toasts */ }
 finally {
 setIsSending(false);
 }
 };

 if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
 <div
 className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
 onClick={onClose}
 />
 <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto bg-[var(--background)] border border-[var(--card-border)] rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
 <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
 <div className="min-w-0">
 <h3 className="text-base font-black tracking-tight text-[var(--foreground)]">Email Route Summary</h3>
 <p className="text-[11px] text-[var(--nav-text-color)] mt-0.5">Sends the visible routes as an HTML report</p>
 </div>
 <button
 onClick={onClose}
 aria-label="Close email modal"
 className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
 >
 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
 <path d="M18 6 6 18" />
 <path d="m6 6 12 12" />
 </svg>
 </button>
 </div>

 <form onSubmit={handleSubmit} className="p-5 space-y-4">
 <div>
 <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--nav-text-color)] mb-2">Recipients</label>
 <div className="border border-[var(--card-border)] rounded-lg max-h-44 overflow-y-auto divide-y divide-[var(--card-border)]">
 {!recipients ? (
 <div className="p-3 text-sm text-[var(--nav-text-color)]">Loading recipients…</div>
 ) : recipients.length === 0 ? (
 <div className="p-3 text-sm text-[var(--nav-text-color)]">No recipients found.</div>
 ) : (
 recipients.map(r => (
 <label key={r._id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--card-bg)]">
 <input
 type="checkbox"
 checked={selectedIds.includes(r._id)}
 onChange={() => toggleRecipient(r._id)}
 className="h-4 w-4 rounded accent-[#06B6D4]"
 />
 <div className="min-w-0">
 <p className="text-sm font-medium text-[var(--foreground)]">{r.name}</p>
 <p className="text-xs text-[var(--nav-text-color)] truncate">{r.email}</p>
 </div>
 </label>
 ))
 )}
 </div>
 </div>

 <div>
 <label htmlFor="summary-subject" className="block text-[11px] font-bold uppercase tracking-wider text-[var(--nav-text-color)] mb-2">Subject</label>
 <input
 id="summary-subject"
 type="text"
 required
 value={subject}
 onChange={(e) => setSubject(e.target.value)}
 className="w-full border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] rounded-lg px-3 py-2.5 text-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none"
 />
 </div>

 <div className="flex justify-end gap-2 pt-4 border-t border-[var(--card-border)]">
 <button
 type="button"
 onClick={onClose}
 className="px-4 py-2.5 text-sm font-bold border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-bg)] text-[var(--foreground)]"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSending || selectedIds.length === 0}
 className="px-4 py-2.5 text-sm font-bold bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
 >
 {isSending ? "Sending…" : "Send Report"}
 </button>
 </div>
 </form>
 </div>
 </div>
 );
}

function RouteDetailsCard({
 route,
 isLocked,
 mode ="primary",
 onDrillDown,
 onAnalytics,
 actionLoading,
 onStatusChange,
 onDelete,
 onEdit
}: {
 route: any;
 isLocked: boolean;
 mode?:"primary" |"secondary";
 onDrillDown?: (route: any) => void;
 onAnalytics?: () => void;
 actionLoading: string | null;
 onStatusChange: (routeId: Id<"dailyRoutes">, action:"complete" |"lock" |"unlock") => void;
 onDelete: (routeId: Id<"dailyRoutes">) => void;
 onEdit: () => void;
}) {
 const status = route.status ||"planned";
 const { token } = useAuth();
 const region = useRegionArg();
 const { addToast } = useToast();
 const trucks = useQuery(api.fleet.getTrucks, {});
 const trailers = useQuery(api.fleet.getTrailers, {});
 const customers = useQuery(api.customers.list, {});
 const appSettings = useQuery(api.settings.getAppSettings);
 const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
 const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
 const [currentPdfBlob, setCurrentPdfBlob] = useState<Blob | null>(null);
 const [currentInvoiceData, setCurrentInvoiceData] = useState<InvoiceData | null>(null);

 // Resolve assets
 const truck = trucks?.find(t => t.truckFleetNo === route.truckFleetNoStr);
 const truckReg = truck?.registration ||"";
 const trailer = trailers?.find(t =>
 String(t.trailerFleetNo) === route.trailerFleetNoStr || t.trailerFleetNoStr === route.trailerFleetNoStr
);
 const trailerType = trailer?.type ||"";
 const trailerLength = (trailer as any)?.trailers?.[0]?.length || (trailer as any)?.length ||"";

 // Derived metrics
 const routeKm = Number(route.kilometers) || 0;
 const totalRevenue = (route.loads ?? []).reduce((sum: number, l: any) => {
 const qty = parseNumberSafe(l.quantity);
 const rate = parseNumberSafe(l.rate);
 return sum + calculateLoadAmount(qty, rate, l.rateType ||"per_unit");
}, 0);
 const rPerKm = routeKm > 0 ? totalRevenue / routeKm : 0;
 const totalQty = (route.loads ?? []).reduce((sum: number, l: any) => sum + parseNumberSafe(l.quantity), 0);
 const qtyUnit = route.loads?.[0]?.quantityType ||"t";
 const maxCapacity = qtyUnit ==="bales" ? 490 : 34; // 490 bales or 34 tons
 const capacityLabel = qtyUnit ==="bales" ?"bales" :"T";
 const allFroms = [...new Set((route.loads ?? []).flatMap((l: any) => l.fromLocations ?? []))];
 const allTos = [...new Set((route.loads ?? []).flatMap((l: any) => l.toLocations ?? []))];

 // Last 7 routes for this truck (revenue chart)
 const recentRoutes = useQuery(api.dailyRoutes.getRecentRoutesByTruck, {
 truckFleetNoStr: route.truckFleetNoStr ??"",
 limit: 7,
 token,
 region,
});
 const chartMax = recentRoutes ? Math.max(...recentRoutes.map((r: any) => Number(r.rate) || 0), 1) : 1;
 const avgRevenue = recentRoutes && recentRoutes.length > 0
 ? recentRoutes.reduce((s: number, r: any) => s + (Number(r.rate) || 0), 0) / recentRoutes.length
 : 0;

 // Invoice helpers
 const serializeInvoiceData = (data: any) => ({ ...data, date: data.date instanceof Date ? data.date.toISOString() : data.date});
 const deserializeInvoiceData = (data: any) => ({ ...data, date: new Date(data.date)});
 const saveInvoice = useMutation(api.invoices.getOrCreate);

 const handleGenerateProforma = async () => {
 const errors: string[] = [];
 if (!route.client) errors.push("Client");
 if (!route.rate || Number(route.rate) <= 0) errors.push("Rate");
 const hasFrom = route.loads?.some((l: any) => l.fromLocations?.length > 0) || route.fromLocation;
 const hasTo = route.loads?.some((l: any) => l.toLocations?.length > 0) || route.toLocations?.length > 0;
 if (!hasFrom) errors.push("From location");
 if (!hasTo) errors.push("To location");
 if (!route.driverName) errors.push("Driver");
 if (!route.truckFleetNoStr) errors.push("Truck");
 if (errors.length > 0) { addToast(`Cannot generate invoice. Missing: ${errors.join(", ")}`, "error"); return;}
 setIsGeneratingInvoice(true);
 try {
 const settings = appSettings as any;
 const companySettings = settings ? {
 companyName: settings.companyName,
 companyPobox: settings.companyPobox,
 companyCity: settings.companyCity,
 companyPostal: settings.companyPostal,
 companyPhone: settings.companyPhone,
 companyFax: settings.companyFax,
 vatNumber: settings.vatNumber,
 defaultVatRate: settings.defaultVatRate,
 bankName: settings.bankName,
 accountNumber: settings.accountNumber,
 branchCode: settings.branchCode,
} : undefined;
 const finalSnapshot = await saveInvoice({ routeId: route._id, invoiceData: serializeInvoiceData(buildInvoiceData(route, customers, companySettings))});
 const finalData = deserializeInvoiceData(finalSnapshot);
 const doc = generateInvoicePDF(finalData);
 setCurrentInvoiceData(finalData);
 setCurrentPdfBlob(doc.output("blob"));
 setIsInvoiceModalOpen(true);
} catch { addToast("Failed to generate invoice.", "error");}
 finally {
 setIsGeneratingInvoice(false);
}
};

 const statusColour = status ==="locked" ?"bg-[var(--card-bg)] text-[var(--foreground)] border-[var(--card-border)]"
 : status ==="completed" ?"bg-green-50 text-green-700 border-green-300"
 :"bg-blue-50 text-blue-700 border-blue-300";
 const statusLabel = status ==="locked" ?"● LOCKED" : status ==="completed" ?"● COMPLETED" :"● PLANNED";

 return (
 <div className="p-4 space-y-4 sm:p-5 sm:space-y-5 text-[var(--foreground)]">

 {/* ── Breadcrumb + status ── */}
 <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-[var(--nav-text-color)] font-medium uppercase tracking-wider">
 <span>Fleet › Routes › Truck {route.truckFleetNoStr} · {route.routeDate}</span>
 <span className={`px-3 py-1 rounded-full border text-[10px] font-bold ${statusColour}`}>{statusLabel}</span>
 </div>

 {/* ── Title + actions ── */}
 <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
 <div className="min-w-0">
 <h1 className="text-2xl font-black tracking-tight">
 Truck {route.truckFleetNoStr}
 <span className="text-[var(--nav-text-color)] font-light ml-2">/ Route Detail</span>
 </h1>
 <p className="text-xs text-[var(--nav-text-color)] mt-1 truncate">
 {[truckReg, trailerType, trailerLength ?`${trailerLength}m` :"", route.routeDate, route.client].filter(Boolean).join(" ·")}
 </p>
 </div>
 <div className="flex flex-col gap-2 sm:items-end sm:shrink-0">
 {mode ==="primary" && (
 <button onClick={onAnalytics}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold border border-[#06B6D4]/40 text-[#06B6D4] rounded-lg hover:bg-[rgba(6,182,212,0.08)] transition-colors">
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
 </svg>
 ANALYTICS
 </button>
 )}
 {!isLocked && mode ==="primary" && (
 <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:shrink-0">
 {status ==="completed" && (
 <button onClick={() => onStatusChange(route._id,"lock")}
 className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-bg)]">
 LOCK ROUTE
 </button>
)}
 {status ==="planned" && (
 <button onClick={() => onStatusChange(route._id,"complete")}
 className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-bg)]">
 COMPLETE
 </button>
)}
 <button onClick={() => onEdit()}
 className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-bg)]">
 EDIT
 </button>
 <button onClick={() => onDelete(route._id)} disabled={actionLoading === route._id}
 className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
 DELETE
 </button>
 </div>
 )}
 {isLocked && (
 <button onClick={() => onStatusChange(route._id,"unlock")}
 className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-bg)] sm:shrink-0">
 UNLOCK
 </button>
 )}
 </div>
 </div>

 {/* ── KPI strip ── */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 {[  { label:"TOTAL REVENUE", value: formatZAR(totalRevenue), sub: null, accent:"border-l-cyan-500"},
 { label:"DISTANCE", value:`${routeKm} km`, sub: allFroms[0] && allTos[0] ?`${allFroms[0]} → ${allTos[0]}` : null, accent:"border-l-green-500"},
 { label:"LOAD WEIGHT", value:`${totalQty} ${unitMap[qtyUnit] || qtyUnit}`, sub: route.loads?.[0]?.rateType ==="flat" ?"Flat rate" : null, accent:"border-l-orange-400"},
 { label:"R / KM", value:`R ${rPerKm.toFixed(2)}`, sub: rPerKm >= 30 ?"Efficient" : rPerKm > 0 ?"Below avg" :"—", accent:"border-l-purple-500"},
].map((k) => (
 <div key={k.label} className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 border-l-4 ${k.accent}`}>
 <p className="text-[10px] font-semibold text-[var(--nav-text-color)] uppercase tracking-wider">{k.label}</p>
 <p className="text-lg font-black mt-1">{k.value}</p>
 {k.sub && <p className="text-[10px] text-[var(--nav-text-color)] mt-0.5 truncate">{k.sub}</p>}
 </div>
))}
 </div>

 {/* ── Revenue chart + Load gauge ── */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {/* Revenue last 7 routes */}
 <TruckRevenueTrendChart
 routes={recentRoutes}
 chartMax={chartMax}
 currentRouteId={route._id}
 truckFleetNoStr={route.truckFleetNoStr}
 onBarClick={onDrillDown}
 legend={
 <>
 <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#06B6D4] inline-block" /> Revenue (R)</span>
 <span className="flex items-center gap-1"><span className="w-3 h-1 bg-yellow-400 inline-block" /> Avg {formatZAR(avgRevenue)}</span>
 </>
 }
 />

 {/* Load vs capacity gauge */}
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
 <div className="flex items-center justify-between w-full mb-3">
 <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]">Load vs Capacity</p>
 <span className="text-[10px] font-bold text-[var(--nav-text-color)]">{totalQty} {capacityLabel} / {maxCapacity} {capacityLabel}</span>
 </div>
 {/* Gauge + readout — side-by-side on phones, stacked on desktop */}
 <div className="flex flex-row sm:flex-col items-center justify-center gap-4 sm:gap-0">
 <div className="relative w-28 h-14 overflow-hidden shrink-0">
 <div className="absolute inset-0 rounded-t-full border-8 border-[var(--card-border)]" style={{ borderBottomColor:"transparent"}} />
 <div
 className="absolute inset-0 rounded-t-full border-8 border-[#06B6D4] transition-all"
 style={{
 borderBottomColor:"transparent",
 clipPath:`inset(0 ${100 - Math.min((totalQty / maxCapacity) * 100, 100)}% 0 0)`,
 }}
 />
 </div>
 <div className="sm:text-center">
 <p className="text-2xl font-black text-[#06B6D4] sm:mt-1">{Math.round((totalQty / maxCapacity) * 100)}%</p>
 <p className="text-[10px] text-[var(--nav-text-color)] mt-0.5">
 {totalQty >= maxCapacity ?"Full load · optimal utilisation" :`${(maxCapacity - totalQty).toFixed(1)} ${capacityLabel} remaining capacity`}
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* ── Route profile ── */}
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
 <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)] mb-3">Route Profile</p>

 {/* Journey line */}
 <div className="relative mb-1">
 <div className="h-1.5 bg-[var(--card-bg)] rounded-full">            <div className="h-1.5 bg-[#06B6D4] rounded-full w-full" />
 </div>            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#06B6D4] border-2 border-white shadow" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#06B6D4] border-2 border-white shadow" />
 </div>
 <div className="flex justify-between text-xs font-semibold text-[var(--foreground)] mb-1">
 <span>{allFroms.join(",") ||"—"}</span>
 <span>{allTos.join(",") ||"—"}</span>
 </div>
 {routeKm > 0 && <p className="text-center text-[10px] text-[var(--nav-text-color)] mb-3">{routeKm} km total</p>}

 {/* Loads table */}
 <div className="border border-[var(--card-border)] rounded-lg overflow-hidden">
 <div className="hidden sm:grid sm:grid-cols-12 gap-1 px-3 py-2 bg-[var(--card-bg)] text-[10px] font-bold text-[var(--nav-text-color)] uppercase tracking-wider">
 <div className="col-span-1">#</div>
 <div className="col-span-3">Client</div>
 <div className="col-span-2">From</div>
 <div className="col-span-2">To</div>
 <div className="col-span-1 text-right">Qty</div>
 <div className="col-span-1 text-right">Rate</div>
 <div className="col-span-2 text-right">Amount</div>
 </div>
 {(route.loads ?? []).length === 0 ? (
 <p className="text-center text-xs text-[var(--nav-text-color)] py-4 italic">No loads</p>
) : (
 <>
 {(route.loads ?? []).map((load: any, i: number) => {
 const qty = parseNumberSafe(load.quantity);
 const rate = parseNumberSafe(load.rate);
 const amount = calculateLoadAmount(qty, rate, load.rateType ||"per_unit");
 const unit = unitMap[load.quantityType] || load.quantityType ||"t";
 return (
 <div key={i}>
 {/* Desktop grid row */}
 <div className="hidden sm:grid sm:grid-cols-12 gap-1 px-3 py-2.5 text-xs border-t border-[var(--card-border)] hover:bg-[var(--card-bg)]">
 <div className="col-span-1 text-[var(--nav-text-color)] font-mono">{String(i + 1).padStart(2,"0")}</div>
 <div className="col-span-3 font-semibold truncate">{load.client}</div>
 <div className="col-span-2 text-[var(--nav-text-color)] truncate">{(load.fromLocations ?? []).join(",")}</div>
 <div className="col-span-2 text-[var(--nav-text-color)] truncate">{(load.toLocations ?? []).join(",")}</div>
 <div className="col-span-1 text-right">{qty} {unit}</div>
 <div className="col-span-1 text-right text-[var(--nav-text-color)]">{load.rateType ==="flat" ?"Flat" : formatZAR(rate)}</div>
 <div className="col-span-2 text-right font-bold text-[#06B6D4]">{formatZAR(amount)}</div>
 </div>
 {/* Mobile stacked row */}
 <div className="sm:hidden px-3 py-3 border-t border-[var(--card-border)] flex items-start justify-between gap-3">
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="text-[10px] font-mono text-[var(--nav-text-color)] shrink-0">{String(i + 1).padStart(2,"0")}</span>
 <span className="text-xs font-semibold truncate">{load.client || "—"}</span>
 </div>
 <div className="text-[11px] text-[var(--nav-text-color)] mt-0.5 truncate">
 {(load.fromLocations ?? []).join(", ") || "—"} → {(load.toLocations ?? []).join(", ") || "—"}
 </div>
 </div>
 <div className="text-right shrink-0">
 <div className="text-xs font-black text-[#06B6D4]">{formatZAR(amount)}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] mt-0.5">{qty} {unit} · {load.rateType === "flat" ? "Flat" : formatZAR(rate)}</div>
 </div>
 </div>
 </div>
);
})}
 </>
)}
 </div>
 </div>

 {/* ── Invoice + Asset card ── */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 {/* Invoice */}
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 flex items-center justify-between gap-3">
 <div className="min-w-0">
 <p className="text-sm font-bold mb-1">Invoice ready</p>
 <p className="text-[10px] text-[var(--nav-text-color)] truncate">{route.client ||"—"}</p>
 </div>
 <button onClick={handleGenerateProforma} disabled={isGeneratingInvoice || !appSettings || !customers}
 className="shrink-0 px-4 py-2 text-xs font-bold border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-bg)] disabled:opacity-50">
 {isGeneratingInvoice ? "Generating…" : !appSettings || !customers ? "Loading…" : "PDF"}
 </button>
 </div>

 {/* Asset card */}
 <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
 <div className="flex items-center gap-3 mb-3">  <div className="w-8 h-8 bg-[rgba(6,182,212,0.08)] rounded-lg flex items-center justify-center text-[#06B6D4] text-lg">🚛</div>
 <div>
 <p className="text-sm font-bold">{truckReg || route.truckFleetNoStr}</p>
 <p className="text-[10px] text-[var(--nav-text-color)] truncate">{[trailerType, trailerLength ?`${trailerLength} metre` :"",`Truck ${route.truckFleetNoStr}`].filter(Boolean).join(" ·")}</p>
 </div>
 </div>
 <div className="grid grid-cols-3 gap-2 text-center">
 <div>
 <p className="text-[10px] text-[var(--nav-text-color)] uppercase">Routes (30D)</p>
 <p className="text-base font-black">{recentRoutes?.length ??"—"}</p>
 </div>
 <div>
 <p className="text-[10px] text-[var(--nav-text-color)] uppercase">Total KM</p>
 <p className="text-base font-black">{recentRoutes ? recentRoutes.reduce((s: number, r: any) => s + (Number(r.kilometers) || 0), 0).toLocaleString() :"—"}</p>
 </div>
 <div>
 <p className="text-[10px] text-[var(--nav-text-color)] uppercase">Utilisation</p>
 <p className="text-base font-black">{Math.round((totalQty / maxCapacity) * 100)}%</p>
 </div>
 </div>
 </div>
 </div>

 {route.notes && (
 <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
 <span className="font-bold">Notes: </span>{route.notes}
 </div>
)}

 {isInvoiceModalOpen && currentInvoiceData && currentPdfBlob && (
 <InvoiceDeliveryPanel
 invoiceData={currentInvoiceData}
 pdfBlob={currentPdfBlob}
 onClose={() => setIsInvoiceModalOpen(false)}
 />
)}   </div>
 );
}



type TableColumnKey =
 |"select"
 |"expand"
 |"date"
 |"truck"
 |"trailer"
 |"client"
 |"driver"
 |"from"
 |"to"
 |"notes"
 |"amount"
 |"rkm"
 |"status";

type ResizableTableColumnKey = Exclude<TableColumnKey,"select" |"expand">;

const TABLE_WIDTHS_STORAGE_KEY ="dailyPlannerSheets.tableColumnWidths";
const TABLE_VISIBILITY_STORAGE_KEY ="dailyPlannerSheets.tableColumnVisibility";

const TABLE_COLUMN_LABELS: Record<ResizableTableColumnKey, string> = {
 date:"Date",
 truck:"Truck",
 trailer:"Trailer",
 client:"Client",
 driver:"Driver",
 from:"From",
 to:"To",
 notes:"Notes",
 amount:"Amount",
 rkm:"R / KM",
 status:"Status",
};

const DEFAULT_TABLE_COLUMN_WIDTHS: Record<TableColumnKey, number> = {
 select: 42,
 expand: 34,
 date: 96,
 truck: 92,
 trailer: 92,
 client: 122,
 driver: 170,
 from: 170,
 to: 170,
 notes: 170,
 amount: 120,
 rkm: 94,
 status: 112,
};

const MIN_TABLE_COLUMN_WIDTHS: Record<ResizableTableColumnKey, number> = {
 date: 82,
 truck: 72,
 trailer: 72,
 client: 96,
 driver: 120,
 from: 120,
 to: 120,
 notes: 120,
 amount: 96,
 rkm: 84,
 status: 100,
};

const DEFAULT_TABLE_COLUMN_VISIBILITY: Record<ResizableTableColumnKey, boolean> = {
 date: true,
 truck: true,
 trailer: true,
 client: true,
 driver: true,
 from: true,
 to: true,
 notes: true,
 amount: true,
 rkm: true,
 status: true,
};

// Columns the sort logic in getFilteredAndSortedRoutes actually knows how to sort.
const SORTABLE_COLUMNS = ["date", "truck", "trailer", "client", "driver", "from", "to", "amount", "status"];

export default function DailyPlannerSheetsPage({ mode ="primary"}: { mode?:"primary" |"secondary"}) {
 return (
 <Suspense fallback={null}>
 <DailyPlannerSheetsContent mode={mode} />
 </Suspense>
);
}

function DailyPlannerSheetsContent({ mode ="primary"}: { mode?:"primary" |"secondary"}) {
 const { token } = useAuth();
 const region = useRegionArg();
 // TRAE-FIX: Hydration Mismatch Fix
 // 1. Track mount state (client-only enhancement)
 const [isMounted, setIsMounted] = useState(false);
 const [isImportModalOpen, setIsImportModalOpen] = useState(false);
 const [isHeaderCompact, setIsHeaderCompact] = useState(true); // auto-collapse the header (date selector + KPI/chart sections) into a slim bar
 const [summaryCollapsed, setSummaryCollapsed] = useState(false); // independently collapse the KPI/chart summary above the table
 useEffect(() => {
 setIsMounted(true);
}, []);
 // Mobile viewport detection (matches AppShell's 767px mobile breakpoint) —
 // phones get the purpose-built mobile Sheets screen instead of the desktop grid.
 const isMobile = useIsMobile();

 // TRAE-FIX: Remove conditional layout logic
 //"mode" is used for logic, but we must NOT change the grid structure based on it during render.
 // We force a 17-column layout always.

 // 3. Confirmation Dialog State (replacing window.confirm)
 const [confirmDialog, setConfirmDialog] = useState<{
 isOpen: boolean;
 title: string;
 message: string;
 onConfirm: () => void;
 isLoading?: boolean;
 confirmText?: string;
 confirmStyle?:"danger" |"primary" |"neutral";
}>({
 isOpen: false,
 title:"",
 message:"",
 onConfirm: () => {},
 isLoading: false,
 confirmText:"Confirm",
 confirmStyle:"primary"
});

 const { addToast } = useToast();

 const closeConfirm = () => {
 setConfirmDialog(prev => ({ ...prev, isOpen: false}));
};

 useEscapeToClose(closeConfirm, confirmDialog.isOpen);

 // Mutations for lifecycle
 const markRouteCompleted = useMutation(api.dailyRoutes.markRouteCompleted);
 const lockRoute = useMutation(api.dailyRoutes.lockRoute);
 const unlockRoute = useMutation(api.dailyRoutes.unlockRoute);
 const deleteDailyRoute = useMutation(api.dailyRoutes.deleteDailyRoute);
 const deleteBulkDailyRoutes = useMutation(api.dailyRoutes.deleteBulkDailyRoutes);
 const updateLoadFields = useMutation(api.dailyRoutes.updateLoadFields);

 // State for loading actions
 const [actionLoading, setActionLoading] = useState<string | null>(null);

 // Selection State
 const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());

 // Undo State

 // Side panel state (replaces inline expand/collapse)
 const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
 const [panelView, setPanelView] = useState<"detail" | "edit" | "analytics">("detail");
 // Mobile-only route summary sheet (opened from the graph icon on the
 // restore pill while a route's detail/KPI view is open).
 const [showRouteSummary, setShowRouteSummary] = useState(false);
 // Email the visible routes as an HTML report (Send Email button in the
 // summary sheet's export row).
 const [showEmailModal, setShowEmailModal] = useState(false);
 const sendSummaryEmail = useAction(api.emails.sendSummaryEmail);

 const openPanel = (route: any) => {
 setSelectedRoute(route);
 setPanelView("detail");
 };
 const closePanel = () => {
 setSelectedRoute(null);
 setShowRouteSummary(false); // never let the sheet resurface for a later route
 };
 const openEditView = () => setPanelView("edit");
 const openAnalyticsView = () => setPanelView("analytics");
 const backToDetail = () => setPanelView("detail");
 // Escape: step back from the edit/analytics views first, then close the panel.
 // When the route summary sheet is open (it layers above the panel + pill),
 // Escape closes it first instead of stepping the panel back.
 useEscapeToClose(() => {
 if (panelView !== "detail") backToDetail();
 else closePanel();
 }, !!selectedRoute && !showRouteSummary);
 useEscapeToClose(() => setShowRouteSummary(false), showRouteSummary);

 // Sort and Filter State
 const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc'}>(() => {
 if (typeof window === "undefined") return { column: null, direction: 'asc' };
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (parsed.sort && typeof parsed.sort.column === 'string' && (parsed.sort.direction === 'asc' || parsed.sort.direction === 'desc') && SORTABLE_COLUMNS.includes(parsed.sort.column)) {
 return { column: parsed.sort.column, direction: parsed.sort.direction };
 }
 }
 } catch { /* ignore */ }
 return { column: null, direction: 'asc' };
});

 const [filters, setFilters] = useState<{
 date: string;
 truck: string;
 trailer: string;
 client: string;
 driver: string;
 from: string;
 to: string;
 status: string[];
 amountMin: string;
 amountMax: string;
 region: string;
}>(() => {
 if (typeof window === "undefined") return { date: '', truck: '', trailer: '', client: '', driver: '', from: '', to: '', status: [], amountMin: '', amountMax: '', region: '' };
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (parsed.filters) {
 const f = parsed.filters;
 return {
 date: typeof f.date === 'string' ? f.date : '',
 truck: typeof f.truck === 'string' ? f.truck : '',
 trailer: typeof f.trailer === 'string' ? f.trailer : '',
 client: typeof f.client === 'string' ? f.client : '',
 driver: typeof f.driver === 'string' ? f.driver : '',
 from: typeof f.from === 'string' ? f.from : '',
 to: typeof f.to === 'string' ? f.to : '',
 status: Array.isArray(f.status) ? f.status : [],
 amountMin: typeof f.amountMin === 'string' ? f.amountMin : '',
 amountMax: typeof f.amountMax === 'string' ? f.amountMax : '',
 region: typeof f.region === 'string' ? f.region : '',
 };
 }
 }
 } catch { /* ignore */ }
 return { date: '', truck: '', trailer: '', client: '', driver: '', from: '', to: '', status: [], amountMin: '', amountMax: '', region: '' };
});
 const [dashboardDrilldown, setDashboardDrilldown] = useState<{
 date: { label: string; date: string } | null;
 truck: { label: string; value: string } | null;
 client: { label: string; value: string } | null;
 status: { label: string; values: string[] } | null;
 sort: { label: string; column: string; direction: 'asc' | 'desc' } | null;
}>(() => {
 if (typeof window === "undefined") return { date: null, truck: null, client: null, status: null, sort: null };
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 // Only the sort drilldown is persisted — date/truck/client/status drilldowns
 // are transient "Dashboard: ..." focus states that reset on every visit.
 if (parsed.drillSort && typeof parsed.drillSort.column === 'string' && typeof parsed.drillSort.direction === 'string' && SORTABLE_COLUMNS.includes(parsed.drillSort.column)) {
 return { date: null, truck: null, client: null, status: null, sort: parsed.drillSort };
 }
 }
 } catch { /* ignore */ }
 return { date: null, truck: null, client: null, status: null, sort: null };
});

 const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null);  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showTableGrid, setShowTableGrid] = useState(true);
  // Table-only mode: hides the filter/sort toolbar + header chrome so only the
  // spreadsheet table is visible (same UX as the mobile minimize). The floating
  // restore pill brings everything back.
  const [tableOnly, setTableOnly] = useState(false);
 // Persisted UI state: density, search, filters survive page lifecycle
 // (SHEETS_UI_KEY is declared at module scope so earlier initializers can use it)
 const [tableDensity, setTableDensity] = useState<'comfortable' | 'compact'>(() => {
 if (typeof window === "undefined") return 'compact';
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (parsed.density === 'compact' || parsed.density === 'comfortable') return parsed.density;
 }
 } catch { /* ignore */ }
 return 'compact';
 });
 const [quickSearch, setQuickSearch] = useState(() => {
 if (typeof window === "undefined") return '';
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (typeof parsed.search === 'string') return parsed.search;
 }
 } catch { /* ignore */ }
 return '';
 });

  const [tableColumnWidths, setTableColumnWidths] = useState<Record<TableColumnKey, number>>(() => {
 if (typeof window === "undefined") return DEFAULT_TABLE_COLUMN_WIDTHS;
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (parsed.columnWidths && typeof parsed.columnWidths === 'object') {
 return { ...DEFAULT_TABLE_COLUMN_WIDTHS, ...parsed.columnWidths };
 }
 }
 } catch { /* ignore */ }
 return DEFAULT_TABLE_COLUMN_WIDTHS;
 });
 const [tableColumnVisibility, setTableColumnVisibility] = useState<Record<ResizableTableColumnKey, boolean>>(() => {
 if (typeof window === "undefined") return DEFAULT_TABLE_COLUMN_VISIBILITY;
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (parsed.columnVisibility && typeof parsed.columnVisibility === 'object') {
 return { ...DEFAULT_TABLE_COLUMN_VISIBILITY, ...parsed.columnVisibility };
 }
 }
 } catch { /* ignore */ }
 return DEFAULT_TABLE_COLUMN_VISIBILITY;
 });

 // Persist density, search, filters, column widths, and column visibility to localStorage
 useEffect(() => {
 try {
 const existing = localStorage.getItem(SHEETS_UI_KEY);
 const parsed = existing ? JSON.parse(existing) : {};
 parsed.density = tableDensity;
 parsed.search = quickSearch;
 parsed.filters = filters;
 parsed.sort = sortConfig;
 parsed.drillSort = dashboardDrilldown.sort;
 parsed.columnWidths = tableColumnWidths;
 parsed.columnVisibility = tableColumnVisibility;
 localStorage.setItem(SHEETS_UI_KEY, JSON.stringify(parsed));
 } catch { /* ignore */ }
 }, [tableDensity, quickSearch, filters, sortConfig, dashboardDrilldown, tableColumnWidths, tableColumnVisibility]);
 const resizingColumnRef = useRef<{ key: ResizableTableColumnKey; startX: number; startWidth: number} | null>(null);
 const tableHeaderScrollRef = useRef<HTMLDivElement | null>(null);
 const tableBodyScrollRef = useRef<HTMLDivElement | null>(null);
 const syncingTableScrollRef = useRef<"header" |"body" | null>(null);

 const getEffectiveTableColumnWidth = (key: TableColumnKey) => {
 if (key ==="select" || key ==="expand") return tableColumnWidths[key];
 return tableColumnVisibility[key] ? tableColumnWidths[key] : 0;
};

 const tableGridTemplateColumns = useMemo(() => {
 const widths = {
 select: getEffectiveTableColumnWidth("select"),
 expand: getEffectiveTableColumnWidth("expand"),
 date: getEffectiveTableColumnWidth("date"),
 truck: getEffectiveTableColumnWidth("truck"),
 trailer: getEffectiveTableColumnWidth("trailer"),
 client: getEffectiveTableColumnWidth("client"),
 driver: getEffectiveTableColumnWidth("driver"),
 from: getEffectiveTableColumnWidth("from"),
 to: getEffectiveTableColumnWidth("to"),
 notes: getEffectiveTableColumnWidth("notes"),
 amount: getEffectiveTableColumnWidth("amount"),
 rkm: getEffectiveTableColumnWidth("rkm"),
 status: getEffectiveTableColumnWidth("status"),
};
 return [
`${widths.select}px`,
`${widths.expand}px`,
`${widths.date}px`,
`${widths.truck}px`,
`${widths.trailer}px`,
`${widths.client}px`,
`${widths.driver / 2}px`,
`${widths.driver / 2}px`,
`${widths.from / 2}px`,
`${widths.from / 2}px`,
`${widths.to / 2}px`,
`${widths.to / 2}px`,
`${widths.notes / 2}px`,
`${widths.notes / 2}px`,
`${widths.amount}px`,
`${widths.rkm}px`,
`${widths.status}px`,
].join("");
}, [tableColumnVisibility, tableColumnWidths]);

 const startColumnResize = (key: ResizableTableColumnKey, e: React.MouseEvent<HTMLDivElement>) => {
 e.preventDefault();
 e.stopPropagation();
 resizingColumnRef.current = {
 key,
 startX: e.clientX,
 startWidth: tableColumnWidths[key],
};
 document.body.style.cursor ="col-resize";
 document.body.style.userSelect ="none";
};

 const resetTableColumnWidths = () => {
 setTableColumnWidths(DEFAULT_TABLE_COLUMN_WIDTHS);
};

 const getColumnVisibilityClass = (key: ResizableTableColumnKey) =>
 tableColumnVisibility[key]
 ?""
 :"overflow-hidden opacity-0 pointer-events-none !px-0 !border-r-0";

 const toggleTableColumnVisibility = (key: ResizableTableColumnKey) => {
 setTableColumnVisibility((prev) => ({
 ...prev,
 [key]: !prev[key],
}));
};

 const estimateColumnAutoFitWidth = (key: ResizableTableColumnKey) => {
 const rowsToMeasure = filteredRoutes.slice(0, 100);
 const samples = rowsToMeasure.map((route: any) => {
 if (key ==="date") {
 if (!route.routeDate) return"-";
 const date = new Date(route.routeDate);
 const day = String(date.getDate()).padStart(2,"0");
 const month = String(date.getMonth() + 1).padStart(2,"0");
 const year = String(date.getFullYear()).slice(-2);
 return`${day}/${month}/${year}`;
}
 if (key ==="truck") return route.truckFleetNoStr ||"-";
 if (key ==="trailer") return route.trailerFleetNoStr ||"-";
 if (key ==="client") return route.client ||"-";
 if (key ==="driver") return getDriverDisplay(route.driverName);
 if (key ==="from") {
 const allFroms = route.loads?.flatMap((l: any) => l.fromLocations || []) || [];
 return [...new Set(allFroms)].join(" •") ||"-";
}
 if (key ==="to") {
 const allTos = route.loads?.flatMap((l: any) => l.toLocations || []) || [];
 return [...new Set(allTos)].join(" →") ||"-";
}
 if (key ==="notes") return route.notes ||"";
 if (key ==="amount") return formatZAR(route.rate || 0);
 if (key ==="rkm") {
 const km = Number(route.kilometers) || 0;
 const amount = Number(route.rate) || 0;
 return km === 0 ?"—" :`R ${(amount / km).toFixed(2)}`;
}
 if (key ==="status") return getRouteRiskStatus(route).label;
 return"";
});

 const maxLength = Math.max(
 TABLE_COLUMN_LABELS[key].length,
 ...samples.map((sample) => String(sample).length)
);

 return Math.max(MIN_TABLE_COLUMN_WIDTHS[key], Math.min(360, Math.ceil(maxLength * 7.4) + 28));
};

 const autoFitTableColumn = (key: ResizableTableColumnKey) => {
 setTableColumnWidths((prev) => ({
 ...prev,
 [key]: estimateColumnAutoFitWidth(key),
}));
};

 const syncTableHorizontalScroll = (source:"header" |"body") => {
 const sourceEl = source ==="header" ? tableHeaderScrollRef.current : tableBodyScrollRef.current;
 const targetEl = source ==="header" ? tableBodyScrollRef.current : tableHeaderScrollRef.current;
 if (!sourceEl || !targetEl) return;
 syncingTableScrollRef.current = source;
 targetEl.scrollLeft = sourceEl.scrollLeft;
 window.requestAnimationFrame(() => {
 syncingTableScrollRef.current = null;
});
};

 useEffect(() => {
 const onMouseMove = (e: MouseEvent) => {
 if (!resizingColumnRef.current) return;
 const { key, startX, startWidth} = resizingColumnRef.current;
 const delta = e.clientX - startX;
 const nextWidth = Math.max(MIN_TABLE_COLUMN_WIDTHS[key], startWidth + delta);
 setTableColumnWidths((prev) => ({ ...prev, [key]: nextWidth}));
};

 const onMouseUp = () => {
 resizingColumnRef.current = null;
 document.body.style.cursor ="default";
 document.body.style.userSelect ="";
};

 window.addEventListener("mousemove", onMouseMove);
 window.addEventListener("mouseup", onMouseUp);

 return () => {
 window.removeEventListener("mousemove", onMouseMove);
 window.removeEventListener("mouseup", onMouseUp);
};
}, []);

 // Column widths/visibility are now restored via lazy useState initializers from SHEETS_UI_KEY.
 // The old separate restore from TABLE_WIDTHS_STORAGE_KEY / TABLE_VISIBILITY_STORAGE_KEY
 // has been removed. Migration: the next time the user changes a column, the unified key
 // writes the full state.

 // Column widths/visibility are now persisted via the unified SHEETS_UI_KEY effect above;
 // the old separate TABLE_WIDTHS_STORAGE_KEY / TABLE_VISIBILITY_STORAGE_KEY effects
 // have been removed to avoid conflicting writes. Migration: the next time the user
 // changes a column, the unified key writes the full state (including the old values).

 // Escape restores the controls when in table-only mode
 useEffect(() => {
   const handleKeyDown = (e: KeyboardEvent) => {
     if (e.key === 'Escape' && tableOnly) {
       setTableOnly(false);
     }
   };
   window.addEventListener('keydown', handleKeyDown);
   return () => window.removeEventListener('keydown', handleKeyDown);
 }, [tableOnly]);

 // ── Floating (draggable) restore pill ──────────────────────────────────────
 const [restorePos, setRestorePos] = useState<{ x: number; y: number } | null>(() => {
   if (typeof window === "undefined") return null;
   try {
     const raw = localStorage.getItem(RESTORE_PILL_POS_KEY);
     if (raw) {
       const parsed = JSON.parse(raw);
       if (typeof parsed.x === "number" && typeof parsed.y === "number") {
         return { x: parsed.x, y: parsed.y };
       }
     }
   } catch { /* ignore */ }
   return null;
 });
 const restoreDragRef = useRef<{
   startX: number;
   startY: number;
   origX: number;
   origY: number;
 } | null>(null);
 const restoreDraggedRef = useRef(false);
 const restoreLatestPosRef = useRef<{ x: number; y: number } | null>(null);

 const persistRestorePos = () => {
   const latest = restoreLatestPosRef.current;
   if (!latest) return;
   try {
     localStorage.setItem(RESTORE_PILL_POS_KEY, JSON.stringify(latest));
   } catch { /* ignore */ }
 };

 const handleRestorePillPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
   const rect = e.currentTarget.getBoundingClientRect();
   restoreDragRef.current = {
     startX: e.clientX,
     startY: e.clientY,
     origX: restorePos?.x ?? rect.left,
     origY: restorePos?.y ?? rect.top,
   };
   restoreDraggedRef.current = false;
   e.currentTarget.setPointerCapture(e.pointerId);
 };

 const handleRestorePillPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
   const drag = restoreDragRef.current;
   if (!drag) return;
   const dx = e.clientX - drag.startX;
   const dy = e.clientY - drag.startY;
   if (Math.abs(dx) > 5 || Math.abs(dy) > 5) restoreDraggedRef.current = true;
   const w = e.currentTarget.offsetWidth;
   const h = e.currentTarget.offsetHeight;
   const next = {
     x: Math.max(0, Math.min(drag.origX + dx, Math.max(0, window.innerWidth - w))),
     y: Math.max(0, Math.min(drag.origY + dy, Math.max(0, window.innerHeight - h))),
   };
   restoreLatestPosRef.current = next;
   setRestorePos(next);
 };

 const handleRestorePillPointerUp = () => {
   restoreDragRef.current = null;
   persistRestorePos();
 };

 // Saved position re-clamped to the current viewport (resize / rotation);
 // before the user has dragged anywhere, fall back to bottom-right.
 const restorePillStyle = (() => {
   if (!restorePos || typeof window === "undefined") {
     return { right: 16, bottom: 16 } as React.CSSProperties;
   }
   const maxX = Math.max(0, window.innerWidth - RESTORE_PILL_EST_SIZE.w);
   const maxY = Math.max(0, window.innerHeight - RESTORE_PILL_EST_SIZE.h);
   return {
     left: Math.max(0, Math.min(restorePos.x, maxX)),
     top: Math.max(0, Math.min(restorePos.y, maxY)),
   } as React.CSSProperties;
 })();

 // Sort handler
 const handleSort = (column: string) => {
 setDashboardDrilldown(prev => ({ ...prev, sort: null}));
 setSortConfig(prev => ({
 column,
 direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
}));
};

 // Filter update handler
 const updateFilter = (key: keyof typeof filters, value: any) => {
 setFilters(prev => ({ ...prev, [key]: value}));
};

 const dashboardStatusMap: Record<string, string> = {
"Incomplete":"🔴 Incomplete",
"Missing KM":"🟡 Missing KM",
"Multi-drop":"🟡 Multi-drop",
"Multi-pick":"🟡 Multi-pick",
"Finalized":"🔵 Finalized",
"Clean":"🟢 Clean",
};
 const attentionStatuses = [
"🔴 Incomplete",
"🟡 Missing KM",
"🟡 Multi-drop",
"🟡 Multi-pick",
];

 const syncDateToUrl = (newDate: string) => {
 const params = new URLSearchParams(searchParams.toString());
 if (newDate) {
 params.set("date", newDate);
} else {
 params.delete("date");
}
 router.replace(`?${params.toString()}`, { scroll: false});
};

 const focusDate = (date: string, label: string) => {
 setDateMode("single");
 setSingleDate(date);
 setFromDate(date);
 setToDate(date);
 syncDateToUrl(date);
 setDashboardDrilldown(prev => ({ ...prev, date: { label, date}}));
};

 // Clear all filters
 const clearFilters = () => {
 // 1. Reset generic filters (preserves tableDensity/compact mode)
 setFilters({
 date: '',
 truck: '',
 trailer: '',
 client: '',
 driver: '',
 from: '',
 to: '',
 status: [],
 amountMin: '',
 amountMax: '',
 region: '',
});
 setSortConfig({ column: null, direction: 'asc'});

 // 2. Reset Date Query to Defaults (Today)
 const now = new Date();
 const today = now.toISOString().split("T")[0];
 const currentMonth = today.slice(0, 7);
 setSingleDate(today);
 setFromDate(today);
 setToDate(today);
 setSelectedMonth(currentMonth);
 setDateMode("single");
 setDashboardDrilldown({
 date: null,
 truck: null,
 client: null,
 status: null,
 sort: null,
});  // 3. Clear URL params
  syncDateToUrl("");
  setQuickSearch('');

  // 4. Reset column widths and visibility to defaults
 setTableColumnWidths(DEFAULT_TABLE_COLUMN_WIDTHS);
 setTableColumnVisibility(DEFAULT_TABLE_COLUMN_VISIBILITY);

 // 5. Persistence is handled by the state-persist effects, which write the
 // complete reset state (including the cleared sort/dates) — density stays as-is.
 };
 
  const summarizeRoutes = (routesList: any[]) => {
 const truckCount = new Set(routesList.map((route: any) => route.truckFleetNoStr || route.truckFleetNo ||"Unassigned")).size;
 const clientCount = new Set(routesList.map((route: any) => route.client ||"Unassigned")).size;
 return {
 routes: routesList.length,
 loads: routesList.reduce((sum: number, route: any) => sum + (route.loads?.length || 0), 0),
 revenue: routesList.reduce((sum: number, route: any) => sum + (Number(route.rate) || 0), 0),
 distance: routesList.reduce((sum: number, route: any) => sum + (Number(route.kilometers) || 0), 0),
 trucks: truckCount,
 clients: clientCount,
};
};

 // Apply filters and sorting
 const getFilteredAndSortedRoutes = (
 routesList: any[],
 options?: { includeDashboard?: boolean; applySorting?: boolean}
) => {
 if (!routesList) return [];
 const includeDashboard = options?.includeDashboard ?? true;
 const applySorting = options?.applySorting ?? true;

 // Apply filters
 const filtered = routesList.filter(route => {
 // Quick search across all visible fields
 if (quickSearch) {
 const q = quickSearch.toLowerCase();
 const searchableText = [
 route.truckFleetNoStr,
 route.trailerFleetNoStr,
 route.client,
 route.driverName,
 route.notes,
 route.routeDate,
 ...(route.loads ?? []).flatMap((l: any) => [
 l.client,
 ...(l.fromLocations ?? []),
 ...(l.toLocations ?? [])
 ])
 ].filter(Boolean).join(' ').toLowerCase();
 if (!searchableText.includes(q)) return false;
 }

 // Date filter
 if (filters.date) {
 const dateStr = route.routeDate || '';
 const date = new Date(dateStr);
 const day = String(date.getDate()).padStart(2, '0');
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const year = String(date.getFullYear()).slice(-2);
 const formatted =`${day}/${month}/${year}`;
 if (!formatted.toLowerCase().includes(filters.date.toLowerCase())) return false;
}
 if (includeDashboard && dashboardDrilldown.date && (route.routeDate || '') !== dashboardDrilldown.date.date) {
 return false;
}

 // Truck filter
 if (filters.truck && !(route.truckFleetNo?.toString() ?? route.truckFleetNoStr ?? '').toLowerCase().includes(filters.truck.toLowerCase())) {
 return false;
}
 if (includeDashboard && dashboardDrilldown.truck && !(route.truckFleetNo?.toString() ?? route.truckFleetNoStr ?? '').toLowerCase().includes(dashboardDrilldown.truck.value.toLowerCase())) {
 return false;
}

 // Trailer filter
 if (filters.trailer && !(route.trailerFleetNo?.toString() ?? route.trailerFleetNoStr ?? '').toLowerCase().includes(filters.trailer.toLowerCase())) {
 return false;
}

 // Client filter
 if (filters.client && !(route.client || '').toLowerCase().includes(filters.client.toLowerCase())) {
 return false;
}
 if (includeDashboard && dashboardDrilldown.client && !(route.client || '').toLowerCase().includes(dashboardDrilldown.client.value.toLowerCase())) {
 return false;
}

 // Driver filter
 if (filters.driver && !(route.driverName || '').toLowerCase().includes(filters.driver.toLowerCase())) {
 return false;
}

 // From filter
 if (filters.from) {
 const allFroms = route.loads?.flatMap((l: any) => l.fromLocations || []) || [];
 const fromDisplay = allFroms.join(' ');
 if (!fromDisplay.toLowerCase().includes(filters.from.toLowerCase())) return false;
}

 // To filter
 if (filters.to) {
 const allTos = route.loads?.flatMap((l: any) => l.toLocations || []) || [];
 const toDisplay = allTos.join(' ');
 if (!toDisplay.toLowerCase().includes(filters.to.toLowerCase())) return false;
}

 // Status filter
 if (filters.status.length > 0) {
 const riskStatus = getRouteRiskStatus(route);
 if (!filters.status.includes(riskStatus.label)) return false;
}
 if (includeDashboard && dashboardDrilldown.status) {
 const riskStatus = getRouteRiskStatus(route);
 if (!dashboardDrilldown.status.values.includes(riskStatus.label)) return false;
}

 // Amount filter
 const amount = route.rate || 0;
 if (filters.amountMin && amount < parseFloat(filters.amountMin)) return false;
 if (filters.amountMax && amount > parseFloat(filters.amountMax)) return false;

 // Region filter (client-side, so an admin viewing "All Regions" can focus
 // on a single region; regional users already only receive their own region)
 if (filters.region && route.region !== filters.region) return false;

 return true;
});

 // Apply sorting
 const effectiveSortConfig = includeDashboard ? (dashboardDrilldown.sort ?? sortConfig) : sortConfig;
 if (applySorting && effectiveSortConfig.column) {
 filtered.sort((a, b) => {
 let aVal: any;
 let bVal: any;

 switch (effectiveSortConfig.column) {
 case 'date':
 aVal = a.routeDate || '';
 bVal = b.routeDate || '';
 break;
 case 'truck':
 aVal = a.truckFleetNo?.toString() ?? a.truckFleetNoStr ?? '';
 bVal = b.truckFleetNo?.toString() ?? b.truckFleetNoStr ?? '';
 break;
 case 'trailer':
 aVal = a.trailerFleetNo?.toString() ?? a.trailerFleetNoStr ?? '';
 bVal = b.trailerFleetNo?.toString() ?? b.trailerFleetNoStr ?? '';
 break;
 case 'client':
 aVal = a.client || '';
 bVal = b.client || '';
 break;
 case 'driver':
 aVal = a.driverName || '';
 bVal = b.driverName || '';
 break;
 case 'from':
 aVal = (a.loads?.flatMap((l: any) => l.fromLocations || []) || []).join(' ');
 bVal = (b.loads?.flatMap((l: any) => l.fromLocations || []) || []).join(' ');
 break;
 case 'to':
 aVal = (a.loads?.flatMap((l: any) => l.toLocations || []) || []).join(' ');
 bVal = (b.loads?.flatMap((l: any) => l.toLocations || []) || []).join(' ');
 break;
 case 'amount':
 aVal = a.rate || 0;
 bVal = b.rate || 0;
 break;
 case 'status':
 aVal = getRouteRiskStatus(a).label;
 bVal = getRouteRiskStatus(b).label;
 break;
 default:
 return 0;
}

 if (typeof aVal === 'number' && typeof bVal === 'number') {
 return effectiveSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
}

 const comparison = String(aVal).localeCompare(String(bVal));
 return effectiveSortConfig.direction === 'asc' ? comparison : -comparison;
});
}

 return filtered;
};

 const handleStatusChange = async (routeId: Id<"dailyRoutes">, action:"complete" |"lock" |"unlock") => {
 if (action ==="unlock") {
 setConfirmDialog({
 isOpen: true,
 title:"Unlock Route",
 message:"Unlocking this route will allow edits and deletions. Are you sure?",
 confirmText:"Unlock",
 confirmStyle:"neutral",
 onConfirm: async () => {
 setActionLoading(routeId);
 try {
 await unlockRoute({ id: routeId, token});
 closeConfirm();
} catch (error) {
 console.error("Failed to update status:", error);
 addToast("Failed to update status. Please try again.", "error");
 closeConfirm();
} finally {
 setActionLoading(null);
}
}
});
 return;
}

 setActionLoading(routeId);
 try {
 if (action ==="complete") {
 await markRouteCompleted({ id: routeId, token});
} else if (action ==="lock") {
 await lockRoute({ id: routeId, token});
}
} catch (error) {
 console.error("Failed to update status:", error);
 addToast("Failed to update status. Please try again.", "error");
} finally {
 setActionLoading(null);
}
};

 const handleDelete = async (routeId: Id<"dailyRoutes">) => {
 setConfirmDialog({
 isOpen: true,
 title:"Delete Route",
 message:"Are you sure you want to delete this route and all its loads?",
 confirmText:"Delete",
 confirmStyle:"danger",
 onConfirm: async () => {
 setActionLoading(routeId);
 try {
 await deleteDailyRoute({ id: routeId, token});
 setSelectedRouteIds(prev => {
 const next = new Set(prev);
 next.delete(routeId);
 return next;
});
 closeConfirm();
} catch (error) {
 console.error("Failed to delete route:", error);
 addToast("Failed to delete route. It might be locked.", "error");
 closeConfirm();
} finally {
 setActionLoading(null);
}
}
});
};

 const handleBulkDelete = async () => {
 const idsToDelete = Array.from(selectedRouteIds) as Id<"dailyRoutes">[];
 if (idsToDelete.length === 0) return;

 setConfirmDialog({
 isOpen: true,
 title:"Bulk Delete",
 message:`You are about to delete ${idsToDelete.length} routes and all associated loads.`,
 confirmText:"Delete All",
 confirmStyle:"danger",
 onConfirm: async () => {
 try {
 await deleteBulkDailyRoutes({ ids: idsToDelete, token});
 setSelectedRouteIds(new Set());
 closeConfirm();
} catch (error) {
 console.error("Failed to bulk delete:", error);
 addToast("Failed to delete selected routes. Some might be locked.", "error");
 closeConfirm();
}
}
});
};

 const toggleSelection = (routeId: string) => {
 setSelectedRouteIds(prev => {
 const next = new Set(prev);
 if (next.has(routeId)) {
 next.delete(routeId);
} else {
 next.add(routeId);
}
 return next;
});
};

 const toggleSelectAll = (allRoutes: any[]) => {
 if (selectedRouteIds.size === allSelectableRoutes(allRoutes).length) {
 setSelectedRouteIds(new Set());
} else {
 const selectable = allSelectableRoutes(allRoutes);
 setSelectedRouteIds(new Set(selectable.map(r => r._id)));
}
};

 const allSelectableRoutes = (allRoutes: any[]) => {
 return allRoutes.filter(r => (r.status ||"planned") !=="locked");
};

 // B. Date selector
 const searchParams = useSearchParams();
 const router = useRouter();
 const urlDate = searchParams.get("date");

 // Date Mode State (persisted — restored from SHEETS_UI_KEY so the selected
 // date range survives navigating to other screens and back)
 const [dateMode, setDateMode] = useState<"single" |"range" |"month">(() => {
 if (typeof window === "undefined") return "single";
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (parsed.dateMode === "range" || parsed.dateMode === "month") return parsed.dateMode;
 }
 } catch { /* ignore */ }
 return "single";
 });

 // Single Date State (defaults to URL or today - SAFE INIT, persisted)
 const [singleDate, setSingleDate] = useState(() => {
 if (typeof window === "undefined") return "";
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (typeof parsed.singleDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.singleDate)) return parsed.singleDate;
 }
 } catch { /* ignore */ }
 return "";
 });

 // Range Date State (defaults to today - SAFE INIT, persisted)
 const [fromDate, setFromDate] = useState(() => {
 if (typeof window === "undefined") return "";
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (typeof parsed.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fromDate)) return parsed.fromDate;
 }
 } catch { /* ignore */ }
 return "";
 });
 const [toDate, setToDate] = useState(() => {
 if (typeof window === "undefined") return "";
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (typeof parsed.toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.toDate)) return parsed.toDate;
 }
 } catch { /* ignore */ }
 return "";
 });
 // Month State (defaults to current month, persisted)
 const [selectedMonth, setSelectedMonth] = useState(() => {
 if (typeof window === "undefined") return "";
 try {
 const saved = localStorage.getItem(SHEETS_UI_KEY);
 if (saved) {
 const parsed = JSON.parse(saved);
 if (typeof parsed.selectedMonth === "string" && /^\d{4}-\d{2}$/.test(parsed.selectedMonth)) return parsed.selectedMonth;
 }
 } catch { /* ignore */ }
 return "";
 });

  // Sync state with URL changes and Init Defaults
  useEffect(() => {
 // Set defaults on mount (client-only)
 const now = new Date();
 const today = now.toISOString().split("T")[0];
 const currentMonth = today.slice(0, 7); // YYYY-MM
 
 if (urlDate && urlDate !== singleDate) {
 setSingleDate(urlDate);
 setDateMode("single");
} else if (!singleDate) {
 setSingleDate(today);
}

 if (!fromDate) setFromDate(today);
 if (!toDate) setToDate(today);
 if (!selectedMonth) setSelectedMonth(currentMonth);
}, [urlDate]); // Run on mount and URL change

 // Persist the date selector state (mode + selected dates) so it survives
 // navigating away to other screens and back. Kept in its own effect after the
 // state declarations above to avoid referencing them before initialization.
 useEffect(() => {
 try {
 const existing = localStorage.getItem(SHEETS_UI_KEY);
 const parsed = existing ? JSON.parse(existing) : {};
 parsed.dateMode = dateMode;
 parsed.singleDate = singleDate;
 parsed.fromDate = fromDate;
 parsed.toDate = toDate;
 parsed.selectedMonth = selectedMonth;
 localStorage.setItem(SHEETS_UI_KEY, JSON.stringify(parsed));
 } catch { /* ignore */ }
 }, [dateMode, singleDate, fromDate, toDate, selectedMonth]);

 const handleSingleDateChange = (newDate: string) => {
 setSingleDate(newDate);
 syncDateToUrl(newDate);
};



 // Normalize dates for query
 // Wait for initialization
 const calculateDates = () => {
 if (dateMode ==="single") {
 return { start: singleDate, end: singleDate};
}
 if (dateMode ==="range") {
 return { start: fromDate, end: toDate};
}
 if (dateMode ==="month" && selectedMonth) {
 const [year, month] = selectedMonth.split("-").map(Number);
 // Use UTC dates to avoid timezone offset issues
 const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().split("T")[0];
 const end = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];
 return { start, end};
}
 return { start: singleDate, end: singleDate};
};

 const { start: startDate, end: endDate} = calculateDates();
 const isRangeInvalid = dateMode ==="range" && fromDate > toDate;
 const isDatesReady = startDate && endDate; // Ensure dates are initialized // Fetch routes (using new range-capable query)
 const liveRoutes = useQuery(api.dailyRoutes.getForSheets, isDatesReady ? {
 startDate,
 endDate,
 token,
 region,
 } :"skip");

 // ── Offline support: cache the last-fetched routes and fall back to them
 // when the device is offline and Convex can't deliver fresh data.
 const [isOffline, setIsOffline] = useState(false);
 const [cachedRoutes, setCachedRoutes] = useState<any[] | null>(null);
 const [offlineCachedAt, setOfflineCachedAt] = useState<number | null>(null);
 const [offlineCachedRange, setOfflineCachedRange] = useState<string | null>(null);

 useEffect(() => {
 if (typeof navigator === "undefined") return;
 const on = () => setIsOffline(false);
 const off = () => setIsOffline(true);
 setIsOffline(!navigator.onLine);
 window.addEventListener("online", on);
 window.addEventListener("offline", off);
 return () => {
 window.removeEventListener("online", on);
 window.removeEventListener("offline", off);
 };
 }, []);

 // Persist the freshest data for offline viewing (capped to stay under quota)
 useEffect(() => {
 if (liveRoutes && liveRoutes.length > 0) {
 try {
 const payload = JSON.stringify({ at: Date.now(), startDate, endDate, routes: liveRoutes });
 if (payload.length < 4 * 1024 * 1024) {
 localStorage.setItem(OFFLINE_CACHE_KEY, payload);
 }
 } catch { /* storage full / private mode */ }
 }
 }, [liveRoutes, startDate, endDate]);

 // Hydrate the cache on mount
 useEffect(() => {
 try {
 const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
 if (raw) {
 const parsed = JSON.parse(raw);
 if (parsed && Array.isArray(parsed.routes)) {
 setCachedRoutes(parsed.routes);
 setOfflineCachedAt(parsed.at ?? null);
 setOfflineCachedRange(parsed.startDate ? `${parsed.startDate} → ${parsed.endDate}` : null);
 }
 }
 } catch { /* corrupted cache */ }
 }, []);

 const routes = liveRoutes ?? (isOffline ? cachedRoutes : undefined);

 // Sync selectedRoute with updated data from routes query after edits
 useEffect(() => {
 if (selectedRoute && routes) {
 const updatedRoute = routes.find(r => r._id === selectedRoute._id);
 if (updatedRoute) {
 setSelectedRoute(updatedRoute);
}
}
}, [routes, selectedRoute]);

 // 1️⃣ Read reference data (queries)
 // Fetch all reference data to resolve names in-memory
 const trucks = useQuery(api.fleet.getTrucks, {});
 const trailers = useQuery(api.fleet.getTrailers, {});  // includeAll: the photo map below must cover subcontractor and inactive
  // drivers too — the default fleet mode silently drops them, so a sub-driver
  // route would show no photo even though the driver has one on file.
  const drivers = useQuery(api.fleet.getDrivers, { includeAll: true });

 // Helper to resolve Driver
 const getDriverDisplay = (driverName?: string) => {
 if (!driverName) return"-";
 // Currently dailyRoutes stores driverName directly, but if we had ID we would look it up.
 // The prompt says"Match route.driverId → drivers.driverId → driverName".
 // However, existing schema in dailyRoutes uses`driverName` field which stores the name directly (or ID?).
 // Checking dailyRoutes.ts schema: driverName: v.string().
 // Checking Input page: setDriverName(e.target.value) where value comes from drivers.map(d => d.value).
 // In fleet.ts listDrivers, value is d.driverName.
 // So dailyRoutes actually stores the Name directly right now based on previous steps.
 // BUT the prompt explicitly asks:"Match route.driverId → drivers.driverId → driverName".
 // AND"dailyRoutes fields: ... driverId ...".
 // My previous step wired Input to save`driverName` into`driverName` field.
 // Wait, let's check the schema again.
 // dailyRoutes schema has`driverName: v.string()`. It does NOT have`driverId`.
 // The prompt says"dailyRoutes fields: ... driverId ...".
 // This is a slight mismatch between Prompt's"Authoritative Schema" and Actual Schema.
 // ACTUAL SCHEMA (dailyRoutes.ts): driverName: v.string().
 // PROMPT SCHEMA: driverId: string.
 // 
 // If I strictly follow"Read dailyRoutes", I get`driverName`.
 // If I strictly follow"Match route.driverId", I might fail if the field is missing.
 // 
 // However, looking at the Input page I just wrote:
 //`const [driverName, setDriverName] = useState("");`
 //`createRoute({ ... driverName: driverName ...})`
 // 
 // So currently we are saving the Name, not the ID.
 // 
 // BUT, for trucks, we save`truckFleetNoStr`.
 // For trailers, we save`trailerFleetNoStr`.
 // 
 // To be safe and robust (and follow the"Resolve names" spirit), I will try to match whatever is in the field
 // against the driver list.
 // If`driverName` holds a name, it will display.
 // If it holds an ID (future refactor), we might need lookup.
 // 
 // Let's assume the field`driverName` in dailyRoutes IS the display value for now (as per Input wiring),
 // OR if it's an ID, we resolve it.
 // 
 // Actually, looking at`drivers` table schema in schema.ts:
 //`driverId`,`driverName`,`idNumber`, ...
 // 
 // If`dailyRoutes.driverName` holds"JONAS OLIFANT", then resolution is trivial (it's already resolved).
 // If`dailyRoutes.driverName` holds"drv-023", we need to resolve it.
 // 
 // Given the prompt says"Match route.driverId → drivers.driverId → driverName",
 // I will write a resolver that tries to find a driver where`driver.driverId === routeVal` OR`driver.driverName === routeVal`.
 // This covers both bases.

 const driver = drivers?.find(d => d.driverId === driverName || d.driverName === driverName);
 return driver ? driver.driverName : driverName;
};



 // Fleet-specific risk status computation (pure, no hooks/mutations)
 const getRouteRiskStatus = (route: any): { label: string; level:"red" |"yellow" |"green" |"blue"} => {
 const loads = route.loads || [];

 // Priority 1: 🔴 CRITICAL - Incomplete
 if (loads.length === 0) {
 return { label:"🔴 Incomplete", level:"red"};
}

 const totalAmount = loads.reduce((sum: number, load: any) => {
 const qty = parseNumberSafe(load.quantity);
 const rate = parseNumberSafe(load.rate);
 const rateType = load.rateType ||"per_unit";
 return sum + calculateLoadAmount(qty, rate, rateType);
}, 0);

 const hasIncompleteLoad = loads.some((load: any) =>
 !load.client || !load.rate || !load.quantity
);

 if (hasIncompleteLoad || totalAmount === 0) {
 return { label:"🔴 Incomplete", level:"red"};
}

 // Priority 2: 🟡 WARNING - Missing KM
 // Check effective route KM (stored in route.kilometers which respects Route KM > Max Load KM)
 const effectiveKm = Number(route.kilometers) || 0;
 if (effectiveKm === 0) {
 return { label:"🟡 Missing KM", level:"yellow"};
}

 // Priority 3: 🟡 WARNING - Multi-drop
 const allTos = loads.flatMap((load: any) => load.toLocations || []);
 const uniqueTos = new Set(allTos);
 if (uniqueTos.size > 1) {
 return { label:"🟡 Multi-drop", level:"yellow"};
}

 // Priority 4: 🟡 WARNING - Multi-pick
 const allFroms = loads.flatMap((load: any) => load.fromLocations || []);
 const uniqueFroms = new Set(allFroms);
 if (uniqueFroms.size > 1) {
 return { label:"🟡 Multi-pick", level:"yellow"};
}

 // Priority 5: 🔵 FINALIZED
 if (route.status ==="locked") {
 return { label:"🔵 Finalized", level:"blue"};
}

 // Priority 6: 🟢 CLEAN
 return { label:"🟢 Clean", level:"green"};
};



 const getStatusBadge = (status?: string, routeId?: Id<"dailyRoutes">) => {
 // Default to"planned" if no status (backward compatibility)
 const currentStatus = status ||"planned";
 const isActionLoading = actionLoading === routeId;

 switch (currentStatus) {
 case"completed":
 return (
 <div className="flex flex-col items-end gap-1">
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
 Completed
 </span>
 {routeId && (
 <button
 onClick={() => handleStatusChange(routeId,"lock")}
 disabled={isActionLoading}
 className="inline-flex items-center min-h-9 px-1.5 text-xs text-[var(--nav-text-color)] hover:text-[var(--foreground)] underline disabled:opacity-50"
 >
 {isActionLoading ?"Locking..." :"Lock Route"}
 </button>
)}
 </div>
);
 case"locked":
 return (
 <div className="flex flex-col items-end gap-1">
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--card-bg)] text-[var(--foreground)]">
 Locked
 </span>
 {routeId && (
 <button
 onClick={() => handleStatusChange(routeId,"unlock")}
 disabled={isActionLoading}
 className="inline-flex items-center min-h-9 px-1.5 text-xs text-[var(--nav-text-color)] hover:text-[var(--foreground)] underline disabled:opacity-50"
 >
 {isActionLoading ?"Unlocking..." :"Unlock Route"}
 </button>
)}
 </div>
);
 case"planned":
 default:
 return (
 <div className="flex flex-col items-end gap-1">
 <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
 Planned
 </span>
 {routeId && (
 <button
 onClick={() => handleStatusChange(routeId,"complete")}
 disabled={isActionLoading}
 className="inline-flex items-center min-h-9 px-1.5 text-xs text-[#06B6D4] hover:text-[#0891B2] underline disabled:opacity-50"
 >
 {isActionLoading ?"Saving..." :"Mark Completed"}
 </button>
)}
 </div>
);
}
};

 const isLoading = routes === undefined || trucks === undefined || trailers === undefined || drivers === undefined;

 // TRAE-ADDED: Memoize filtered routes for KPIs and Table consistency
 // We use the existing getFilteredAndSortedRoutes function but memoize the result
 // to prevent recalculation and ensure KPIs match the table exactly.   // Routes store driverName (not id), so look up each driver's photo by name
   // and attach it to the route — the sheets views (mobile cards, spreadsheet
   // table) render a small DriverThumb from route.driverPhotoUrl. The original
   // (uncropped) photo is carried alongside so long-press shows the full image.
   const driverPhotoByName = useMemo(() => {
    const m: Record<string, { photoUrl: string; photoOriginalUrl: string }> = {};
    for (const d of (drivers ?? []) as any[]) {
      const n = (d as any).driverName as string | undefined;
      const photo = (d as any).photoUrl as string | undefined;
      // Only truthy photos are recorded, so a photo-less driver with a shared
      // name can never shadow a later driver that does have a photo.
      if (n && photo && !(n.toLowerCase() in m)) {
        m[n.toLowerCase()] = {
          photoUrl: photo,
          photoOriginalUrl: (d as any).photoOriginalUrl ?? "",
        };
      }
    }
    return m;
  }, [drivers]);

  const filteredRoutes = useMemo(() => {
  return (getFilteredAndSortedRoutes(routes || []) as any[]).map((r: any) => {
    if (!r.driverName) return r;
    const photo = driverPhotoByName[String(r.driverName).toLowerCase()];
    return photo ? { ...r, driverPhotoUrl: photo.photoUrl, driverPhotoOriginalUrl: photo.photoOriginalUrl } : r;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [routes, filters, sortConfig, dashboardDrilldown, quickSearch, driverPhotoByName]);

 // Mobile route list: same filters/sort as the desktop grid, but dashboard
 // drilldown state is excluded — phones can't see the drilldown chips or
 // clear them, so it must never silently apply (e.g. a persisted drillSort).
 const filteredRoutesMobile = useMemo(() => {
  return (getFilteredAndSortedRoutes(routes || [], { includeDashboard: false }) as any[]).map((r: any) => {
    if (!r.driverName) return r;
    const photo = driverPhotoByName[String(r.driverName).toLowerCase()];
    return photo ? { ...r, driverPhotoUrl: photo.photoUrl, driverPhotoOriginalUrl: photo.photoOriginalUrl } : r;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [routes, filters, sortConfig, quickSearch, driverPhotoByName]);

 const baseRoutes = useMemo(() => {
 return getFilteredAndSortedRoutes(routes || [], { includeDashboard: false, applySorting: false});
 // eslint-disable-next-line react-hooks/exhaustive-deps
}, [routes, filters]);

 // TRAE-ADDED: KPI Calculations
 const kpiStats = useMemo(() => {
 const data = filteredRoutes;
 const loadsDone = data.length;
 
 // Total Revenue: Sum of route rate/amount (using 'rate' field as per filter logic)
 //"Missing KM rows: Still count toward Total Revenue"
 const totalRevenue = data.reduce((sum, r: any) => sum + (Number(r.rate) || 0), 0);
 
 // Total Distance: Sum of kilometers (excluding missing/0)
 //"Missing KM rows: Must NOT be included in distance"
 const totalDistance = data.reduce((sum, r: any) => {
 const km = Number(r.kilometers) || 0;
 return sum + km;
}, 0);
 
 // Avg R / KM: Revenue / Distance (if distance > 0)
 //"Formula: totalRevenue / totalDistance"
 const avgRPerKm = totalDistance > 0 ? totalRevenue / totalDistance : 0;
 
 return { loadsDone, totalRevenue, totalDistance, avgRPerKm};
}, [filteredRoutes]);

 const BASE_CONTAINER_CLASS ="bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm overflow-hidden relative";
 const compactDateInputClass ="h-11 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent";

 const formatCompactCurrency = (value: number) => {
 if (value >= 1000) return`${formatZAR(value / 1000)}k`;
 return formatZAR(value);
};

 const formatCompactDistance = (value: number) => {
 if (value >= 1000) return`${(value / 1000).toFixed(1)}k`;
 return value.toFixed(0);
};

 const formatCompactNumber = (value: number) => {
 if (value >= 1000) return`${(value / 1000).toFixed(1)}k`;
 return value.toFixed(0);
};

 // Shift the selected month by a number of months (negative = back). Uses
 // UTC to avoid the timezone offset issues the date inputs already guard
 // against, and keeps the persisted YYYY-MM format.
 const shiftMonth = (delta: number) => {
 setSelectedMonth((prev: string) => {
 if (!prev) return prev;
 const [year, month] = prev.split("-").map(Number);
 const d = new Date(Date.UTC(year, month - 1 + delta, 1));
 return d.toISOString().slice(0, 7);
 });
 };

 const renderCompactDateControls = () => (
 <div className="flex items-center gap-2 whitespace-nowrap">
 <div className="flex items-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-0.5 gap-0.5">
 {[
 { id:"single", label:"Date"},
 { id:"range", label:"Range"},
 { id:"month", label:"Month"},
].map((option) => (
 <button
 key={option.id}
 type="button"
 onClick={() => setDateMode(option.id as"single" |"range" |"month")}
 className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
 dateMode === option.id
 ?`${gradients.primary} text-white shadow-sm shadow-[rgba(6,182,212,0.3)]`
 :"text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
}`}
 >
 {option.label}
 </button>
))}
 </div>

 {dateMode ==="single" && (
 <CommitDateInput
 name="sheet-single-date"
 value={singleDate}
 onChange={handleSingleDateChange}
 className={compactDateInputClass}
 />
)}

 {dateMode ==="range" && (
 <>
 <CommitDateInput
 name="sheet-from-date"
 value={fromDate}
 onChange={setFromDate}
 className={compactDateInputClass}
 />
 <span className="text-xs text-[var(--nav-text-color)]">to</span>
 <CommitDateInput
 name="sheet-to-date"
 value={toDate}
 onChange={setToDate}
 className={compactDateInputClass}
 />
 </>
)}

 {dateMode ==="month" && (
 <div className="flex items-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] h-11">
 <button
 type="button"
 onClick={() => shiftMonth(-1)}
 aria-label="Previous month"
 className="h-full w-9 flex items-center justify-center text-lg font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)] transition-colors"
 >‹</button>
 <span className="min-w-[120px] text-center text-sm font-semibold text-[var(--foreground)]">
 {selectedMonth ? monthLabel(selectedMonth) : "—"}
 </span>
 <button
 type="button"
 onClick={() => shiftMonth(1)}
 aria-label="Next month"
 className="h-full w-9 flex items-center justify-center text-lg font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)] transition-colors"
 >›</button>
 </div>
)}

 {isRangeInvalid && (
 <span className="text-[11px] font-medium text-red-600">Invalid range</span>
)}
 </div>
);

 const dashboardData = useMemo(() => {
 const totalRoutes = filteredRoutes.length;
 const totalLoads = filteredRoutes.reduce((sum, route: any) => sum + (route.loads?.length || 0), 0);
 const cleanRoutes = filteredRoutes.filter((route: any) => getRouteRiskStatus(route).level ==="green").length;
 const riskRoutes = filteredRoutes.filter((route: any) => {
 const level = getRouteRiskStatus(route).level;
 return level ==="red" || level ==="yellow";
}).length;
 const finalizedRoutes = filteredRoutes.filter((route: any) => {
 const status = (route.status ||"planned").toLowerCase();
 return status ==="completed" || status ==="locked";
}).length;
 const avgRevenuePerRoute = totalRoutes > 0 ? kpiStats.totalRevenue / totalRoutes : 0;
 const avgLoadsPerRoute = totalRoutes > 0 ? totalLoads / totalRoutes : 0;
 const cleanRate = totalRoutes > 0 ? (cleanRoutes / totalRoutes) * 100 : 0;
 const finalizationRate = totalRoutes > 0 ? (finalizedRoutes / totalRoutes) * 100 : 0;

 const dateMap = new Map<string, { date: string; label: string; revenue: number; distance: number; routes: number; loads: number}>();
 const truckMap = new Map<string, number>();
 const clientMap = new Map<string, number>();
 const riskMap = new Map<string, { label: string; count: number; color: string}>([
 ["Incomplete", { label:"Incomplete", count: 0, color:"#ef4444"}],
 ["Missing KM", { label:"Missing KM", count: 0, color:"#f59e0b"}],
 ["Multi-drop", { label:"Multi-drop", count: 0, color:"#fbbf24"}],
 ["Multi-pick", { label:"Multi-pick", count: 0, color:"#fcd34d"}],
 ["Finalized", { label:"Finalized", count: 0, color:"#3b82f6"}],
 ["Clean", { label:"Clean", count: 0, color:"#22c55e"}],
]);

 filteredRoutes.forEach((route: any) => {
 const revenue = Number(route.rate) || 0;
 const distance = Number(route.kilometers) || 0;
 const routeLoads = route.loads?.length || 0;
 const dateKey = route.routeDate ||"Unknown";
 const dateLabel = route.routeDate ? route.routeDate.slice(5) :"N/A";
 const existingDate = dateMap.get(dateKey) || {
 date: dateKey,
 label: dateLabel,
 revenue: 0,
 distance: 0,
 routes: 0,
 loads: 0,
};
 existingDate.revenue += revenue;
 existingDate.distance += distance;
 existingDate.routes += 1;
 existingDate.loads += routeLoads;
 dateMap.set(dateKey, existingDate);

 const truckKey = route.truckFleetNoStr ||"Unassigned";
 truckMap.set(truckKey, (truckMap.get(truckKey) || 0) + revenue);

 const clientKey = route.client ||"Unassigned";
 clientMap.set(clientKey, (clientMap.get(clientKey) || 0) + revenue);

 const riskLabel = getRouteRiskStatus(route).label.replace(/^[^\w]+/,"").trim();
 const riskEntry = riskMap.get(riskLabel);
 if (riskEntry) riskEntry.count += 1;
});

 const timeline = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
 const topTrucks = Array.from(truckMap.entries())
 .map(([name, value]) => ({ name, value}))
 .sort((a, b) => b.value - a.value)
 .slice(0, 5);
 const topClients = Array.from(clientMap.entries())
 .map(([name, value]) => ({ name, value}))
 .sort((a, b) => b.value - a.value)
 .slice(0, 5);
 const riskDistribution = Array.from(riskMap.values()).filter((item) => item.count > 0);

 const bestDay = timeline.reduce<{ date: string; label: string; revenue: number} | null>((best, day) => {
 if (!best || day.revenue > best.revenue) return { date: day.date, label: day.label, revenue: day.revenue};
 return best;
}, null);
 const topTruck = topTrucks[0] || null;
 const topClient = topClients[0] || null;
 const splitIndex = Math.max(Math.ceil(timeline.length / 2), 1);
 const firstWindow = timeline.slice(0, splitIndex);
 const secondWindow = timeline.slice(splitIndex);
 const sumMetric = (items: typeof timeline, key:"revenue" |"distance" |"routes" |"loads") =>
 items.reduce((sum, item) => sum + item[key], 0);
 const calculateDelta = (current: number, previous: number) => {
 if (previous === 0) return current > 0 ? 100 : 0;
 return ((current - previous) / previous) * 100;
};
 const revenueDelta = calculateDelta(sumMetric(secondWindow,"revenue"), sumMetric(firstWindow,"revenue"));
 const distanceDelta = calculateDelta(sumMetric(secondWindow,"distance"), sumMetric(firstWindow,"distance"));
 const routesDelta = calculateDelta(sumMetric(secondWindow,"routes"), sumMetric(firstWindow,"routes"));
 const loadsDelta = calculateDelta(sumMetric(secondWindow,"loads"), sumMetric(firstWindow,"loads"));
 const riskToCleanRatio = cleanRoutes > 0 ? riskRoutes / cleanRoutes : riskRoutes > 0 ? riskRoutes : 0;
 const coverageScore = totalRoutes > 0 ? ((cleanRoutes + finalizedRoutes) / (totalRoutes * 2)) * 100 : 0;

 const riskSeries = timeline.map((item) => {
 const matchingRoutes = filteredRoutes.filter((route: any) => route.routeDate === item.date);
 const attention = matchingRoutes.filter((route: any) => {
 const level = getRouteRiskStatus(route).level;
 return level ==="red" || level ==="yellow";
}).length;
 return {
 label: item.label,
 value: attention,
};
});

 const kpiTiles = [
 {
 label:"Routes",
 value: dashboardDataValue(totalRoutes),
 subtext:`${totalLoads} loads`,
 delta: routesDelta,
 deltaGoodWhenPositive: true,
 accent:"from-slate-500/20 to-slate-100/10",
 line:"#334155",
 data: timeline.map((item) => ({ label: item.label, value: item.routes})),
},
 {
 label:"Revenue",
 value: formatCompactCurrency(kpiStats.totalRevenue),
 subtext:`${formatCompactCurrency(avgRevenuePerRoute)} avg`,
 delta: revenueDelta,
 deltaGoodWhenPositive: true,
 accent:"from-blue-500/20 to-cyan-100/10",
 line:"#2563eb",
 data: timeline.map((item) => ({ label: item.label, value: item.revenue})),
},
 {
 label:"Distance",
 value:`${formatCompactDistance(kpiStats.totalDistance)} km`,
 subtext: kpiStats.avgRPerKm > 0 ?`R ${kpiStats.avgRPerKm.toFixed(0)}/km` :"No km",
 delta: distanceDelta,
 deltaGoodWhenPositive: true,
 accent:"from-emerald-500/20 to-green-100/10",
 line:"#059669",
 data: timeline.map((item) => ({ label: item.label, value: item.distance})),
},
 {
 label:"Loads / Route",
 value: avgLoadsPerRoute.toFixed(1),
 subtext:`${totalLoads} total loads`,
 delta: loadsDelta,
 deltaGoodWhenPositive: true,
 accent:"from-violet-500/20 to-fuchsia-100/10",
 line:"#7c3aed",
 data: timeline.map((item) => ({ label: item.label, value: item.loads})),
},
 {
 label:"Coverage",
 value:`${coverageScore.toFixed(0)}%`,
 subtext:`${cleanRoutes} clean | ${finalizedRoutes} final`,
 delta: cleanRate - (100 - finalizationRate),
 deltaGoodWhenPositive: true,
 accent:"from-amber-500/20 to-yellow-100/10",
 line:"#d97706",
 data: timeline.map((item) => ({ label: item.label, value: item.routes > 0 ? (item.loads / item.routes) * 10 : 0})),
},
 {
 label:"Risk Ratio",
 value:`${riskToCleanRatio.toFixed(2)}x`,
 subtext:`${riskRoutes} need review`,
 delta: -riskRoutes,
 deltaGoodWhenPositive: true,
 accent:"from-rose-500/20 to-red-100/10",
 line:"#dc2626",
 data: riskSeries,
},
];

 const insights = [
 {
 title:"Best Day",
 value: bestDay ?`${bestDay.label} · ${formatCompactCurrency(bestDay.revenue)}` :"No revenue yet",
 tone:"text-emerald-700",
 badge: revenueDelta >= 0 ?`+${revenueDelta.toFixed(0)}%` :`${revenueDelta.toFixed(0)}%`,
},
 {
 title:"Top Truck",
 value: topTruck ?`${topTruck.name} · ${formatCompactCurrency(topTruck.value)}` :"No truck data",
 tone:"text-blue-700",
 badge: topTrucks.length > 1 ?`${(((topTruck?.value || 0) / (topTrucks[1]?.value || 1)) * 100).toFixed(0)} idx` :"Leader",
},
 {
 title:"Top Client",
 value: topClient ?`${topClient.name} · ${formatCompactCurrency(topClient.value)}` :"No client data",
 tone:"text-violet-700",
 badge: topClients.length > 0 ?`${((topClient?.value || 0) / Math.max(kpiStats.totalRevenue, 1) * 100).toFixed(0)}% mix` :"No mix",
},
 {
 title:"Attention",
 value:`${riskRoutes} route${riskRoutes === 1 ?"" :"s"} need attention`,
 tone: riskRoutes > 0 ?"text-amber-700" :"text-[var(--foreground)]",
 badge: cleanRate.toFixed(0) +"% clean",
},
];

 return {
 totalRoutes,
 totalLoads,
 cleanRoutes,
 riskRoutes,
 finalizedRoutes,
 avgRevenuePerRoute,
 avgLoadsPerRoute,
 cleanRate,
 finalizationRate,
 timeline,
 topTrucks,
 topClients,
 riskDistribution,
 kpiTiles,
 insights,
};
 // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filteredRoutes, kpiStats]);

 function dashboardDataValue(value: number) {
 return value >= 1000 ?`${(value / 1000).toFixed(1)}k` : value.toString();
}

 const handleExport = (type: 'csv' | 'excel' | 'json' | 'pdf') => {
 const rows = mapSheetsToExportRows(filteredRoutes);
 if (type === 'csv') exportCSV(rows);
 if (type === 'json') exportJSON(rows);
 if (type === 'excel') {
 const rangeStr = (startDate && endDate) ?`${startDate} to ${endDate}` : (filters.date ||"Single Day / All");
 const timestamp = new Date().toLocaleString();
 try {
 exportExcelWithTemplate(rows, { dateRange: rangeStr, generatedAt: timestamp});
 } catch {
 addToast("Failed to export Excel file. See console for details.", "error");
}
}
 if (type === 'pdf') {
 const rangeStr = (startDate && endDate) ?`${startDate} to ${endDate}` : (filters.date ||"Single Day / All");
 const timestamp = new Date().toLocaleString();
 exportPDF(rows, { dateRange: rangeStr, generatedAt: timestamp});
}
};

 // Export for the mobile route summary sheet — same exporters as the toolbar
 // dropdown, but scoped to the routes currently visible on screen.
 const handleExportVisibleRoutes = (type: 'csv' | 'excel' | 'json' | 'pdf') => {
 const rows = mapSheetsToExportRows(filteredRoutesMobile ?? []);
 if (rows.length === 0) { addToast("No routes to export.", "error"); return; }
 const rangeStr = dateMode === "single"
 ? (singleDate || "Sheets")
 : dateMode === "range"
 ? (fromDate && toDate ?`${fromDate} to ${toDate}` :"Sheets")
 : (selectedMonth || "Sheets");
 const timestamp = new Date().toLocaleString();
 try {
 if (type === 'csv') exportCSV(rows);
 else if (type === 'json') exportJSON(rows);
 else if (type === 'excel') exportExcelWithTemplate(rows, { dateRange: rangeStr, generatedAt: timestamp});
 else if (type === 'pdf') exportPDF(rows, { dateRange: rangeStr, generatedAt: timestamp});
 } catch {
 addToast("Failed to export. See console for details.", "error");
}
};  // Email the visible routes (Send Email button in the summary sheet's export
  // row) — HTML transport report in the body, no attachment.
  const handleSendSummaryEmail = async (recipientIds: Id<"recipients">[], subject: string) => {
  const rows = mapSheetsToExportRows(filteredRoutesMobile ?? []);
  if (rows.length === 0) { addToast("No routes to email.", "error"); return; }
  // Attach the driver photo for the email's transport report (the export rows
  // stay photo-free so storage URLs never reach CSV/Excel/JSON/PDF).
  const emailRows = rows.map((r) => {
   const photo = driverPhotoByName[String(r.driver).toLowerCase()];
   return {
   ...r,
   driverPhotoUrl: photo?.photoUrl || "",
   };
 });
 const rangeStr = dateMode === "single"
 ? (singleDate || "Sheets")
 : dateMode === "range"
 ? (fromDate && toDate ?`${fromDate} to ${toDate}` :"Sheets")
 : (selectedMonth || "Sheets");  try {
  await sendSummaryEmail({ recipientIds, subject, dateRange: rangeStr, rows: emailRows });
 addToast("Summary emailed.", "success");
 setShowEmailModal(false);
 } catch (error) {
 // Surface the real reason in the toast — mobile users can't open a console.
 addToast(`Failed to send email: ${error instanceof Error ? error.message : "unknown error"}`, "error");
 }
};

 const renderColumnResizeHandle = (key: ResizableTableColumnKey) => (
 <div
 onMouseDown={(e) => startColumnResize(key, e)}
 onDoubleClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 autoFitTableColumn(key);
}}
 className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none"
 title="Drag to resize, double-click to auto-fit"
 >
 <div className="absolute right-0 top-1/2 h-5 w-px -translate-y-1/2 bg-[var(--card-bg)] group-hover:bg-[#06B6D4]" />
 </div>
);

 const isDashboardFocusActive = (label: string) => {
 return [
 dashboardDrilldown.date?.label,
 dashboardDrilldown.truck?.label,
 dashboardDrilldown.client?.label,
 dashboardDrilldown.status?.label,
 dashboardDrilldown.sort?.label,
].includes(label);
};

 const clearDashboardTextFocus = (key:"truck" |"client", label: string) => {
 if (!isDashboardFocusActive(label)) return false;
 setDashboardDrilldown(prev => ({ ...prev, [key]: null}));
 return true;
};

 const clearDashboardStatusFocus = (label: string) => {
 if (!isDashboardFocusActive(label)) return false;
 setDashboardDrilldown(prev => ({ ...prev, status: null}));
 return true;
};

 const clearDashboardDateFocus = (label: string) => {
 if (!isDashboardFocusActive(label)) return false;
 setDashboardDrilldown(prev => ({ ...prev, date: null}));
 return true;
};

 const clearDashboardSortFocus = (label: string) => {
 if (!isDashboardFocusActive(label)) return false;
 setDashboardDrilldown(prev => ({ ...prev, sort: null}));
 return true;
};

 const dashboardDrilldownChips = [
 dashboardDrilldown.date ? { key:"date", label: dashboardDrilldown.date.label} : null,
 dashboardDrilldown.truck ? { key:"truck", label: dashboardDrilldown.truck.label} : null,
 dashboardDrilldown.client ? { key:"client", label: dashboardDrilldown.client.label} : null,
 dashboardDrilldown.status ? { key:"status", label: dashboardDrilldown.status.label} : null,
 dashboardDrilldown.sort ? { key:"sort", label: dashboardDrilldown.sort.label} : null,
].filter(Boolean) as Array<{ key:"date" |"truck" |"client" |"status" |"sort"; label: string}>;

 const dashboardChipMeta: Record<"date" |"truck" |"client" |"status" |"sort", { short: string; className: string}> = {
 date: { short:"DAY", className:"bg-blue-50 text-blue-700 border-blue-200"},
 truck: { short:"TRK", className:"bg-indigo-50 text-indigo-700 border-indigo-200"},
 client: { short:"CLI", className:"bg-violet-50 text-violet-700 border-violet-200"},
 status: { short:"RISK", className:"bg-amber-50 text-amber-700 border-amber-200"},
 sort: { short:"SORT", className:"bg-emerald-50 text-emerald-700 border-emerald-200"},
};

 const removeDashboardChip = (key:"date" |"truck" |"client" |"status" |"sort") => {
 setDashboardDrilldown(prev => ({ ...prev, [key]: null}));
};

 const clearDashboardLayer = () => {
 setDashboardDrilldown({
 date: null,
 truck: null,
 client: null,
 status: null,
 sort: null,
});
};

 const dashboardSnapshot = useMemo(() => summarizeRoutes(filteredRoutes), [filteredRoutes]);
 const baseSnapshot = useMemo(() => summarizeRoutes(baseRoutes), [baseRoutes]);
 const dashboardCompareStats = useMemo(() => {
 const buildShare = (current: number, base: number) => {
 if (base <= 0) return 0;
 return (current / base) * 100;
};

 return [
 {
 key:"routes",
 label:"Routes",
 current: dashboardSnapshot.routes,
 base: baseSnapshot.routes,
 share: buildShare(dashboardSnapshot.routes, baseSnapshot.routes),
},
 {
 key:"loads",
 label:"Loads",
 current: dashboardSnapshot.loads,
 base: baseSnapshot.loads,
 share: buildShare(dashboardSnapshot.loads, baseSnapshot.loads),
},
 {
 key:"revenue",
 label:"Revenue",
 current: dashboardSnapshot.revenue,
 base: baseSnapshot.revenue,
 share: buildShare(dashboardSnapshot.revenue, baseSnapshot.revenue),
},
 {
 key:"distance",
 label:"KM",
 current: dashboardSnapshot.distance,
 base: baseSnapshot.distance,
 share: buildShare(dashboardSnapshot.distance, baseSnapshot.distance),
},
];
}, [dashboardSnapshot, baseSnapshot]);
 const dashboardIntel = useMemo(() => {
 const topClientValue = dashboardData.topClients[0]?.value || 0;
 const topTruckValue = dashboardData.topTrucks[0]?.value || 0;
 const revenueBase = Math.max(dashboardSnapshot.revenue, 1);
 const routeBase = Math.max(dashboardSnapshot.routes, 1);
 const riskRate = (dashboardData.riskRoutes / routeBase) * 100;
 const topClientShare = (topClientValue / revenueBase) * 100;
 const topTruckShare = (topTruckValue / revenueBase) * 100;
 const revenueDensity = dashboardSnapshot.distance > 0 ? dashboardSnapshot.revenue / dashboardSnapshot.distance : 0;

 return [
 {
 key:"risk-pressure",
 label:"Risk Pressure",
 value:`${riskRate.toFixed(0)}%`,
 detail:`${dashboardData.riskRoutes} of ${dashboardSnapshot.routes} routes`,
 tone: riskRate >= 40 ?"text-rose-700 border-rose-200 bg-rose-50/70" : riskRate >= 20 ?"text-amber-700 border-amber-200 bg-amber-50/70" :"text-emerald-700 border-emerald-200 bg-emerald-50/70",
},
 {
 key:"client-concentration",
 label:"Client Concentration",
 value:`${topClientShare.toFixed(0)}%`,
 detail: dashboardData.topClients[0]?.name ||"No client leader",
 tone: topClientShare >= 50 ?"text-violet-700 border-violet-200 bg-violet-50/70" :"text-indigo-700 border-indigo-200 bg-indigo-50/70",
},
 {
 key:"truck-concentration",
 label:"Truck Concentration",
 value:`${topTruckShare.toFixed(0)}%`,
 detail: dashboardData.topTrucks[0]?.name ||"No truck leader",
 tone: topTruckShare >= 40 ?"text-blue-700 border-blue-200 bg-blue-50/70" :"text-sky-700 border-sky-200 bg-sky-50/70",
},
 {
 key:"revenue-density",
 label:"Revenue Density",
 value: revenueDensity > 0 ?`R ${revenueDensity.toFixed(2)}/km` :"--",
 detail:`${dashboardSnapshot.loads} loads in slice`,
 tone:"text-emerald-700 border-emerald-200 bg-emerald-50/70",
},
];
}, [dashboardData, dashboardSnapshot]);
 const dashboardAlerts = useMemo(() => {
 const riskBuckets = [...dashboardData.riskDistribution].sort((a, b) => b.count - a.count);
 const topRiskBucket = riskBuckets[0] || null;
 const topClient = dashboardData.topClients[0] || null;
 const topTruck = dashboardData.topTrucks[0] || null;
 const missingKmCount = filteredRoutes.filter((route: any) => getRouteRiskStatus(route).label ==="🟡 Missing KM").length;
 const incompleteCount = filteredRoutes.filter((route: any) => getRouteRiskStatus(route).label ==="🔴 Incomplete").length;
 const clientShare = dashboardSnapshot.revenue > 0 ? ((topClient?.value || 0) / dashboardSnapshot.revenue) * 100 : 0;
 const truckShare = dashboardSnapshot.revenue > 0 ? ((topTruck?.value || 0) / dashboardSnapshot.revenue) * 100 : 0;

 return [
 {
 key:"exception-leader",
 title:"Exception Leader",
 value: topRiskBucket ?`${topRiskBucket.label} ${topRiskBucket.count}` :"No open exceptions",
 detail: topRiskBucket ?"Click to isolate this risk bucket" :"No risk bucket active",
 className:"border-amber-200 bg-amber-50/70 text-amber-800",
},
 {
 key:"client-exposure",
 title:"Client Exposure",
 value: topClient ?`${topClient.name} ${clientShare.toFixed(0)}%` :"No client leader",
 detail: topClient ?"Click to isolate top client exposure" :"No client concentration",
 className: clientShare >= 50 ?"border-violet-200 bg-violet-50/70 text-violet-800" :"border-indigo-200 bg-indigo-50/70 text-indigo-800",
},
 {
 key:"truck-exposure",
 title:"Truck Exposure",
 value: topTruck ?`${topTruck.name} ${truckShare.toFixed(0)}%` :"No truck leader",
 detail: topTruck ?"Click to isolate top truck exposure" :"No truck concentration",
 className: truckShare >= 40 ?"border-blue-200 bg-blue-50/70 text-blue-800" :"border-sky-200 bg-sky-50/70 text-sky-800",
},
 {
 key:"data-gaps",
 title:"Data Gaps",
 value:`${missingKmCount + incompleteCount} open`,
 detail:`${missingKmCount} missing km · ${incompleteCount} incomplete`,
 className: missingKmCount + incompleteCount > 0 ?"border-rose-200 bg-rose-50/70 text-rose-800" :"border-emerald-200 bg-emerald-50/70 text-emerald-800",
},
];
}, [dashboardData, dashboardSnapshot, filteredRoutes]);

 const handleAlertClick = (key: string) => {
 if (key ==="exception-leader") {
 const topRiskBucket = [...dashboardData.riskDistribution].sort((a, b) => b.count - a.count)[0];
 if (topRiskBucket) handleRiskDistributionClick(topRiskBucket.label);
 return;
}
 if (key ==="client-exposure" && dashboardData.topClients[0]) {
 const label =`Dashboard: Client ${dashboardData.topClients[0].name}`;
 if (clearDashboardTextFocus("client", label)) return;
 setDashboardDrilldown(prev => ({ ...prev, client: { label, value: dashboardData.topClients[0]!.name}}));
 return;
}
 if (key ==="truck-exposure" && dashboardData.topTrucks[0]) {
 const label =`Dashboard: Truck ${dashboardData.topTrucks[0].name}`;
 if (clearDashboardTextFocus("truck", label)) return;
 setDashboardDrilldown(prev => ({ ...prev, truck: { label, value: dashboardData.topTrucks[0]!.name}}));
 return;
}
 if (key ==="data-gaps") {
 const label ="Dashboard: Data gaps";
 if (clearDashboardStatusFocus(label)) return;
 setDashboardDrilldown(prev => ({
 ...prev,
 status: { label, values: ["🔴 Incomplete","🟡 Missing KM"]},
}));
}
};

 const handleTimelineFocus = (point?: { date?: string; label?: string}, source:"Revenue Pulse" |"Throughput" ="Revenue Pulse") => {
 if (!point?.date) return;
 const label =`Dashboard: ${source} ${point.label ?? point.date}`;
 if (clearDashboardDateFocus(label)) return;
 setDashboardDrilldown(prev => ({ ...prev, date: { label, date: point.date!}}));
};

 const handleInsightClick = (title: string) => {
 if (title ==="Best Day" && dashboardData.timeline.length > 0) {
 const bestDay = dashboardData.timeline.reduce((best, day) => (day.revenue > best.revenue ? day : best), dashboardData.timeline[0]);
 const label =`Dashboard: Best day ${bestDay.label}`;
 if (clearDashboardDateFocus(label)) return;
 setDashboardDrilldown(prev => ({ ...prev, date: { label, date: bestDay.date}}));
 return;
}
 if (title ==="Top Truck" && dashboardData.topTrucks[0]) {
 const label =`Dashboard: Truck ${dashboardData.topTrucks[0].name}`;
 if (clearDashboardTextFocus("truck", label)) return;
 setDashboardDrilldown(prev => ({ ...prev, truck: { label, value: dashboardData.topTrucks[0]!.name}}));
 return;
}
 if (title ==="Top Client" && dashboardData.topClients[0]) {
 const label =`Dashboard: Client ${dashboardData.topClients[0].name}`;
 if (clearDashboardTextFocus("client", label)) return;
 setDashboardDrilldown(prev => ({ ...prev, client: { label, value: dashboardData.topClients[0]!.name}}));
 return;
}
 if (title ==="Attention") {
 const label ="Dashboard: Attention routes";
 if (clearDashboardStatusFocus(label)) return;
 setDashboardDrilldown(prev => ({ ...prev, status: { label, values: attentionStatuses}}));
}
};

 const handleKpiTileClick = (label: string) => {
 if (label ==="Revenue") {
 if (isDashboardFocusActive("Dashboard: Top revenue routes")) {
 clearDashboardSortFocus("Dashboard: Top revenue routes");
 return;
}
 setDashboardDrilldown(prev => ({
 ...prev,
 sort: { label:"Dashboard: Top revenue routes", column:"amount", direction:"desc"},
}));
 return;
}
 if (label ==="Coverage") {
 const focusLabel ="Dashboard: Clean + finalized";
 if (clearDashboardStatusFocus(focusLabel)) return;
 setDashboardDrilldown(prev => ({ ...prev, status: { label: focusLabel, values: ["🟢 Clean","🔵 Finalized"]}}));
 return;
}
 if (label ==="Risk Ratio") {
 const focusLabel ="Dashboard: Risk routes";
 if (clearDashboardStatusFocus(focusLabel)) return;
 setDashboardDrilldown(prev => ({ ...prev, status: { label: focusLabel, values: attentionStatuses}}));
}
};

 const handleRiskDistributionClick = (label: string) => {
 const mapped = dashboardStatusMap[label];
 if (!mapped) return;
 const focusLabel =`Dashboard: ${label}`;
 if (clearDashboardStatusFocus(focusLabel)) return;
 setDashboardDrilldown(prev => ({ ...prev, status: { label: focusLabel, values: [mapped]}}));
};

 // ── Route detail overlay (shared desktop/mobile) ─────────────────────────
 // The route detail/edit side panel and the confirmation dialog are rendered
 // on BOTH the desktop grid and the mobile card view (tapping a mobile card
 // opens the same panel). Defined once here so phones get the exact same
 // overlay — same state, same delete/confirm flow. On a phone the max-w-xl
 // panel is wider than the screen, so it naturally fills the viewport.
 const routeDetailOverlay = (
   <>
     {/* ── Route Detail Side Panel ── */}
     {selectedRoute && (
       <div className="fixed inset-0 z-50 flex pointer-events-none">
         {/* backdrop — blurs the background, click to close */}
         <div
           className="flex-1 pointer-events-auto backdrop-blur-sm bg-black/20 animate-in fade-in duration-200"
           onClick={closePanel}
         />

         {/* panel — solid background */}
         <div data-testid="route-detail-panel" className="w-full max-w-xl bg-[var(--background)] border-l border-[var(--card-border)] flex flex-col h-full shadow-2xl pointer-events-auto overflow-hidden animate-in fade-in duration-200">
           {/* header */}
           <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--card-border)]">
             <div className="flex items-center gap-2 min-w-0">
               {panelView !== "detail" && (
                 <button
                   onClick={backToDetail}
                   aria-label="Back to route details"
                   className="text-[var(--nav-text-color)] hover:text-[var(--foreground)] text-lg font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--card-bg)]/60 transition-colors shrink-0"
                 >
                   ←
                 </button>
               )}
               <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)] truncate">
                 {panelView === "edit" ? "Edit Route" : panelView === "analytics" ? "Analytics" : `Truck ${selectedRoute.truckFleetNoStr ?? "—"} · ${selectedRoute.routeDate}`}
               </h2>
             </div>
             <button
               onClick={closePanel}
               aria-label="Close panel"
               className="text-[var(--nav-text-color)] hover:text-[var(--foreground)] text-lg font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--card-bg)]/60 transition-colors shrink-0"
             >
               ✕
             </button>
           </div>

           {/* scrollable body — detail, edit, or analytics view */}
           <div className="flex-1 overflow-x-hidden overflow-y-auto">
             {panelView === "edit" ? (
               <EditRouteForm routeId={selectedRoute._id} onSuccess={backToDetail} onCancel={backToDetail} />
             ) : panelView === "analytics" ? (
               <RouteAnalyticsView route={selectedRoute} onBarClick={openPanel} />
             ) : (
               <RouteDetailsCard
                 route={selectedRoute}
                 isLocked={(selectedRoute.status ?? "planned") === "locked"}
                 mode="primary"
                 onDrillDown={openPanel}
                 onAnalytics={openAnalyticsView}
                 actionLoading={actionLoading}
                 onStatusChange={handleStatusChange}
                 onDelete={handleDelete}
                 onEdit={openEditView}
               />
             )}
           </div>
         </div>
       </div>
     )}

     {/* Confirmation Dialog */}
     {confirmDialog.isOpen && (
       <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
         <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 scale-100">
           <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">{confirmDialog.title}</h3>
           <p className="text-sm text-[var(--nav-text-color)] mb-6">{confirmDialog.message}</p>
           <div className="flex justify-end gap-3">
             <button
               onClick={closeConfirm}
               className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] hover:bg-[var(--card-bg)] rounded-md transition-colors"
               disabled={confirmDialog.isLoading}
             >
               Cancel
             </button>
             <button
               onClick={confirmDialog.onConfirm}
               disabled={confirmDialog.isLoading}
               className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 ${
                 confirmDialog.confirmStyle === "danger" ? "bg-red-600 hover:bg-red-700 focus:ring-red-500" :
                 confirmDialog.confirmStyle === "neutral" ? "bg-[var(--card-bg)] hover:bg-black focus:ring-gray-500" :
                 "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm hover:opacity-90 focus:ring-[#06B6D4]"
               }`}
             >
               {confirmDialog.isLoading && (
                 <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
               )}
               {confirmDialog.isLoading ? "Processing..." : confirmDialog.confirmText}
             </button>
           </div>
         </div>
       </div>
     )}
   </>
 );

 // ── Mobile view ──────────────────────────────────────────────────────────
 // On phones (<768px) the desktop grid is replaced by a purpose-built card
 // screen: routes grouped by day, with search + filters and date navigation.
 // Tablets/desktop keep the full grid untouched. All filter/sort/date state
 // is shared with the desktop view above (and persists via SHEETS_UI_KEY).
 if (isMobile) {
   return (
     <>
       <MobileSheetsView
         routes={filteredRoutesMobile ?? []}
         loading={!routes && !isOffline}
         filters={filters}
         updateFilter={updateFilter}
         quickSearch={quickSearch}
         setQuickSearch={setQuickSearch}
         sortConfig={sortConfig}
         setSortConfig={setSortConfig}
         clearFilters={clearFilters}
         dateMode={dateMode}
         setDateMode={setDateMode}
         singleDate={singleDate}
         setSingleDate={setSingleDate}
         fromDate={fromDate}
         setFromDate={setFromDate}
         toDate={toDate}
         setToDate={setToDate}
         selectedMonth={selectedMonth}
         setSelectedMonth={setSelectedMonth}
         syncDateToUrl={syncDateToUrl}
         riskStatusOf={getRouteRiskStatus}
         onRouteTap={openPanel}
         onOpenRouteSummary={() => setShowRouteSummary(true)}
         routeDetailOpen={!!selectedRoute}
       />
       {routeDetailOverlay}

       {/* ── Route Summary bottom sheet ──
           Opened from the graph icon on the floating restore pill, which is
           available as soon as the mobile screen is minimized. Summarizes the
           routes currently visible on screen (aggregate KPIs, revenue by
           route, status mix) and exports all of them (CSV / Excel / JSON /
           PDF). */}
       {showRouteSummary && (
         <div className="fixed inset-0 z-[70] flex flex-col justify-end">
           <div
             className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
             onClick={() => setShowRouteSummary(false)}
           />
           <div
             className="relative bg-[var(--background)] rounded-t-2xl border-t border-[var(--card-border)] shadow-2xl max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
             style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
           >
             <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-[var(--card-border)]">
               <div className="min-w-0">
                 <h3 className="text-base font-black tracking-tight text-[var(--foreground)]">Route Summary</h3>
                 <p className="text-[11px] text-[var(--nav-text-color)] mt-0.5 truncate">
                   {filteredRoutesMobile?.length ?? 0} route{(filteredRoutesMobile?.length ?? 0) === 1 ? "" : "s"} visible
                 </p>
               </div>
               <button
                 onClick={() => setShowRouteSummary(false)}
                 aria-label="Close route summary"
                 className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
               >
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                   <path d="M18 6 6 18" />
                   <path d="m6 6 12 12" />
                 </svg>
               </button>
             </div>

             <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
               <RoutesSummaryView
                 routes={filteredRoutesMobile ?? []}
                 riskStatusOf={getRouteRiskStatus}
               />
             </div>

             <div className="px-5 py-3 border-t border-[var(--card-border)]">
               <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--nav-text-color)] mb-2">
                 Export route data
               </p>
               <div className="grid grid-cols-4 gap-2">
                 {                   ([
                     ["excel", "xlsx", "text-green-600", "Excel"],
                     ["csv", "csv", "text-blue-600", "CSV"],
                     ["json", "json", "text-yellow-600", "JSON"],
                     ["pdf", "pdf", "text-red-600", "PDF Dashboard"],
                   ] as const).map(([type, ext, color, label]) => (
                     <button
                       key={type}
                       onClick={() => handleExportVisibleRoutes(type)}
                       title={type === "pdf" ? "Export a 1-page PDF dashboard of the visible routes" : undefined}
                       className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--card-bg)] active:scale-[0.98] transition-all"
                     >
                       <span className={`${color} font-black text-sm leading-none`}>{ext}</span>
                       <span className="text-[10px] font-semibold uppercase tracking-wide leading-tight text-center">{label}</span>
                     </button>
                   ))}
               </div>

               <button
                 onClick={() => setShowEmailModal(true)}
                 aria-label="Send email report"
                 className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#06B6D4]/40 text-[#06B6D4] hover:bg-[rgba(6,182,212,0.08)] active:scale-[0.98] transition-all text-xs font-bold"
               >
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M22 2 11 13" />
                   <path d="M22 2 15 22l-4-9-9-4Z" />
                 </svg>
                 Send Email
               </button>
             </div>
           </div>
         </div>
       )}

       <SendSummaryEmailModal
         isOpen={showEmailModal}
         onClose={() => setShowEmailModal(false)}
         initialSubject={`Route Summary: ${dateMode === "single"
           ? (singleDate || "Sheets")
           : dateMode === "range"
           ? (fromDate && toDate ?`${fromDate} to ${toDate}` :"Sheets")
           : (selectedMonth || "Sheets")}`}
         onSend={handleSendSummaryEmail}
       />
     </>
   );
 }

 return (
 <div className="h-full min-h-0 flex flex-col relative overflow-x-clip">
 {isOffline && (
 <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm">
 <span aria-hidden>📴</span>
 <span>
 Offline — {cachedRoutes ? `showing cached routes${offlineCachedRange ? ` for ${offlineCachedRange}` : ""}${offlineCachedAt ? ` (synced ${new Date(offlineCachedAt).toLocaleTimeString()})` : ""}` : "no cached data available"}
 </span>
 </div>
 )}
 {!tableOnly && (
 <div className="flex-shrink-0 space-y-4 relative">
 {/* Sticky Header Wrapper */}
 <div className={`${isHeaderCompact ?"sticky top-0 z-10" :"relative"} bg-[var(--card-bg)]/60 -mx-4 px-4 pt-4 pb-2 border-b border-[var(--card-border)] shadow-sm mb-4 rounded-b-xl`}>
 {/* A. Header */}
 <div className="mb-4 flex items-center justify-between">
 <div className="flex items-center gap-3">
 <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
 Sheets
 </h1>
 <p className="text-[var(--nav-text-color)] text-xs">
 Read-only operational view
 </p>
 </div>
 <div className="flex items-center gap-1.5">
 {/* Table-only toggle: hide filters/sort, show just the table */}
 <button
   onClick={() => setTableOnly(true)}
   className="p-3 rounded-md text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
   title="Hide filters and sort — show only the table"
   aria-label="Hide filters and sort (show only the table)"
 >
   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
     <rect x="3" y="3" width="18" height="18" rx="2"></rect>
     <line x1="9" y1="3" x2="9" y2="21"></line>
     <line x1="3" y1="9" x2="21" y2="9"></line>
     <line x1="3" y1="15" x2="21" y2="15"></line>
   </svg>
 </button>
 {/* KPI summary toggle */}
 <button
   onClick={() => setSummaryCollapsed((c) => !c)}
   className={`p-3 rounded-md transition-colors ${
     summaryCollapsed
       ? "text-[var(--nav-text-color)] opacity-50"
       : "text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"
   }`}
   title={summaryCollapsed ? "Show KPI/chart summary" : "Hide KPI/chart summary"}
 >
   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
     <line x1="12" y1="20" x2="12" y2="10"></line>
     <line x1="18" y1="20" x2="18" y2="4"></line>
     <line x1="6" y1="20" x2="6" y2="16"></line>
   </svg>
 </button>

 {/* Collapse button */}
 <button
   onClick={() => setIsHeaderCompact(!isHeaderCompact)}
   className="p-3 rounded-md text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
   title={isHeaderCompact ?"Expand" :"Collapse"}
 >
   {isHeaderCompact ? (
     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
       <polyline points="6 9 12 15 18 9"></polyline>
     </svg>
   ) : (
     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
       <polyline points="18 15 12 9 6 15"></polyline>
     </svg>
   )}
 </button>
 </div>
 </div>  {/* B. Date selector & Export */}
  {!isHeaderCompact && (
  <div className="mb-3 overflow-x-auto pb-1">
 <div className="grid min-w-[1180px] grid-cols-12 gap-3">
 <div className="col-span-3 bg-[var(--card-bg)]/60 p-2.5 rounded-lg border border-[var(--card-border)] shadow-sm">
 {/* Mode Selector */}
 <div className="flex gap-3 mb-2 text-sm">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="sheet-date-mode"
 checked={dateMode ==="single"}
 onChange={() => setDateMode("single")}
 className="h-3 w-3 text-black focus:ring-[#06B6D4]"
 />
 <span className="text-xs font-medium text-[var(--foreground)]">Date</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="sheet-date-mode"
 checked={dateMode ==="range"}
 onChange={() => setDateMode("range")}
 className="h-3 w-3 text-black focus:ring-[#06B6D4]"
 />
 <span className="text-xs font-medium text-[var(--foreground)]">Range</span>
 </label>
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="radio"
 name="sheet-date-mode"
 checked={dateMode ==="month"}
 onChange={() => setDateMode("month")}
 className="h-3 w-3 text-black focus:ring-[#06B6D4]"
 />
 <span className="text-xs font-medium text-[var(--foreground)]">Month</span>
 </label>
 </div> {/* Single Mode Input */}
 {dateMode ==="single" && (
 <div>
 <CommitDateInput
 name="filter-single-date"
 value={singleDate}
 onChange={handleSingleDateChange}
 className="w-full border border-[var(--card-border)] rounded-md px-3 py-2 text-sm bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent"
 />
 </div>
)}

 {/* Range Mode Inputs */}
 {dateMode ==="range" && (
 <div className="space-y-1.5">
 <div className="flex gap-2 items-center">
 <div>
 <CommitDateInput
 name="filter-from-date"
 value={fromDate}
 onChange={setFromDate}
 className="border border-[var(--card-border)] rounded-md px-3 py-2 text-sm bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent"
 />
 </div>
 <span className="text-[var(--nav-text-color)] text-xs">→</span>
 <div>
 <CommitDateInput
 name="filter-to-date"
 value={toDate}
 onChange={setToDate}
 className="border border-[var(--card-border)] rounded-md px-3 py-2 text-sm bg-[var(--card-bg)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent"
 />
 </div>
 </div>
 {isRangeInvalid && (
 <p className="text-xs text-red-600 font-medium animate-pulse">
 ⚠ From date cannot be after To date
 </p>
 )}
 </div>
)}

 {/* Month Mode Stepper */}
 {dateMode ==="month" && (
 <div className="flex items-center border border-[var(--card-border)] rounded-md bg-[var(--card-bg)] overflow-hidden">
 <button
 type="button"
 onClick={() => shiftMonth(-1)}
 aria-label="Previous month"
 className="h-10 px-3 flex items-center justify-center text-lg font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]/40 transition-colors"
 >‹</button>
 <span className="flex-1 min-w-0 text-center text-sm font-semibold text-[var(--foreground)] px-2">
 {selectedMonth ? monthLabel(selectedMonth) : "—"}
 </span>
 <button
 type="button"
 onClick={() => shiftMonth(1)}
 aria-label="Next month"
 className="h-10 px-3 flex items-center justify-center text-lg font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)]/40 transition-colors"
 >›</button>
 </div>
)}
 </div>

 <div className="col-span-8 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-3 py-2 shadow-sm">
 <div className="grid h-full grid-cols-4 gap-2">
 {dashboardData.insights.map((item) => (
 (() => {
 const focusLabel =
 item.title ==="Top Truck" && dashboardData.topTrucks[0]
 ?`Dashboard: Truck ${dashboardData.topTrucks[0].name}`
 : item.title ==="Top Client" && dashboardData.topClients[0]
 ?`Dashboard: Client ${dashboardData.topClients[0].name}`
 : item.title ==="Attention"
 ?"Dashboard: Attention routes"
 : item.title ==="Best Day" && dashboardData.timeline.length > 0
 ?`Dashboard: Best day ${dashboardData.timeline.reduce((best, day) => (day.revenue > best.revenue ? day : best), dashboardData.timeline[0]).label}`
 : null;
 const isActive = focusLabel ? isDashboardFocusActive(focusLabel) : false;
 return (
 <button
 key={item.title}
 type="button"
 onClick={() => handleInsightClick(item.title)}
 title={item.title ==="Best Day" ?"Focus this day" :"Click to focus, click again to clear"}
 className={`flex min-w-0 flex-col justify-center rounded-md border px-3 py-2.5 text-left transition ${
 isActive
 ?"border-blue-300 bg-blue-50/70 ring-1 ring-blue-300"
 :"border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg)] /40 "
}`}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--nav-text-color)]">{item.title}</div>
 <div className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--nav-text-color)]">
 {item.badge}
 </div>
 </div>
 <div className={`mt-1 truncate text-xs font-semibold ${item.tone}`}>{item.value}</div>
 </button>
);
})()
))}
 </div>
 </div>  </div>
  </div>
)}

  {/* ── Table Controls Toolbar ── */}
  {isMounted && !isLoading && (
  <div className="mb-3 flex flex-col gap-2">
  {/* Quick Search + Clear Filters */}
  <div className="flex items-center gap-2">
  <div className="relative flex-1">
  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--nav-text-color)] pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <circle cx="11" cy="11" r="8"></circle>
  <path d="M21 21l-4.35-4.35"></path>
  </svg>
 <input
 type="text"
 name="sheet-quick-search"
 placeholder="Search across all fields..."
 value={quickSearch}
 onChange={(e) => setQuickSearch(e.target.value)}
 className="w-full pl-9 pr-3 h-11 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-sm text-[var(--foreground)] placeholder:text-[var(--nav-text-color)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent transition-all"
 />
  {quickSearch && (
  <button
  onClick={() => setQuickSearch('')}
  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
  >
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
  </button>
  )}
  </div>
  <button
  onClick={clearFilters}
  title="Clear all filters, search, and date range"
  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-2.5 text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
  >
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M3 6h18"></path>
  <path d="M7 12h10"></path>
  <path d="M10 18h4"></path>
  </svg>
  <span className="hidden sm:inline">Clear</span>
  </button>
  </div>
  
  {/* Action Buttons */}
  <div className="flex items-center gap-1.5 flex-wrap">
  {/* Column Picker */}
  <button
  onClick={() => setShowColumnPicker(!showColumnPicker)}
  title="Toggle columns"
  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4] ${
  showColumnPicker
  ? 'bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white border-transparent'
  : 'border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]'
  }`}
  >
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
  <line x1="9" y1="3" x2="9" y2="21"></line>
  </svg>
  </button>
  
  {/* Auto-fit All */}
  <button
  onClick={() => {
  (Object.keys(TABLE_COLUMN_LABELS) as ResizableTableColumnKey[]).forEach(key => {
  autoFitTableColumn(key);
  });
  }}
  title="Auto-fit all columns"
  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
  >
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M8 3H5a2 2 0 00-2 2v14a2 2 0 002 2h3"></path>
  <path d="M16 3h3a2 2 0 012 2v14a2 2 0 01-2 2h-3"></path>
  <path d="M12 8l-3 3 3 3"></path>
  <path d="M9 11h6"></path>
  </svg>
  </button>
  
  {/* Reset Columns */}
  <button
  onClick={resetTableColumnWidths}
  title="Reset column widths"
  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
  >
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M1 4v6h6"></path>
  <path d="M3.51 15a9 9 0 102.13-9.36L1 10"></path>
  </svg>
  </button>
  
  <div className="w-px h-6 bg-[var(--card-border)] mx-1"></div>
  
  {/* Density Toggle */}
  <button
  onClick={() => setTableDensity(prev => prev === 'comfortable' ? 'compact' : 'comfortable')}
  title={`Switch to ${tableDensity === 'comfortable' ? 'compact' : 'comfortable'} view`}
  className={`flex h-9 items-center gap-1.5 px-2.5 rounded-lg border transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-[#06B6D4] ${
  tableDensity === 'compact'
  ? 'bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white border-transparent'
  : 'border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]'
  }`}
  >
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <line x1="3" y1="6" x2="21" y2="6"></line>
  <line x1="3" y1="12" x2="21" y2="12"></line>
  <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
  <span className="text-[10px] font-semibold tracking-wider">{tableDensity === 'compact' ? 'Compact' : 'Comfort'}</span>
  </button>
  
  {/* Table Only — hide filters/sort, show just the table */}
  <button
  onClick={() => setTableOnly(true)}
  title="Hide filters and sort — show only the table"
  className="flex h-9 items-center gap-1.5 px-2.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
  >
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <rect x="3" y="3" width="18" height="18" rx="2"></rect>
  <line x1="9" y1="3" x2="9" y2="21"></line>
  <line x1="3" y1="9" x2="21" y2="9"></line>
  <line x1="3" y1="15" x2="21" y2="15"></line>
  </svg>
  <span className="text-[10px] font-semibold tracking-wider">Table only</span>
  </button>
  
  <div className="w-px h-6 bg-[var(--card-border)] mx-1"></div>
  
  {/* Clear Filters */}
  <button
  onClick={clearFilters}
  title="Clear all filters"
  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
  >
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M3 6h18"></path>
  <path d="M7 12h10"></path>
  <path d="M10 18h4"></path>
  </svg>
  </button>
  
  {/* Import */}
  <button
  onClick={() => setIsImportModalOpen(true)}
  title="Import loads"
  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
  >
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M12 21V9"></path>
  <path d="M7 14l5-5 5 5"></path>
  <path d="M5 3h14"></path>
  </svg>
  </button>
  
  {/* Export */}
  <ExportDropdown compact onExport={handleExport} />
  </div>
  </div>
  )}
  
  {/* ── Active Filter Pills ── */}
  {(() => {
  const activeFilters: { key: string; label: string; onClear: () => void }[] = [];
  if (filters.region) activeFilters.push({ key: "region", label: `Region: ${REGION_META[filters.region]?.label ?? filters.region}`, onClear: () => updateFilter("region", "") });
  if (filters.truck) activeFilters.push({ key: "truck", label: `Truck: ${filters.truck}`, onClear: () => updateFilter("truck", "") });
  if (filters.trailer) activeFilters.push({ key: "trailer", label: `Trailer: ${filters.trailer}`, onClear: () => updateFilter("trailer", "") });
  if (filters.client) activeFilters.push({ key: "client", label: `Client: ${filters.client}`, onClear: () => updateFilter("client", "") });
  if (filters.driver) activeFilters.push({ key: "driver", label: `Driver: ${filters.driver}`, onClear: () => updateFilter("driver", "") });
  if (filters.status.length > 0) activeFilters.push({ key: "status", label: `Status (${filters.status.length})`, onClear: () => updateFilter("status", []) });
  if (quickSearch) activeFilters.push({ key: "search", label: `Search: "${quickSearch}"`, onClear: () => setQuickSearch("") });
  if (dashboardDrilldown.date) activeFilters.push({ key: "drill-date", label: `📅 ${dashboardDrilldown.date.label}`, onClear: () => setDashboardDrilldown(prev => ({ ...prev, date: null })) });
  if (dashboardDrilldown.truck) activeFilters.push({ key: "drill-truck", label: `🚛 ${dashboardDrilldown.truck.label}`, onClear: () => setDashboardDrilldown(prev => ({ ...prev, truck: null })) });
  if (dashboardDrilldown.client) activeFilters.push({ key: "drill-client", label: `🏢 ${dashboardDrilldown.client.label}`, onClear: () => setDashboardDrilldown(prev => ({ ...prev, client: null })) });
  if (dashboardDrilldown.status) activeFilters.push({ key: "drill-status", label: `🎯 ${dashboardDrilldown.status.label}`, onClear: () => setDashboardDrilldown(prev => ({ ...prev, status: null })) });
  
  if (activeFilters.length === 0) return null;
  return (
  <div className="flex flex-wrap items-center gap-1.5 mb-4 px-0.5">
  {activeFilters.map(f => (
  <span key={f.key} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[rgba(6,182,212,0.08)] text-[#06B6D4] border border-[rgba(6,182,212,0.15)] shadow-sm">
  {f.label}
  <button onClick={f.onClear} className="hover:text-white transition-colors" title={`Clear ${f.key} filter`}>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
  </button>
  </span>
  ))}
  {activeFilters.length > 1 && (
  <button onClick={clearFilters} className="text-xs text-[var(--nav-text-color)] hover:text-[var(--foreground)] underline ml-1">
  Clear all
  </button>
  )}
  </div>
  );
  })()}
  
  {/* ── Bulk Action Bar ── */}
  {selectedRouteIds.size > 0 && (
  <div className="mb-4 animate-in fade-in slide-in-from-top-2">
  <div className="bg-gradient-to-r from-[#0B1220] to-[#1A2332] backdrop-blur-sm text-white px-5 py-3 rounded-xl flex items-center justify-between shadow-lg border border-white/10">
  <div className="flex items-center gap-4">
  <span className="text-sm font-semibold">{selectedRouteIds.size} route{selectedRouteIds.size === 1 ? '' : 's'} selected</span>
  <div className="h-5 w-px bg-white/20" />
  <button
  onClick={() => setSelectedRouteIds(new Set())}
  className="text-sm text-white/50 hover:text-white transition-colors"
  >
  Deselect all
  </button>
  </div>
  <div className="flex items-center gap-2">
  <button
  onClick={async () => {
  const ids = Array.from(selectedRouteIds) as Id<"dailyRoutes">[];
  for (const id of ids) {
  try { await lockRoute({ id, token }); } catch {}
  }
  setSelectedRouteIds(new Set());
  }}
  title="Lock all selected routes"
  className="px-4 py-2.5 text-sm font-bold rounded-lg border border-white/20 text-white/80 hover:text-white hover:bg-white/5 transition-all"
  >
  🔒 Lock All
  </button>
  <button
  onClick={handleBulkDelete}
  title="Delete all selected routes"
  className="px-4 py-2.5 text-sm font-bold rounded-lg bg-red-500/80 text-white hover:bg-red-500 transition-all"
  >
  🗑 Delete
  </button>
  </div>
  </div>
  </div>
  )}

 {/* KPI Summary Bar (TRAE-ADDED) */}
 {isMounted && !isLoading && (
 <>  {/* Expanded View */}
  {!isHeaderCompact && !summaryCollapsed && (
  <div className="mb-4">
 <div className="overflow-auto rounded-lg pb-1">
 <div className="grid min-h-[164px] min-w-[1240px] grid-cols-12 gap-2">
 <div className="col-span-3 grid min-h-[164px] grid-cols-2 gap-1.5">
 {dashboardData.kpiTiles.map((card) => {
 const isPositive = card.delta >= 0;
 const deltaGood = card.deltaGoodWhenPositive ? isPositive : !isPositive;
 const deltaClass = deltaGood ?"text-emerald-700 bg-emerald-50 border border-emerald-200/80" :"text-rose-700 bg-rose-50 border border-rose-200/80";
 const isInteractive = ["Revenue","Coverage","Risk Ratio"].includes(card.label);
 const isActive =
 (card.label ==="Revenue" && isDashboardFocusActive("Dashboard: Top revenue routes")) ||
 (card.label ==="Coverage" && isDashboardFocusActive("Dashboard: Clean + finalized")) ||
 (card.label ==="Risk Ratio" && isDashboardFocusActive("Dashboard: Risk routes"));
 return (
 <button
 key={card.label}
 type="button"
 onClick={() => isInteractive && handleKpiTileClick(card.label)}
 title={isInteractive ?"Click to focus, click again to clear" : undefined}
 className={`flex flex-col justify-between rounded-xl border bg-[var(--card-bg)]/60 p-2 text-left shadow-sm backdrop-blur-[8px] ${
 isActive
 ?"border-[#06B6D4] ring-1 ring-[#06B6D4]/30"
 :"border-[var(--card-border)]"
} ${isInteractive ?"transition duration-150 hover:border-[var(--card-border)] hover:bg-[var(--card-bg)]/80 hover:shadow-md" :"cursor-default"}`}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">{card.label}</div>
 <div className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${deltaClass}`}>
 {isPositive ?"+" :""}{card.delta.toFixed(0)}%
 </div>
 </div>
 <div className="text-sm font-bold text-[var(--foreground)] leading-tight">{card.value}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] truncate italic">{card.subtext}</div>
 <div className="h-5">
 <ResponsiveContainer width="100%" height="100%">
 <LineChart data={card.data}>
 <Line
 type="monotone"
 dataKey="value"
 stroke={card.line}
 strokeWidth={2}
 dot={false}
 isAnimationActive={false}
 />
 </LineChart>
 </ResponsiveContainer>
 </div>
 </button>
)})}
 </div>

 <div className="col-span-5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-2.5 shadow-sm">
 <div className="mb-2 flex items-start justify-between">
 <div>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">Revenue Pulse</h3>
 <p className="text-[10px] text-[var(--nav-text-color)]">Trend in current selection</p>
 </div>
 <div className="text-right">
 <div className="text-[10px] uppercase tracking-wider text-[var(--nav-text-color)]">Best Day</div>
 <button
 type="button"
 onClick={() => handleInsightClick("Best Day")}
 className="text-xs font-bold text-emerald-700 hover:underline"
 >
 {dashboardData.insights[0]?.value ??"No data"}
 </button>
 </div>
 </div>
 <div className="h-[118px] cursor-pointer">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart
 data={dashboardData.timeline}
 onClick={(state: any) => handleTimelineFocus(state?.activePayload?.[0]?.payload,"Revenue Pulse")}
 >
 <defs>
 <linearGradient id="sheetsRevenueFill" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" vertical={false} />
 <XAxis dataKey="label" tick={{ fontSize: 9, fill:"#6b7280"}} axisLine={false} tickLine={false} />
 <YAxis hide />
 <Tooltip formatter={((value: number | undefined) => formatZAR(Number(value ?? 0))) as any} />
 <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#sheetsRevenueFill)" strokeWidth={2} activeDot={{ r: 5, fill:"#2563eb", stroke:"#ffffff", strokeWidth: 2}} />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 <div className="mt-1 grid grid-cols-3 gap-1.5">
 <div className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-1">
 <div className="text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Net</div>
 <div className="text-[10px] font-semibold text-[var(--foreground)]">{formatCompactCurrency(kpiStats.totalRevenue)}</div>
 </div>
 <div className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-1">
 <div className="text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Avg</div>
 <div className="text-[10px] font-semibold text-blue-700">{formatCompactCurrency(dashboardData.avgRevenuePerRoute)}</div>
 </div>
 <div className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-1">
 <div className="text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">R/KM</div>
 <div className="text-[10px] font-semibold text-emerald-700">{kpiStats.avgRPerKm > 0 ?`R ${kpiStats.avgRPerKm.toFixed(2)}` :"--"}</div>
 </div>
 </div>
 <div className="mt-1 text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Click chart points to focus that day</div>
 </div>

 <div className="col-span-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-2.5 shadow-sm">
 <div className="mb-2">
 <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">Throughput</h3>
 <p className="text-[10px] text-[var(--nav-text-color)]">Daily km moved</p>
 </div>
 <div className="h-[118px] cursor-pointer">
 <ResponsiveContainer width="100%" height="100%">
 <BarChart
 data={dashboardData.timeline}
 onClick={(state: any) => handleTimelineFocus(state?.activePayload?.[0]?.payload,"Throughput")}
 >
 <XAxis dataKey="label" tick={{ fontSize: 8, fill:"#6b7280"}} axisLine={false} tickLine={false} />
 <YAxis hide />
 <Tooltip formatter={((value: number | undefined) =>`${Number(value ?? 0).toFixed(0)} km`) as any} />
 <Bar dataKey="distance" fill="#10b981" radius={[3, 3, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </div>
 <div className="mt-1 rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-1">
 <div className="text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Distance Delta</div>
 <div className={`text-[10px] font-semibold ${dashboardData.kpiTiles[2].delta >= 0 ?"text-emerald-700" :"text-rose-700"}`}>
 {dashboardData.kpiTiles[2].delta >= 0 ?"+" :""}{dashboardData.kpiTiles[2].delta.toFixed(0)}%
 </div>
 </div>
 <div className="mt-1 text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Click bars to focus that day</div>
 </div>

 <div className="col-span-2 grid min-h-[164px] grid-rows-2 gap-1.5">
 <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-2.5 shadow-sm">
 <div className="flex items-start justify-between">
 <div>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">Leaders</h3>
 <p className="text-[10px] text-[var(--nav-text-color)]">Top performers</p>
 </div>
 </div>
 <div className="mt-2 space-y-2">
 <button
 type="button"
 onClick={() => {
 if (!dashboardData.topTrucks[0]) return;
 const label =`Dashboard: Truck ${dashboardData.topTrucks[0].name}`;
 if (clearDashboardTextFocus("truck", label)) return;
 setDashboardDrilldown(prev => ({ ...prev, truck: { label, value: dashboardData.topTrucks[0]!.name}}));
}}
 title="Click to focus, click again to clear"
 className={`w-full rounded-md border px-2 py-1 text-left transition ${
 dashboardData.topTrucks[0] && isDashboardFocusActive(`Dashboard: Truck ${dashboardData.topTrucks[0].name}`)
 ?"border-blue-300 bg-blue-50/70 ring-1 ring-blue-300"
 :"border-[var(--card-border)] bg-[var(--card-bg)]/40 hover:bg-[var(--card-bg)]"
}`}
 >
 <div className="text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Truck</div>
 <div className="truncate text-xs font-semibold text-blue-700">
 {dashboardData.topTrucks[0] ?`${dashboardData.topTrucks[0].name} · ${formatCompactCurrency(dashboardData.topTrucks[0].value)}` :"No data"}
 </div>
 </button>
 <button
 type="button"
 onClick={() => {
 if (!dashboardData.topClients[0]) return;
 const label =`Dashboard: Client ${dashboardData.topClients[0].name}`;
 if (clearDashboardTextFocus("client", label)) return;
 setDashboardDrilldown(prev => ({ ...prev, client: { label, value: dashboardData.topClients[0]!.name}}));
}}
 title="Click to focus, click again to clear"
 className={`w-full rounded-md border px-2 py-1 text-left transition ${
 dashboardData.topClients[0] && isDashboardFocusActive(`Dashboard: Client ${dashboardData.topClients[0].name}`)
 ?"border-blue-300 bg-blue-50/70 ring-1 ring-blue-300"
 :"border-[var(--card-border)] bg-[var(--card-bg)]/40 hover:bg-[var(--card-bg)]"
}`}
 >
 <div className="text-[9px] uppercase tracking-wider text-[var(--nav-text-color)]">Client</div>
 <div className="truncate text-xs font-semibold text-violet-700">
 {dashboardData.topClients[0] ?`${dashboardData.topClients[0].name} · ${formatCompactCurrency(dashboardData.topClients[0].value)}` :"No data"}
 </div>
 </button>
 </div>
 </div>

 <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-2.5 shadow-sm">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">Health Mix</h3>
 <p className="text-[10px] text-[var(--nav-text-color)]">Status balance</p>
 </div>
 <div className="text-xs font-bold text-amber-700">{dashboardData.riskRoutes}</div>
 </div>
 <div className="mt-2 flex items-center gap-3">
 <div className="h-[66px] w-[66px] shrink-0">
 {dashboardData.riskDistribution.length > 0 ? (
 <ResponsiveContainer width="100%" height="100%">
 <PieChart>
 <Pie data={dashboardData.riskDistribution} dataKey="count" innerRadius={16} outerRadius={28} paddingAngle={2}>
 {dashboardData.riskDistribution.map((entry) => (
 <Cell key={entry.label} fill={entry.color} onClick={() => handleRiskDistributionClick(entry.label)} style={{ cursor:"pointer"}} />
))}
 </Pie>
 <Tooltip formatter={((_value: number | undefined, _name: string, props: any) => [`${_value ?? 0} routes`, props?.payload?.label ||""]) as any} />
 </PieChart>
 </ResponsiveContainer>
) : null}
 </div>
 <div className="min-w-0 flex-1 space-y-1">
 {dashboardData.riskDistribution.slice(0, 3).map((entry) => (
 <button
 key={entry.label}
 type="button"
 onClick={() => handleRiskDistributionClick(entry.label)}
 title="Click to focus, click again to clear"
 className={`flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-[10px] transition ${
 isDashboardFocusActive(`Dashboard: ${entry.label}`)
 ?"bg-blue-50 ring-1 ring-blue-300"
 :"hover:bg-[var(--card-bg)] /60"
}`}
 >
 <div className="flex min-w-0 items-center gap-1.5 text-[var(--nav-text-color)]">
 <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color}} />
 <span className="truncate">{entry.label}</span>
 </div>
 <span className="font-semibold text-[var(--foreground)]">{entry.count}</span>
 </button>
))}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
)}

 {/* Compact View */}  {isHeaderCompact && (
  <div className="mb-4 overflow-x-auto">
 <div className="flex min-w-max items-stretch gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/40 p-2.5 shadow-sm">
 <div className="flex items-center rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-2 py-1.5">
 {renderCompactDateControls()}
 </div>

 <div className="min-w-[112px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-3 py-2.5 shadow-sm">
 <div className="flex items-center gap-1.5">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#06B6D4]">
 <path d="M9 11l3 3L22 4"></path>
 <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
 </svg>
 <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">Loads</span>
 </div>
 <div className="mt-1.5 text-sm font-bold text-[var(--foreground)]">{kpiStats.loadsDone}</div>
 </div>

 <div className="min-w-[132px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-3 py-2.5 shadow-sm">
 <div className="flex items-center gap-1.5">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#06B6D4]">
 <line x1="12" y1="1" x2="12" y2="23"></line>
 <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
 </svg>
 <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">Revenue</span>
 </div>
 <div className="mt-1.5 text-sm font-bold text-[var(--foreground)]">{formatCompactCurrency(kpiStats.totalRevenue)}</div>
 </div>

 <div className="min-w-[112px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-3 py-2.5 shadow-sm">
 <div className="flex items-center gap-1.5">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#06B6D4]">
 <circle cx="12" cy="12" r="1"></circle>
 <path d="M12 11v2"></path>
 <path d="M4 3h16v16H4z"></path>
 </svg>
 <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">Km</span>
 </div>
 <div className="mt-1.5 text-sm font-bold text-[var(--foreground)]">{formatCompactDistance(kpiStats.totalDistance)} km</div>
 </div>

 <div className="min-w-[112px] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-3 py-2.5 shadow-sm">
 <div className="flex items-center gap-1.5">
 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#06B6D4]">
 <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
 <polyline points="17 6 23 6 23 12"></polyline>
 </svg>
 <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-text-color)]">R/KM</span>
 </div>
 <div className="mt-1.5 text-sm font-bold text-[var(--foreground)]">{kpiStats.avgRPerKm > 0 ? kpiStats.avgRPerKm.toFixed(0) :"—"}</div>
 </div>
 </div>
 </div>
)}
 </>
)}

 {/* Clear Filters Bar */}
 {(filters.date || filters.truck || filters.trailer || filters.driver || filters.from || filters.to || filters.status.length > 0 || filters.amountMin || filters.amountMax || sortConfig.column || dashboardDrilldownChips.length > 0) && (
 <div className="bg-[var(--card-bg)]/60 border border-[var(--card-border)] rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
 <div className="min-w-0 flex-1 space-y-2">
 {dashboardDrilldownChips.length > 0 && (
 <div className="space-y-2">
 <div className="flex flex-wrap items-center gap-2 text-xs">
 <span className="font-medium text-[var(--foreground)]">Dashboard layer:</span>
 {dashboardDrilldownChips.map((chip) => (
 <button
 key={chip.label}
 type="button"
 onClick={() => removeDashboardChip(chip.key)}
 className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${dashboardChipMeta[chip.key].className}`}
 title="Clear dashboard drill-down"
 >
 <span className="text-[9px] font-bold tracking-wider">{dashboardChipMeta[chip.key].short}</span>
 <span>{chip.label}</span>
 <span className="text-[10px]">x</span>
 </button>
))}
 <div className="ml-1 flex flex-wrap items-center gap-1.5">
 <span className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[11px] text-[var(--foreground)]">{dashboardSnapshot.routes} routes</span>
 <span className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[11px] text-[var(--foreground)]">{dashboardSnapshot.loads} loads</span>
 <span className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[11px] text-[var(--foreground)]">{formatCompactCurrency(dashboardSnapshot.revenue)}</span>
 <span className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[11px] text-[var(--foreground)]">{formatCompactDistance(dashboardSnapshot.distance)} km</span>
 <span className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[11px] text-[var(--foreground)]">{dashboardSnapshot.trucks} trucks</span>
 <span className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[11px] text-[var(--foreground)]">{dashboardSnapshot.clients} clients</span>
 </div>
 </div>
 <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
 <span className="font-medium text-[var(--foreground)]">Slice vs base:</span>
 {dashboardCompareStats.map((stat) => (
 <span key={stat.key} className="rounded border border-[var(--card-border)] bg-[var(--card-bg)]/40 px-2 py-0.5 text-[var(--foreground)]">
 {stat.label} {stat.key ==="revenue"
 ? formatCompactCurrency(stat.current)
 : stat.key ==="distance"
 ?`${formatCompactDistance(stat.current)} km`
 : stat.current}
 {" /"}
 {stat.key ==="revenue"
 ? formatCompactCurrency(stat.base)
 : stat.key ==="distance"
 ?`${formatCompactDistance(stat.base)} km`
 : stat.base}
 {" ·"}
 {stat.share.toFixed(0)}%
 </span>
))}
 </div>
 <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
 <span className="font-medium text-[var(--foreground)]">Intelligence:</span>
 {dashboardIntel.map((item) => (
 <div
 key={item.key}
 className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 ${item.tone}`}
 title={item.detail}
 >
 <span className="font-semibold">{item.label}</span>
 <span>{item.value}</span>
 <span className="max-w-[180px] truncate text-[10px] opacity-80">{item.detail}</span>
 </div>
))}
 </div>
 <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
 <span className="font-medium text-[var(--foreground)]">Alerts:</span>
 {dashboardAlerts.map((alert) => (
 <button
 key={alert.key}
 type="button"
 onClick={() => handleAlertClick(alert.key)}
 title={alert.detail}
 className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 transition hover:opacity-85 ${alert.className}`}
 >
 <span className="font-semibold">{alert.title}</span>
 <span>{alert.value}</span>
 </button>
))}
 </div>
 </div>
)}
 <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--nav-text-color)]">
 <span className="font-medium">Active filters:</span>
 {Object.entries(filters).filter(([key, val]) => Array.isArray(val) ? val.length > 0 : !!val).map(([key]) => (
 <span key={key} className="bg-transparent px-2 py-0.5 rounded border border-[var(--card-border)] capitalize">
 {key}
 </span>
))}
 {sortConfig.column && (
 <span className="bg-transparent px-2 py-0.5 rounded border border-[var(--card-border)]">
 Sorted: {sortConfig.column} {sortConfig.direction === 'asc' ? '↑' : '↓'}
 </span>
)}
 </div>
 </div>
 <div className="flex items-center gap-3">
 {dashboardDrilldownChips.length > 0 && (
 <button
 onClick={clearDashboardLayer}
 className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
 >
 Clear Dashboard
 </button>
)}
 
 <button
 onClick={clearFilters}
 className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
 >
 Clear All
 </button>
 </div>
 </div>
)}
  </div>
  </div>
  )}

  <SpreadsheetDataTable 
    className={tableOnly ? "flex-1 min-h-0" : undefined}
    routes={filteredRoutes || []} 
    density={tableDensity}
    extraColumn={sheetsRegionColumn}
   updateLoadFields={({ routeId, loadIndex, patch }: any) => updateLoadFields({ routeId, loadIndex, patch, token })}
   onTruckClick={(truckNo) => {
    setFilters(prev => ({ ...prev, truck: truckNo }));
    const p = new URLSearchParams(searchParams.toString());
    p.set("truck", truckNo);
    router.replace(`?${p.toString()}`, { scroll: false });
  }}
  onLoadClick={(routeId) => {
    // Open the route detail panel ONLY. Setting editRouteId here also triggered
    // the Edit Route overlay in layout.tsx — two full-screen panels stacking on
    // top of each other caused the glitch. The panel's own EDIT button handles
    // opening the edit form.
    const route = routes?.find((r: any) => r._id === routeId);
    if (route) openPanel(route);
  }}
  />

 {/* ── Floating restore pill (table-only mode) — drag to move, tap to restore ── */}
 {/* Rendered through a portal to document.body: the sheets pane uses
     backdrop-filter (glass-card-premium), which creates a containing block
     for position:fixed descendants in real browsers — the pill could then
     anchor to the pane instead of the viewport and vanish when the pointer
     left the window. Portaling keeps it viewport-fixed. */}
 {tableOnly &&
   typeof document !== "undefined" &&
   createPortal(
     <button
       onPointerDown={handleRestorePillPointerDown}
       onPointerMove={handleRestorePillPointerMove}
       onPointerUp={handleRestorePillPointerUp}
       onPointerCancel={() => {
         restoreDragRef.current = null;
         persistRestorePos();
       }}
       onClick={() => {
         if (!restoreDraggedRef.current) setTableOnly(false);
       }}
       aria-label="Restore filters and sort (drag to move)"
       title="Restore filters and sort — drag to move, tap to restore"
       className="fixed z-[60] touch-none select-none cursor-grab active:cursor-grabbing inline-flex items-center gap-1.5 px-3.5 h-10 rounded-full bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-bold shadow-lg shadow-[rgba(6,182,212,0.35)]"
       style={restorePillStyle}
     >
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75">
         <polyline points="15 3 21 3 21 9"></polyline>
         <polyline points="9 21 3 21 3 15"></polyline>
         <line x1="21" y1="3" x2="14" y2="10"></line>
         <line x1="3" y1="21" x2="10" y2="14"></line>
       </svg>
       Restore
     </button>,
     document.body
   )}

 {/* Route detail overlay + confirmation dialog — shared with the mobile view */}
 {routeDetailOverlay}

 {/* Import Modal */}
 {isImportModalOpen && (
 <ImportLoadsModal
 onClose={() => setIsImportModalOpen(false)}
 onSuccess={() => {
 setIsImportModalOpen(false);
}}
 />
)}
 </div>
);
}
