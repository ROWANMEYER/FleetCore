"use client";

import { useState, useRef, useEffect, useId, type ReactNode} from"react";
import { useQuery, useMutation} from"convex/react";
import { useTheme} from"next-themes";
import { api} from"@/convex/_generated/api";
import { Id} from"@/convex/_generated/dataModel";
import { useAuth, useRegionArg, type RegionFilter } from "@/src/components/auth/AuthProvider";
import EditRouteForm from"@/src/components/operations/daily-planner/EditRouteForm";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from"recharts";
import { SkeletonLine, SkeletonKpiGrid, SkeletonCard} from"@/src/components/common/Skeleton";
import { EmptyState} from"@/src/components/common/EmptyState";
import { useToast} from"@/src/components/common/Toast";
import { ChevronDown, MapPin } from "lucide-react";
import { BirthdaysCard } from "@/src/components/dashboard/BirthdaysCard";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
 new Intl.NumberFormat("en-ZA", { style:"currency", currency:"ZAR", maximumFractionDigits: 0}).format(n);

const fmtNum = (n: number) =>
 new Intl.NumberFormat("en-ZA").format(Math.round(n));

const today = () => new Date().toISOString().split("T")[0];

const monthStart = (iso?: string) => {
 const d = iso ? new Date(iso) : new Date();
 const year = d.getFullYear();
 const month = d.getMonth();
 return new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
};

const monthEnd = (iso?: string) => {
 const d = iso ? new Date(iso) : new Date();
 const year = d.getFullYear();
 const month = d.getMonth();
 return new Date(Date.UTC(year, month + 1, 0)).toISOString().split("T")[0];
};

const monthLabel = (iso: string) => {
 const d = new Date(iso +"-01");
 return d.toLocaleDateString("en-ZA", { month:"long", year:"numeric"});
};

const calcLoadAmount = (quantity: string, rate: string, rateType: string) => {
 const q = parseFloat(quantity) || 0;
 const r = parseFloat(rate) || 0;
 if (rateType ==="flat" || rateType ==="full") return r;
 return q * r;
};

// ─── filter bar ──────────────────────────────────────────────────────────────

type FilterMode ="day" |"month" |"range";

function FilterBar({
 startDate, endDate, onChange,
}: {
 startDate: string;
 endDate: string;
 onChange: (start: string, end: string) => void;
}) {
 const [mode, setMode] = useState<FilterMode>("range");

 // derive current month string (YYYY-MM) from startDate
 const currentMonth = startDate.slice(0, 7);

 const setDay = (d: string) => onChange(d, d);
 const setMonth = (ym: string) => onChange(monthStart(ym +"-01"), monthEnd(ym +"-01"));

 const tabs: { key: FilterMode; label: string}[] = [
 { key:"day", label:"Day"},
 { key:"month", label:"Month"},
 { key:"range", label:"Range"},
];

 const tabActiveClass = "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm";
 const tabInactiveClass = "text-[var(--nav-text-color)] hover:text-[var(--foreground)]";

 return (
 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
 {/* mode tabs */}
 <div className={`glass-card flex rounded-xl p-1 gap-1`}>
 {tabs.map((t) => (
 <button
 key={t.key}
 onClick={() => {
 setMode(t.key);
 if (t.key ==="day") setDay(today());
 if (t.key ==="month") setMonth(new Date().toISOString().slice(0, 7));
 if (t.key ==="range") onChange(monthStart(), monthEnd());
}}
 className={`px-5 py-3 rounded-lg text-sm font-semibold transition-all
 ${mode === t.key
 ? tabActiveClass
 : tabInactiveClass}`}
 >
 {t.label}
 </button>
))}
 </div>

 {/* inputs */}
 <div className={`glass-card flex items-center gap-2 rounded-xl px-4 py-2`}>
 {mode ==="day" && (
 <input
 type="date"
 value={startDate}
 onChange={(e) => setDay(e.target.value)} className="bg-transparent text-base py-2 focus:outline-none text-[var(--foreground)]"
                />
              )}
              {mode ==="month" && (
                <>
                  <button
                    onClick={() => {
                      const d = new Date(currentMonth +"-01");
                      d.setMonth(d.getMonth() - 1);
                      setMonth(d.toISOString().slice(0, 7));
                    }}
                    className="w-11 h-11 flex items-center justify-center font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                    >‹</button>
                  <span className="text-sm font-semibold min-w-[140px] text-center text-[var(--foreground)]">
                    {monthLabel(currentMonth)}
                  </span>
                  <button
                    onClick={() => {
                      const d = new Date(currentMonth +"-01");
                      d.setMonth(d.getMonth() + 1);
                      setMonth(d.toISOString().slice(0, 7));
                    }}
                    className="w-11 h-11 flex items-center justify-center font-bold text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                    >›</button>
 </>
)}
 {mode ==="range" && (
 <>
 <input
 type="date"
 value={startDate}
 onChange={(e) => onChange(e.target.value, endDate)}                  className="bg-transparent text-base py-2 focus:outline-none text-[var(--foreground)]"
                  />
                  <span className="text-[var(--nav-text-color)]">→</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => onChange(startDate, e.target.value)}
                    className="bg-transparent text-base py-2 focus:outline-none text-[var(--foreground)]"
 />
 </>
)}
 </div>

 {/* active label */}
 <span className="text-xs hidden sm:block text-[var(--nav-text-color)]">
 {startDate === endDate ? startDate :`${startDate} → ${endDate}`}
 </span>
 </div>
);
}

// ─── drill-down types ────────────────────────────────────────────────────────

type DrillDown =
 | { kind:"date"; date: string; label: string}
 | { kind:"status"; status: string; startDate: string; endDate: string; label: string}
 | { kind:"truck"; truck: string; startDate: string; endDate: string; label: string}
 | { kind:"client"; client: string; startDate: string; endDate: string; label: string}
 | { kind:"period"; startDate: string; endDate: string; label: string};

// ─── DrillDown panel ─────────────────────────────────────────────────────────

function DrillDownPanel({ drill, onClose, onAnalyticsClick, onAnalyticsClose, showAnalytics, isDayMode = false, onDrill}: { drill: DrillDown; onClose: () => void; onAnalyticsClick: () => void; onAnalyticsClose: () => void; showAnalytics: boolean; isDayMode?: boolean; onDrill?: (drillData: DrillDown) => void}) {
 const start = drill.kind ==="date" ? drill.date : drill.startDate;
 const end = drill.kind ==="date" ? drill.date : drill.endDate;

 // Chart filter states
 const [showRevenueFilters, setShowRevenueFilters] = useState(false);
 const [showRoutesFilters, setShowRoutesFilters] = useState(false);
 const [revenueSelectedClient, setRevenueSelectedClient] = useState<string | null>(null);
 const [routesSelectedClient, setRoutesSelectedClient] = useState<string | null>(null);

 // Edit/Delete states
 const [editingRouteId, setEditingRouteId] = useState<Id<"dailyRoutes"> | null>(null);
 const [deletingRouteId, setDeletingRouteId] = useState<Id<"dailyRoutes"> | null>(null);
 const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

 // Mutations
 const deleteDailyRoute = useMutation(api.dailyRoutes.deleteDailyRoute);
 const { token } = useAuth();
 const region = useRegionArg();
 const { addToast } = useToast();

 // Track the original period/range when drilling down to a date
 const [parentDrill, setParentDrill] = useState<DrillDown | null>(null);

 // When drill changes and we're going from a period to a date, save the period as parent
 const prevDrillRef = useRef<DrillDown | null>(null);
 useEffect(() => {
 if (prevDrillRef.current && prevDrillRef.current.kind !=="date" && drill.kind ==="date") {
 // Transitioning from a non-date drill (period/range) to a date drill
 setParentDrill(prevDrillRef.current);
}
 prevDrillRef.current = drill;
}, [drill]); const panelTheme = {
   bg: {
      primary: "bg-[var(--card-bg)]",
      secondary: "bg-[var(--card-bg)]",
      tertiary: "bg-[var(--card-bg)]",
   },
   text: {
      primary: "text-[var(--foreground)]",
      secondary: "text-[var(--nav-text-color)]",
      tertiary: "text-[var(--nav-text-color)]",
   },
   border: "var(--card-border)",
};

 const routes = useQuery(api.dailyRoutes.getForSheets, { startDate: start, endDate: end, token, region});

 const filtered = (routes ?? []).filter((r) => {
 if (drill.kind ==="status") return ((r as any).status ??"planned") === drill.status;
 if (drill.kind ==="truck") return r.truckFleetNoStr === drill.truck;
 if (drill.kind ==="client") return r.client === drill.client;
 return true;
});

 // Get unique clients for filter dropdowns
 const uniqueClients = Array.from(new Set(filtered.map(r => r.client).filter(Boolean)));

 // Determine which filter is active (prefer revenue filter, fallback to routes filter)
 const activeFilter = revenueSelectedClient || routesSelectedClient;

 // Apply chart filters to data - used for all analytics and details
 const filteredData = filtered.filter(r => {
 if (activeFilter && r.client !== activeFilter) return false;
 return true;
});

 const totalRevenue = filteredData.reduce((sum, r) => {
 return sum + (r.loads ?? []).reduce((s, l) => s + calcLoadAmount(l.quantity, l.rate, l.rateType), 0);
}, 0);

 const totalKm = filteredData.reduce((sum, r) => sum + (r.kilometers ?? 0), 0);

 const handleDeleteRoute = async () => {
 if (!deletingRouteId) return;
 try {
 await deleteDailyRoute({ id: deletingRouteId, token});
 setShowDeleteConfirm(false);
 setDeletingRouteId(null);
} catch (error) {
 console.error("Failed to delete route:", error);
 addToast("Failed to delete route. It might be locked.", "error");
 setShowDeleteConfirm(false);
 setDeletingRouteId(null);
}
};

 useEffect(() => {
 if (!showDeleteConfirm && !editingRouteId) return;
 const handler = (e: KeyboardEvent) => {
 if (e.key ==="Escape") {
 setShowDeleteConfirm(false);
 setDeletingRouteId(null);
 setEditingRouteId(null);
}
};
 document.addEventListener("keydown", handler);
 return () => document.removeEventListener("keydown", handler);
}, [showDeleteConfirm, editingRouteId]);

 const handleEditClick = (routeId: Id<"dailyRoutes">) => {
 setEditingRouteId(routeId);
};

 const handleDeleteClick = (routeId: Id<"dailyRoutes">) => {
 setDeletingRouteId(routeId);
 setShowDeleteConfirm(true);
}; // Custom Tooltip Component for Revenue Chart
  const RevenueTooltip = ({ active, payload}: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "12px",
          padding: "16px",
          boxShadow: "var(--card-shadow-hover)",
          backdropFilter: "blur(8px)",
          minWidth: "200px"
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:"12px", alignItems:"flex-start"}}>
            <div>
              <p style={{
                fontSize:"12px",
                fontWeight:"bold",
                textTransform:"uppercase",
                letterSpacing:"0.05em",
                color: "var(--nav-text-color)",
                margin:"0"
              }}>Date</p>
              <p style={{
                fontSize:"14px",
                fontWeight:"600",
                color: "var(--foreground)",
                margin:"4px 0 0 0"
              }}>{data.date}</p>
            </div>
          </div>
          <div style={{
            marginTop:"12px",
            paddingTop:"12px",
            borderTop: "1px solid var(--card-border)"
          }}>
            <p style={{
              fontSize:"12px",
              fontWeight:"bold",
              textTransform:"uppercase",
              letterSpacing:"0.05em",
              color: "var(--nav-text-color)",
              margin:"0"
            }}>Revenue</p>
            <p style={{
              fontSize:"18px",
              fontWeight:"900",
              color:"#4ade80",
              margin:"8px 0 0 0"
            }}>{fmt(data.revenue)}</p>
          </div>
          <div style={{
            marginTop:"8px",
            paddingTop:"8px",
            borderTop: "1px solid var(--card-border)"
          }}>
            <p style={{
              fontSize:"12px",
              fontWeight:"600",
              color: "var(--nav-text-color)",
              margin:"0"
            }}>{data.routes} {data.routes === 1 ? 'route' : 'routes'}</p>
          </div>
        </div>
      );
    }
    return null;
  };


 return (
 <div className="fixed inset-0 z-50 flex flex-col md:flex-row">      {/* backdrop - fills remaining space, clickable to close (desktop) */}
      <div className="hidden md:block flex-1 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={onClose} />

 {/* panels container - side by side on desktop, full-screen on mobile */}
 <div className="relative flex flex-col md:flex-row w-full md:w-auto h-full">
 {/* analytics panel - shown on left when active */}
 {showAnalytics && (          <div className={`absolute inset-0 z-10 md:static w-full max-w-4xl ${panelTheme.bg.primary} backdrop-blur-md border-r ${panelTheme.border} flex flex-col h-full shadow-2xl`}>
 {/* header */}
 <div className={`flex items-start justify-between px-4 py-3 border-b ${panelTheme.border}`}>
 <div>
 <h2 className={`text-lg font-black ${panelTheme.text.primary}`}>Analytics Dashboard</h2>
 <p className={`text-xs ${panelTheme.text.secondary} mt-1`}>{start} → {end}</p>
 </div>          <button onClick={onAnalyticsClose} className="p-2 -m-2 text-[var(--nav-text-color)] hover:text-[var(--foreground)] text-xl font-bold leading-none">✕</button>
 </div>

 {/* analytics content */}
 <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
 {/* Active Filter Badge */}
 {activeFilter && (          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2">
            <p className="text-xs text-[var(--nav-text-color)]">
              <span className="font-semibold">Filtered by Client:</span> {activeFilter}
            </p>
          </div>
)}
 
 {/* KPI Cards with Progress Bars */}
 <div className="grid grid-cols-2 gap-2.5">          <div className="glass-card rounded-lg p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Routes</h3>
                  <span className="text-xs text-emerald-400 font-bold">↑ Active</span>
                </div>
                <p className={`text-xl font-black ${panelTheme.text.primary}`}>{filteredData.length}</p>
                <div className="mt-2 w-full bg-[var(--card-border)] rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{width:`${Math.min(100, (filteredData.length / 10) * 100)}%`}}></div>
                </div>
              </div>
              <div className="glass-card rounded-lg p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Revenue</h3>
                  <span className="text-xs text-emerald-400 font-bold">Peak</span>
                </div>
                <p className="text-xl font-black text-emerald-400">{fmt(totalRevenue)}</p>
                <div className="mt-2 w-full bg-[var(--card-border)] rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{width:`${Math.min(100, (totalRevenue / 50000) * 100)}%`}}></div>
                </div>
              </div>
              <div className="glass-card rounded-lg p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Distance</h3>
                  <span className="text-xs text-cyan-400 font-bold">Coverage</span>
                </div>
                <p className="text-xl font-black text-cyan-400">{fmtNum(totalKm)}</p>
                <div className="mt-2 w-full bg-[var(--card-border)] rounded-full h-1.5">
                  <div className="bg-cyan-500 h-1.5 rounded-full" style={{width:`${Math.min(100, (totalKm / 5000) * 100)}%`}}></div>
                </div>
              </div>
              <div className="glass-card rounded-lg p-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Revenue/KM</h3>
                  <span className="text-xs text-purple-400 font-bold">Efficiency</span>
                </div>
                <p className="text-xl font-black text-purple-400">{fmt(totalKm > 0 ? totalRevenue / totalKm : 0)}</p>
                <div className="mt-2 w-full bg-[var(--card-border)] rounded-full h-1.5">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{width:`${Math.min(100, ((totalKm > 0 ? totalRevenue / totalKm : 0) / 50) * 100)}%`}}></div>
                </div>
 </div>
 </div>

 {/* Revenue Trend Chart */}
 {(() => {
 const chartData = filtered.reduce((acc: any[], route) => {
 // Apply revenue chart filter
 if (revenueSelectedClient && route.client !== revenueSelectedClient) return acc;
 
 const date = route.routeDate;
 const existing = acc.find(d => d.date === date);
 const revenue = (route.loads ?? []).reduce((s, l) => s + calcLoadAmount(l.quantity, l.rate, l.rateType), 0);
 if (existing) {
 existing.revenue += revenue;
 existing.routes += 1;
} else {
 acc.push({ date, revenue, routes: 1});
}
 return acc;
}, []).sort((a, b) => a.date.localeCompare(b.date));  const gridColor = "var(--chart-grid)";
  const axisColor = "var(--chart-axis)";

  const handleChartClick = (data: any) => {
    if (onDrill && data && data.date) {
      onDrill({ kind:"date", date: data.date, label:`Revenue detail — ${data.date}`});
    }
  };

 // Simple dot component - clicking is handled by overlay
 const RevenueDot = (props: any) => {
 const { cx, cy, stroke} = props;
 if (!cx || !cy) return null;
 return (
 <>
 {/* Glow effect on hover */}
 <circle
 cx={cx}
 cy={cy}
 r={8}
 fill={stroke}
 opacity={0}
 style={{ 
 pointerEvents:"none",
 transition:"opacity 0.3s ease"
}}
 className="hover:opacity-20"
 />
 {/* Main dot */}
 <circle
 cx={cx}
 cy={cy}
 r={4}
 fill={stroke}
 stroke="white"
 strokeWidth={2}
 style={{ 
 pointerEvents:"none",
 filter:"drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))",
 transition:"r 0.3s ease"
}}
 />
 </>
);
};

 return chartData.length > 0 ? (
 <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-4`}>
 <div className="flex items-center justify-between mb-3">
 <div>
 <h3 className={`text-sm font-semibold ${panelTheme.text.primary}`}>Daily Revenue Trend</h3>
 <p className={`text-xs ${panelTheme.text.tertiary} mt-1`}>Click on any point to drill down</p>
 </div>
 <button 
 onClick={() => {
 setShowRevenueFilters(!showRevenueFilters);
 if (!showRevenueFilters) setRevenueSelectedClient(null);
}}              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                showRevenueFilters 
                  ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                  : "bg-[var(--card-bg)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)]"
              }`}
            >
              {showRevenueFilters ?"✕ Filters" :"⊕ Filters"}
            </button>
          </div>

          {/* Revenue Filter UI */}
          {showRevenueFilters && (
            <div className="mb-3 p-3 rounded bg-[var(--card-bg)] border border-[var(--card-border)]">
 <p className={`text-xs font-semibold ${panelTheme.text.secondary} mb-2`}>Filter by Client</p>
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => setRevenueSelectedClient(null)}                  className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    revenueSelectedClient === null
                      ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                      : "bg-[var(--card-bg)] text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                  }`}
                >
                  All
                </button>
                {uniqueClients.map(client => (
                  <button
                    key={client}
                    onClick={() => setRevenueSelectedClient(client)}
                    className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      revenueSelectedClient === client
                        ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                        : "bg-[var(--card-bg)] text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {client}
                  </button>
                ))}
 </div>
 </div>
)}

 <div className="relative w-full">
 <ResponsiveContainer width="100%" height={200}>
 <LineChart 
 data={chartData} 
 margin={{ top: 5, right: 10, left: -20, bottom: 5}}
 >
 <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
 <XAxis dataKey="date" stroke={axisColor} style={{ fontSize:"10px"}} />
 <YAxis stroke={axisColor} style={{ fontSize:"10px"}} />
 <Tooltip 
 content={RevenueTooltip}
 cursor={{ 
 stroke: '#10b981', 
 strokeWidth: 2, 
 opacity: 0.3,
 fill: '#10b981',
 fillOpacity: 0.05
}}
 wrapperStyle={{ outline:"none", zIndex: 999}}
 />
 <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={<RevenueDot stroke="#10b981" />} activeDot={{ r: 7}} isAnimationActive={false} />
 </LineChart>
 </ResponsiveContainer>
 {/* Clickable overlay for drill-down */}
 <svg 
 width="100%" 
 height="200"
 style={{ 
 position:"absolute", 
 top: 0, 
 left: 0,
 pointerEvents:"auto",
 opacity: 0
}}
 onClick={(e) => {
 const rect = (e.currentTarget as SVGSVGElement).parentElement?.getBoundingClientRect();
 if (!rect) return;
 
 const x = e.clientX - rect.left;
 const ratio = x / rect.width;
 const index = Math.round(ratio * (chartData.length - 1));
 
 if (chartData[Math.max(0, Math.min(index, chartData.length - 1))]) {
 handleChartClick(chartData[Math.max(0, Math.min(index, chartData.length - 1))]);
}
}}
 />
 </div>
 </div>
) : null;
})()}

 {/* Routes Distribution Chart */}
 {(() => {
 const chartData = filtered.reduce((acc: any[], route) => {
 // Apply routes chart filter
 if (routesSelectedClient && route.client !== routesSelectedClient) return acc;
 
 const date = route.routeDate;
 const existing = acc.find(d => d.date === date);
 if (existing) {
 existing.count += 1;
} else {
 acc.push({ date, count: 1});
}
 return acc;
}, []).sort((a, b) => a.date.localeCompare(b.date));  const gridColor = "var(--chart-grid)";
  const axisColor = "var(--chart-axis)";          const handleBarClick = (data: any) => {
            if (onDrill) {
              onDrill({ kind:"date", date: data.date, label:`Routes detail — ${data.date}`});
            }
          };

          const CustomBar = (props: any) => {
            const { fill, x, y, width, height} = props;
            return (
              <g>
                {/* Glow effect layer */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={fill}
                  rx={6}
                  ry={6}
                  style={{ 
                    pointerEvents:"none", 
                    opacity: 0.15,
                    filter:"blur(4px)"
                  }}
                />
                {/* Main bar */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={fill}
                  rx={6}
                  ry={6}
                  style={{ 
                    pointerEvents:"none", 
                    opacity: 0.85,
                    filter:"drop-shadow(0 0 4px rgba(6, 182, 212, 0.3))",
                    transition:"opacity 0.3s ease"
                  }}
                />
              </g>
            );
          };

          return chartData.length > 0 ? (
            <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className={`text-sm font-semibold ${panelTheme.text.primary}`}>Routes per Day</h3>
                  <p className={`text-xs ${panelTheme.text.tertiary} mt-1`}>Click on any bar to drill down</p>
                </div>
                <button 
                  onClick={() => {
                    setShowRoutesFilters(!showRoutesFilters);
                    if (!showRoutesFilters) setRoutesSelectedClient(null);
                  }}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    showRoutesFilters 
                      ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                      : "bg-[var(--card-bg)] text-[var(--nav-text-color)] hover:bg-[var(--card-bg)]"
                  }`}
                >
                  {showRoutesFilters ?"✕ Filters" :"⊕ Filters"}
                </button>
              </div>

              {/* Routes Filter UI */}
              {showRoutesFilters && (
                <div className="mb-3 p-3 rounded bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <p className={`text-xs font-semibold ${panelTheme.text.secondary} mb-2`}>Filter by Client</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setRoutesSelectedClient(null)}
                      className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                        routesSelectedClient === null
                          ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                          : "bg-[var(--card-bg)] text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      All
                    </button>
                    {uniqueClients.map(client => (
                      <button
                        key={client}
                        onClick={() => setRoutesSelectedClient(client)}
                        className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                          routesSelectedClient === client
                            ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                            : "bg-[var(--card-bg)] text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {client}
                      </button>
                    ))}
 </div>
 </div>
)}

 <div className="relative w-full">
 <ResponsiveContainer width="100%" height={150}>
 <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5}}>
 <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
 <XAxis dataKey="date" stroke={axisColor} style={{ fontSize:"10px"}} />
 <YAxis stroke={axisColor} style={{ fontSize:"10px"}} />
 <Tooltip
 cursor={{
 fill: '#3b82f6',
 fillOpacity: 0.15
}}
 wrapperStyle={{ outline:"none", zIndex: 999}}
 />
 <Bar dataKey="count" fill="#3b82f6" shape={<CustomBar />} />
 </BarChart>
 </ResponsiveContainer>
 {/* Clickable overlay for drill-down */}
 <svg 
 width="100%" 
 height="150"
 style={{ 
 position:"absolute", 
 top: 0, 
 left: 0,
 pointerEvents:"auto",
 opacity: 0,
 cursor:"pointer"
}}
 onClick={(e) => {
 const rect = (e.currentTarget as SVGSVGElement).parentElement?.getBoundingClientRect();
 if (!rect) return;
 
 const x = e.clientX - rect.left;
 const ratio = x / rect.width;
 const index = Math.round(ratio * (chartData.length - 1));
 
 if (chartData[Math.max(0, Math.min(index, chartData.length - 1))]) {
 handleBarClick(chartData[Math.max(0, Math.min(index, chartData.length - 1))]);
}
}}
 />
 </div>
 </div>
) : null;
})()}

 {/* Top Metrics Summary */}
 <div className="grid grid-cols-3 gap-3">
 <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-3`}>
 <p className={`text-xs ${panelTheme.text.secondary} uppercase tracking-wider`}>Avg Revenue</p>
 <p className="text-lg font-black text-emerald-400 mt-1">{fmt(filteredData.length > 0 ? totalRevenue / filteredData.length : 0).replace('R', '')}</p>
 </div>
 <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-3`}>
 <p className={`text-xs ${panelTheme.text.secondary} uppercase tracking-wider`}>Avg Distance</p>
 <p className="text-lg font-black text-blue-400 mt-1">{fmtNum(filteredData.length > 0 ? totalKm / filteredData.length : 0)}</p>
 </div>
 <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-3`}>
 <p className={`text-xs ${panelTheme.text.secondary} uppercase tracking-wider`}>Routes/Day</p>
 <p className="text-lg font-black text-purple-400 mt-1">{(filteredData.length / ((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24) + 1)).toFixed(1)}</p>
 </div>
 </div>
 </div>
 </div>
)}  {/* main drill-down panel */}
          <div className={`w-full max-w-4xl ${panelTheme.bg.primary} backdrop-blur-md border-l ${panelTheme.border} flex flex-col h-full shadow-2xl`}>
 {/* header */}
 <div className={`flex items-start justify-between px-4 py-3 border-b ${panelTheme.border}`}>
 <div className="flex-1">
 {/* Breadcrumb Navigation */}
 {drill.kind ==="date" && parentDrill && (
 <div className="mb-2">
 <button
 onClick={() => {
 // Navigate back to the original period/range
 if (onDrill) {
 onDrill(parentDrill);
}
}}            className="text-sm font-semibold text-[#06B6D4] hover:text-[#0891B2] transition-colors flex items-center gap-1 py-2"
                >
                  <span>←</span> Back to {parentDrill.kind ==="period" ?"Range" : parentDrill.kind}
 </button>
 </div>
)}
 <h2 className={`text-lg font-black ${panelTheme.text.primary}`}>{drill.label}</h2>
 <p className={`text-xs ${panelTheme.text.secondary} mt-1`}>
 {drill.kind ==="date" ? drill.date :`${drill.startDate} → ${drill.endDate}`}
 </p>
 </div>          <button onClick={onClose} className="p-2 -m-2 shrink-0 text-[var(--nav-text-color)] hover:text-[var(--foreground)] text-xl font-bold leading-none">✕</button>
 </div>

 {/* summary strip */}          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--card-bg)] border-b border-[var(--card-border)]">
 {[
 { label:"Routes", value: String(filteredData.length)},
 { label:"Revenue", value: fmt(totalRevenue)},
 { label:"KM", value: fmtNum(totalKm)},
].map((k) => (
 <div key={k.label} className={`${panelTheme.bg.secondary} px-4 py-3 flex flex-col gap-0.5`}>
 <span className={`text-xs ${panelTheme.text.tertiary} uppercase tracking-wider`}>{k.label}</span>
 <span className={`text-base font-black ${panelTheme.text.primary}`}>{k.value}</span>
 </div>
))}
 {/* Graph Card - Analytics */}        <button onClick={onAnalyticsClick} className="glass-card rounded-xl px-3 py-2.5 flex flex-col gap-1.5 items-center justify-center cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
 <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
 </svg>
 <span className="text-xs text-[var(--nav-text-color)] uppercase tracking-wider text-center font-semibold">Analytics</span>
 </button>
 </div>

 {/* route list */}
 <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
 {!routes ? (
 <div className="px-4 py-6 space-y-3">
 {Array.from({ length: 4}).map((_, i) => (
 <SkeletonLine key={i} className="w-full h-16" />
))}
 </div>
) : filteredData.length === 0 ? (
 <EmptyState icon="search" title="No routes found" description="No routes match the current date range or filters." />
) : (
 filteredData.map((r) => {
 const status = (r as any).status ??"planned";
 const routeRevenue = (r.loads ?? []).reduce(
 (s, l) => s + calcLoadAmount(l.quantity, l.rate, l.rateType), 0
);
 return (
 <div key={r._id} className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-xl p-4 space-y-3`}>
 {/* route header */}
 <div className="flex items-center justify-between gap-3">
 <div className="flex items-center gap-2 min-w-0">
 <span className={`text-sm font-black ${panelTheme.text.primary} shrink-0`}>
 Truck {r.truckFleetNoStr ??"—"}
 </span>
 {r.trailerFleetNoStr && (
 <span className={`text-xs ${panelTheme.text.tertiary}`}>· Trailer {r.trailerFleetNoStr}</span>
)}
 </div>
 <div className="flex items-center gap-1">
 <button
 onClick={() => handleEditClick(r._id)}            className="w-11 h-11 flex items-center justify-center rounded-lg transition-all text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"
                    title="Edit Route"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
 </button>
 <button
 onClick={() => handleDeleteClick(r._id)}            className="w-11 h-11 flex items-center justify-center rounded-lg transition-all text-[var(--color-accent-red)] hover:text-red-400 hover:bg-red-500/10"
                    title="Delete Route"
 >
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
 </button>
 <div 
 className={`w-11 h-11 rounded-full flex items-center justify-center transition-all cursor-help
 ${status ==="completed" ? (isDayMode ?"text-emerald-600 bg-emerald-50 hover:bg-emerald-100" :"text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20") 
 : status ==="locked" ? (isDayMode ?"text-blue-600 bg-blue-50 hover:bg-blue-100" :"text-blue-400 bg-blue-500/10 hover:bg-blue-500/20") 
 : (isDayMode ?"text-yellow-600 bg-yellow-50 hover:bg-yellow-100" :"text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20")}`}
 title={`Status: ${status}`}
 >
 {status ==="completed" ? (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
) : status ==="locked" ? (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
) : (
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
)}
 </div>
 </div>
 </div>

 {/* meta row */}
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${panelTheme.text.secondary}`}>
 <span>📅 {r.routeDate}</span>
 <span>👤 {r.driverName}</span>
 <span>📍 {r.kilometers ?? 0} km</span>
 </div>
 <div className={`px-3 py-1 rounded-lg border ${
 isDayMode 
 ?"bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm" 
 :"bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
}`}>
 <span className="font-black text-sm">{fmt(routeRevenue)}</span>
 </div>
 </div>

 {/* loads */}
 {(r.loads ?? []).length > 0 && (
 <div className={`space-y-1.5 pt-2 border-t ${panelTheme.border}`}>
 {r.loads.map((l, i) => {
 const amount = calcLoadAmount(l.quantity, l.rate, l.rateType);
 const hasMultipleLoads = (r.loads?.length ?? 0) > 1;
 return (
 <div key={i} className="flex items-start justify-between gap-2 text-xs">
 <div className="min-w-0">
 <span className={`${panelTheme.text.primary} font-semibold`}>{l.client}</span>
 <span className={`${panelTheme.text.tertiary} ml-2`}>
 {(l.fromLocations ?? []).join(",")} → {(l.toLocations ?? []).join(",")}
 </span>
 </div>
 <div className="text-right shrink-0">
 <span className={panelTheme.text.primary}>{l.quantity} {l.quantityType}</span>
 {hasMultipleLoads && (
 <span className={`${isDayMode ?"text-emerald-600/70" :"text-emerald-400/70"} font-semibold ml-2`}>{fmt(amount)}</span>
)}
 </div>
 </div>
);
})}
 </div>
)}

 {r.notes ? (
 <p className={`text-xs ${panelTheme.text.secondary} italic border-t ${panelTheme.border} pt-2`}>{r.notes}</p>
) : null}
 </div>
);
})
)}
 </div>
 </div>
 
 {/* Delete Confirmation Modal */}
 {showDeleteConfirm && (
 <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
 <div className={`${panelTheme.bg.primary} border ${panelTheme.border} rounded-lg shadow-2xl p-6 max-w-sm mx-4`}>
 <h2 className={`text-lg font-bold ${panelTheme.text.primary} mb-4`}>Delete Route</h2>
 <p className={`${panelTheme.text.secondary} mb-6`}>
 Are you sure you want to delete this route and all its loads? This action cannot be undone.
 </p>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setShowDeleteConfirm(false);
 setDeletingRouteId(null);
}}
 className={`px-5 py-3 text-sm font-medium ${panelTheme.text.secondary} border ${panelTheme.border} rounded-lg hover:${panelTheme.bg.secondary} transition-all`}
 >
 Cancel
 </button>
 <button
 onClick={handleDeleteRoute}
 className="px-5 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
 >
 Delete Route
 </button>
 </div>
 </div>
 </div>
)}      {/* Edit Modal - Using EditRouteForm Component */}
      {editingRouteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-2xl h-full flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden bg-[var(--card-bg)]">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-[var(--card-bg)] border-[var(--card-border)]">
              <h2 className="text-lg font-bold text-[var(--foreground)]">Edit Route</h2>
              <button 
                onClick={() => setEditingRouteId(null)}
                className="p-1 rounded-full transition-colors text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-[var(--card-bg)]">
              <EditRouteForm 
                routeId={editingRouteId}
                onSuccess={() => setEditingRouteId(null)}
                onCancel={() => setEditingRouteId(null)}
                isDayMode={isDayMode}
              />
            </div>
          </div>
        </div>
      )}
 </div>
 </div>
);
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
 label, value, sub, accent, onClick, icon,
}: {
 label: string; value: string; sub?: string; accent?: string; onClick?: () => void; icon?: ReactNode;
}) {
 const valueClass = accent ??"text-[var(--foreground)]";
 
 return (
 <button
 onClick={onClick}
 className={`glass-card rounded-xl p-3 sm:p-4 flex flex-col gap-1 text-left w-full transition-all duration-200 group
 ${onClick ?"cursor-pointer hover:scale-[1.02] active:scale-[0.98]" :"cursor-default"}`}
 >
 <span className="text-xs font-semibold text-[var(--nav-text-color)] uppercase tracking-wider flex items-center gap-1.5">{icon && <span className="shrink-0">{icon}</span>}{label}</span>
 <span className={`text-xl sm:text-2xl font-black leading-tight break-words ${valueClass}`}>{value}</span>
 {sub && <span className="text-xs text-[var(--nav-text-color)] opacity-60">{sub}</span>}
 {onClick && <span className="text-xs text-[var(--nav-text-color)] opacity-40 mt-1 group-hover:opacity-60 transition-opacity">Tap to drill down →</span>}
 </button>
);
}

function SectionHeader({ title}: { title: string}) {
 return <h2 className="text-sm font-bold text-[var(--nav-text-color)] uppercase tracking-widest mb-3">{title}</h2>;
}

/* Mobile-only collapsible section — on phones each dashboard section is a
   tappable card (title + summary + chevron). Desktop is unchanged: the toggle
   is hidden and the body is always open. */
function CollapsibleSection({
 title,
 summary,
 defaultOpen = false,
 carded = false,
 children,
}: {
 title: string;
 summary?: ReactNode;
 defaultOpen?: boolean;
 carded?: boolean;
 children: ReactNode;
}) {  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className={carded ? "glass-card rounded-xl overflow-hidden animate-fade-up" : ""}>
      {/* Mobile-only toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
 className={`lg:hidden w-full flex items-center justify-between gap-3 text-left transition-colors ${
 carded
 ? "px-4 sm:px-5 py-2.5"
 : "px-4 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60 dark:backdrop-blur-sm"
 }`}
 >
 <span className="min-w-0">
 <span className="block text-sm font-bold text-[var(--nav-text-color)] uppercase tracking-widest">{title}</span>
 {summary && !open && (
 <span className="block mt-0.5 text-sm font-semibold text-[var(--foreground)] truncate">{summary}</span>
 )}
 </span>
 <span className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-[var(--nav-text-color)]">
 <ChevronDown size={20} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
 </span>
 </button>

 {/* Desktop header — toggle hidden, section always open */}
 <div className={`hidden lg:block ${carded ? "px-5 pt-5" : ""}`}>
 <SectionHeader title={title} />
 </div>      {/* Body */}
      <div id={bodyId} role="region" aria-label={title} className={`${open ? "mt-2 lg:mt-0 animate-fade-up-sm" : "hidden lg:block"} ${carded ? "px-4 sm:px-5 pb-4 lg:px-5 lg:pb-4" : ""}`}>
        {children}
      </div>
 </section>
);
}

function ProgressBar({ pct, colour}: { pct: number; colour: string}) {
 return (
 <div className="w-full bg-[var(--card-border)] rounded-full h-2 overflow-hidden">
 <div className={`h-2 rounded-full ${colour}`} style={{ width:`${Math.min(pct, 100)}%`}} />
 </div>
);
}

/* Master region filter — the region is the master filter for every number on
   this screen. Admins pick All / Garden Route / Eastern Cape here (synced with
   the sidebar switcher); regional users are server-locked to their own region
   and see a read-only badge. */
function RegionMasterFilter() {
 const { user, regionFilter, setRegionFilter } = useAuth();

 if (!user) return null;
 if (user.role !== "admin") {
 const locked = user?.region ?? null;
 return (
 <div className="glass-card flex items-center gap-2 rounded-xl px-4 py-2.5 shrink-0" title="Your data is scoped to this region">
 <MapPin size={14} className="text-[#06B6D4] shrink-0" />
 <span className="text-[10px] font-bold text-[var(--nav-text-color)] uppercase tracking-widest">Region</span>
 <span className="text-sm font-black text-[var(--foreground)] capitalize">
 {locked ? locked.replace("_", " ") : "—"}
 </span>
 </div>
 );
 }

 return (
 <div className="glass-card flex items-center gap-2 rounded-xl pl-3 pr-1 py-1.5 shrink-0">
 <MapPin size={14} className="text-[#06B6D4] shrink-0" />
 <span className="text-[10px] font-bold text-[var(--nav-text-color)] uppercase tracking-widest">Region</span>
 <select
 value={regionFilter}
 onChange={(e) => setRegionFilter(e.target.value as RegionFilter)}
 aria-label="Dashboard region filter"
 title="Region — master filter for all dashboard data"
 className="bg-transparent text-sm font-bold text-[var(--foreground)] py-1 pr-1 pl-1 focus:outline-none cursor-pointer"
 >
 <option value="all">All Regions</option>
 <option value="garden_route">Garden Route</option>
 <option value="eastern_cape">Eastern Cape</option>
 </select>
 </div>
 );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
 const { token } = useAuth();
 const region = useRegionArg();
 const [startDate, setStartDate] = useState(monthStart());
 const [endDate, setEndDate] = useState(monthEnd());
 const [drill, setDrill] = useState<DrillDown | null>(null);
 const [showAnalytics, setShowAnalytics] = useState(false);
 const [mounted, setMounted] = useState(false);
 
 // Month-to-month comparison state
 const [month1, setMonth1] = useState(() => {
 const d = new Date();
 d.setMonth(d.getMonth() - 1);
 return d.toISOString().slice(0, 7);
});
 const [month2, setMonth2] = useState(() => {
 const d = new Date();
 return d.toISOString().slice(0, 7);
});
 const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(
 new Set(["revenue","loads","km"])
);

 const toggleMetric = (metric: string) => {
 setVisibleMetrics((prev) => {
 const newSet = new Set(prev);
 if (newSet.has(metric)) {
 newSet.delete(metric);
} else {
 newSet.add(metric);
}
 return newSet;
});
};

 const { resolvedTheme} = useTheme();
 const isDayMode = mounted ? resolvedTheme !=="dark" : true;

 useEffect(() => {
 const id = setTimeout(() => setMounted(true), 0);
 return () => clearTimeout(id);
}, []); // Theme colors
  const themeClasses = {
   bg: {
      primary: "bg-[var(--card-bg)]",
      secondary: "bg-[var(--card-bg)]",
      tertiary: "bg-[var(--card-bg)]",
   },
   text: {
      primary: "text-[var(--foreground)]",
      secondary: "text-[var(--nav-text-color)]",
      tertiary: "text-[var(--nav-text-color)]",
   },
   border: "var(--card-border)",
};

 const summary = useQuery(api.dashboard.getExecutiveSummary, { startDate, endDate, token, region});
 const topClients = useQuery(api.dashboard.getCustomerAnalytics, { startDate, endDate, token, region});
 const revenueOverTime = useQuery(api.dashboard.getRevenueOverTime, { startDate, endDate, token, region});
 const monthComparison = useQuery(api.dashboard.getMonthToMonthComparison, { month1, month2, token, region});

 const loading = !summary || !topClients || !revenueOverTime;
 const maxRevDay = revenueOverTime ? Math.max(...revenueOverTime.map((d) => d.revenue), 1) : 1;

 return (
 <>
 {drill && <DrillDownPanel drill={drill} onClose={() => setDrill(null)} onAnalyticsClick={() => setShowAnalytics(true)} onAnalyticsClose={() => setShowAnalytics(false)} showAnalytics={showAnalytics} isDayMode={isDayMode} onDrill={(newDrill) => setDrill(newDrill)} />}

 <div className={`flex-1 overflow-y-auto ${themeClasses.bg.primary} ${themeClasses.text.primary} transition-colors duration-300`}>  <div className="w-full px-4 sm:px-6 py-6 sm:py-8 space-y-10">

 {/* ── Header ── */}
 <div className="flex flex-col gap-4">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Dashboard</h1>
 <p className={`${themeClasses.text.secondary} text-sm mt-1`}>Fleet operations overview · tap any card to drill down</p>
 </div>
 <RegionMasterFilter />
 </div>            <FilterBar
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => { setStartDate(s); setEndDate(e);}}
            />
 </div>

 {loading ? (
 <div className="space-y-6 p-6">
 <SkeletonKpiGrid count={4} />
 <SkeletonCard />
 <SkeletonCard />
 </div>
) : (
 <>
 <BirthdaysCard />

 {/* ── Period KPIs ── */}
 <CollapsibleSection title={`Period ${startDate} → ${endDate}`} defaultOpen summary={`${fmt(summary.totalRevenue)} · ${summary.totalRoutes} routes`}>
 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">              <KpiCard label="Revenue" value={fmt(summary.totalRevenue)} accent="text-emerald-400"
                onClick={() => setDrill({ kind:"period", startDate, endDate, label:"Revenue — all routes"})} />
              <KpiCard label="Routes" value={fmtNum(summary.totalRoutes)}
                onClick={() => setDrill({ kind:"period", startDate, endDate, label:"All routes this period"})} />
              <KpiCard label="Loads" value={fmtNum(summary.totalLoads)}
                onClick={() => setDrill({ kind:"period", startDate, endDate, label:"Loads breakdown"})} />
              <KpiCard label="Total KM" value={fmtNum(summary.totalKm)}
                onClick={() => setDrill({ kind:"period", startDate, endDate, label:"KM breakdown"})} />
              <KpiCard label="Completion" value={`${Math.round(summary.completionRate)}%`}
                accent={summary.completionRate >= 80 ?"text-green-400" :"text-yellow-400"}
                onClick={() => setDrill({ kind:"status", status:"completed", startDate, endDate, label:"Completed routes this period"})} />
 </div>
 </CollapsibleSection>

 {/* ── Revenue by Day + Top Clients ── */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <CollapsibleSection title="Revenue by Day — tap a row" carded summary={`${revenueOverTime?.length ?? 0} days`}>
 {!revenueOverTime || revenueOverTime.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-8 text-center">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-[var(--nav-text-color)] mb-2">
 <rect x="3" y="4" width="18" height="18" rx="2" />
 <line x1="3" y1="10" x2="21" y2="10" />
 <line x1="8" y1="2" x2="8" y2="6" />
 <line x1="16" y1="2" x2="16" y2="6" />
 </svg>
 <p className="text-xs text-[var(--nav-text-color)]">No data for this period.</p>
 </div>
) : (
 <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
 {revenueOverTime.map((d) => (
 <button key={d.date} onClick={() => setDrill({ kind:"date", date: d.date, label:`Routes on ${d.date}`})}
 className="flex items-center gap-3 w-full hover:bg-[var(--card-bg)]/60 rounded-lg px-2 py-2.5 transition-colors group">              <span className="text-xs text-[var(--nav-text-color)] w-24 shrink-0 group-hover:text-[var(--foreground)]">{d.date}</span>
 <div className="flex-1">
 <ProgressBar pct={(d.revenue / maxRevDay) * 100} colour="bg-emerald-500" />
 </div>
 <span className="text-xs text-[var(--nav-text-color)] w-24 text-right shrink-0 group-hover:text-emerald-400">{fmt(d.revenue)}</span>
 </button>
))}
 </div>
)}
 </CollapsibleSection>
 <CollapsibleSection title="Top Clients — tap to drill down" carded summary={`${topClients.topCustomers?.length ?? 0} clients`}>
 {(topClients.topCustomers ?? []).length === 0 ? (
 <div className="flex flex-col items-center justify-center py-8 text-center">
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-[var(--nav-text-color)] mb-2">
 <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
 <circle cx="9" cy="7" r="4" />
 <path d="M23 21v-2a4 4 0 00-3-3.87" />
 <path d="M16 3.13a4 4 0 010 7.75" />
 </svg>
 <p className="text-xs text-[var(--nav-text-color)]">No client data available.</p>
 </div>
) : (
 <div className="space-y-3">
 {topClients.topCustomers.slice(0, 8).map((c, i) => {
 const pct = summary.totalRevenue > 0 ? (c.revenue / summary.totalRevenue) * 100 : 0;
 return (
 <button key={c.name} onClick={() => setDrill({ kind:"client", client: c.name, startDate, endDate, label:`${c.name} — routes`})}              className="w-full space-y-1 rounded-lg px-3 py-2.5 transition-colors text-left group hover:bg-[var(--card-bg)] text-[var(--foreground)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold truncate max-w-[60%] group-hover:text-[var(--foreground)]">
                    <span className="mr-2 text-[var(--nav-text-color)]">#{i + 1}</span>{c.name}
 </span>
 <div className="text-right">
 <span className="text-sm font-bold text-emerald-400">{fmt(c.revenue)}</span>
 <span className="text-xs ml-2 text-[var(--nav-text-color)]">{c.loads} loads</span>
 </div>
 </div>
 <ProgressBar pct={pct} colour="bg-emerald-600" />
 </button>
);
})}
 </div>
)}
 </CollapsibleSection>
 </div>

 {/* ── Month-to-Month Comparison ── */}
 <CollapsibleSection title="Month-to-Month Comparison" carded summary={`M1 ${monthLabel(month1)} → M2 ${monthLabel(month2)}`}>
 
 {/* Month selectors */}
 <div className="flex flex-col sm:flex-row gap-4 mb-6">
 <div className="flex-1">
 <label className={`text-xs font-semibold ${themeClasses.text.secondary} uppercase tracking-wider block mb-2`}>
 Month 1
 </label>
 <input
 type="month"
 value={month1}
 onChange={(e) => setMonth1(e.target.value)}
 className={`w-full px-4 py-2 rounded-lg border ${
 isDayMode
 ?"bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground)]"
 :"bg-[var(--card-bg)] border-[var(--card-border)] text-white"
} focus:outline-none focus:ring-2 focus:ring-[#06B6D4]`}
 />
 </div>
 <div className="flex items-end justify-center">
 <span className={`text-2xl font-bold ${themeClasses.text.secondary}`}>→</span>
 </div>
 <div className="flex-1">
 <label className={`text-xs font-semibold ${themeClasses.text.secondary} uppercase tracking-wider block mb-2`}>
 Month 2
 </label>
 <input
 type="month"
 value={month2}
 onChange={(e) => setMonth2(e.target.value)}
 className={`w-full px-4 py-2 rounded-lg border ${
 isDayMode
 ?"bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground)]"
 :"bg-[var(--card-bg)] border-[var(--card-border)] text-white"
} focus:outline-none focus:ring-2 focus:ring-[#06B6D4]`}
 />
 </div>
 </div>

 {/* MTD Badge */}
 {monthComparison?.isMtdComparison && (
 <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 ${
 isDayMode
 ?"bg-blue-100 text-blue-800 border border-blue-300"
 :"bg-blue-900/30 text-blue-300 border border-blue-700"
}`}>
 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 Day {monthComparison.mtdDayCount} of {new Date(
 parseInt(month2.slice(0, 4), 10),
 parseInt(month2.slice(5, 7), 10),
 0
).getDate()} · same basis
 </div>
)}

 {!monthComparison ? (
 <div className="space-y-4 p-6">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
 {Array.from({ length: 3}).map((_, i) => (
 <SkeletonCard key={i} />
))}
 </div>
 <SkeletonCard />
 </div>
) : (
 <>
 {/* Metrics comparison cards */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
 <ComparisonMetricCard
 metric="revenue"
 label="Revenue"
 value1={fmt(monthComparison.month1.totalRevenue)}
 value2={fmt(monthComparison.month2.totalRevenue)}
 change={monthComparison.changes.revenue}
 isVisible={visibleMetrics.has("revenue")}
 onToggle={() => toggleMetric("revenue")}
 />
 <ComparisonMetricCard
 metric="loads"
 label="Loads"
 value1={fmtNum(monthComparison.month1.totalLoads)}
 value2={fmtNum(monthComparison.month2.totalLoads)}
 change={monthComparison.changes.loads}
 isVisible={visibleMetrics.has("loads")}
 onToggle={() => toggleMetric("loads")}
 />
 <ComparisonMetricCard
 metric="km"
 label="Total KM"
 value1={fmtNum(monthComparison.month1.totalKm)}
 value2={fmtNum(monthComparison.month2.totalKm)}
 change={monthComparison.changes.km}
 isVisible={visibleMetrics.has("km")}
 onToggle={() => toggleMetric("km")}
 />
 </div>

 {/* Combined Indexed Chart */}
 <div className="glass-card rounded-xl p-5">
 {/* Custom Legend */}
 <div className="flex flex-wrap gap-6 mb-4">
 {visibleMetrics.has("revenue") && (
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm" style={{ backgroundColor:"#10b981"}}></div>
 <span className={`text-sm ${themeClasses.text.secondary}`}>Revenue</span>
 </div>
)}
 {visibleMetrics.has("loads") && (
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm" style={{ backgroundColor:"#f59e0b"}}></div>
 <span className={`text-sm ${themeClasses.text.secondary}`}>Loads</span>
 </div>
)}
 {visibleMetrics.has("km") && (
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-sm" style={{ backgroundColor:"#3b82f6"}}></div>
 <span className={`text-sm ${themeClasses.text.secondary}`}>Total KM</span>
 </div>
)}
 </div>

 <ResponsiveContainer width="100%" height={250}>
 <BarChart
 data={[
 {
 metric: monthLabel(month1),
 ...(visibleMetrics.has("revenue") && { revenue: 100}),
 ...(visibleMetrics.has("loads") && { loads: 100}),
 ...(visibleMetrics.has("km") && { km: 100}),
},
 {
 metric: monthLabel(month2),
 ...(visibleMetrics.has("revenue") && { 
 revenue: monthComparison.month1.totalRevenue === 0 
 ? 0 
 : (monthComparison.month2.totalRevenue / monthComparison.month1.totalRevenue) * 100 
}),
 ...(visibleMetrics.has("loads") && { 
 loads: monthComparison.month1.totalLoads === 0 
 ? 0 
 : (monthComparison.month2.totalLoads / monthComparison.month1.totalLoads) * 100 
}),
 ...(visibleMetrics.has("km") && { 
 km: monthComparison.month1.totalKm === 0 
 ? 0 
 : (monthComparison.month2.totalKm / monthComparison.month1.totalKm) * 100 
}),
},
]}
 margin={{ top: 5, right: 20, left: 10, bottom: 5}}
 >
 <CartesianGrid strokeDasharray="3 3" stroke={isDayMode ?"#e5e7eb" :"#374151"} />
 <XAxis dataKey="metric" stroke={isDayMode ?"#6b7280" :"#9ca3af"} />
 <YAxis 
 stroke={isDayMode ?"#6b7280" :"#9ca3af"} 
 tickFormatter={(val) =>`${val}%`}
 label={{ 
 value:"Index (Month 1 = 100)", 
 angle: -90, 
 position:"insideLeft", 
 style: { fill: isDayMode ?"#6b7280" :"#9ca3af"} 
}}
 />
 <Tooltip
 formatter={((val: number | undefined) => [`${val?.toFixed(1) ??"0.0"}%`,"Index"]) as any}
 contentStyle={{
 backgroundColor: isDayMode ?"#ffffff" :"#1f2937",
 border:`1px solid ${isDayMode ?"#e5e7eb" :"#4b5563"}`,
 borderRadius:"8px",
}}
 cursor={{ fill:"transparent"}}
 />
 {visibleMetrics.has("revenue") && (
 <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
)}
 {visibleMetrics.has("loads") && (
 <Bar dataKey="loads" fill="#f59e0b" radius={[4, 4, 0, 0]} />
)}
 {visibleMetrics.has("km") && (
 <Bar dataKey="km" fill="#3b82f6" radius={[4, 4, 0, 0]} />
)}
 </BarChart>
 </ResponsiveContainer>
 </div>
 </>
)}
 </CollapsibleSection>
 </>
)}
 </div>
 </div>
 </>
);
}

function ComparisonMetricCard({
 label,
 value1,
 value2,
 change,
 isVisible,
 onToggle,
}: {
 label: string;
 value1: string;
 value2: string;
 change: number;
 isVisible: boolean;
 onToggle: () => void;
 metric: string;
}) {
 const isPositive = change > 0;
 const isZero = change === 0;const changeColor = isZero 
    ? "text-[var(--nav-text-color)]"
    : isPositive 
      ? "text-emerald-400"
      : "text-red-400";
   const bgClass = isVisible 
    ? "bg-[var(--card-bg)] border-[var(--card-border)]"
    : "bg-[var(--card-bg)] border-[var(--card-border)] opacity-60";
   const textClass = isVisible 
    ? "text-[var(--foreground)]"
    : "text-[var(--nav-text-color)]";
   const secondaryTextClass = "text-[var(--nav-text-color)]";

 return (
 <div className={`border rounded-lg p-4 ${bgClass} transition-all duration-300 cursor-pointer relative group hover:scale-[1.02] hover:shadow-lg`}
 onClick={onToggle}>
 <button 
 className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-xs transition-all duration-200
 ${isVisible      ? "bg-emerald-500/20 text-emerald-400"
      : "bg-[var(--card-bg)] text-[var(--nav-text-color)]"}`}
 onClick={(e) => {
 e.stopPropagation();
 onToggle();
}}
 >
 {isVisible ?"✓" :"✕"}
 </button>
 <div className={`text-xs font-semibold ${secondaryTextClass} uppercase tracking-wider mb-2 pr-6`}>{label}</div>
 <div className={`space-y-2 ${!isVisible ? 'opacity-50' : ''}`}>
 <div className="flex justify-between items-center">
 <span className={`text-xs ${secondaryTextClass}`}>M1</span>
 <span className={`text-base font-bold ${textClass} transition-all duration-300`}>{value1}</span>
 </div>
 <div className="flex justify-between items-center">
 <span className={`text-xs ${secondaryTextClass}`}>M2</span>
 <span className={`text-base font-bold ${textClass} transition-all duration-300`}>{value2}</span>
 </div>
 <div className="flex justify-end items-center pt-1 border-t border-[var(--card-border)]">
 <span className={`text-xs font-bold ${isVisible ? changeColor : secondaryTextClass} transition-all duration-300`}>
 {isPositive ?"+" :""}{change.toFixed(1)}%
 </span>
 </div>
 </div>
 </div>
);
}
