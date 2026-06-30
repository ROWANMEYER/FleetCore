"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import EditRouteForm from "@/src/components/operations/daily-planner/EditRouteForm";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
    new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

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
    const d = new Date(iso + "-01");
    return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
};

const calcLoadAmount = (quantity: string, rate: string, rateType: string) => {
    const q = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    if (rateType === "flat" || rateType === "full") return r;
    return q * r;
};

// ─── filter bar ──────────────────────────────────────────────────────────────

type FilterMode = "day" | "month" | "range";

function FilterBar({
    startDate, endDate, onChange, isDayMode = false,
}: {
    startDate: string;
    endDate: string;
    onChange: (start: string, end: string) => void;
    isDayMode?: boolean;
}) {
    const [mode, setMode] = useState<FilterMode>("range");

    // derive current month string (YYYY-MM) from startDate
    const currentMonth = startDate.slice(0, 7);

    const setDay = (d: string) => onChange(d, d);
    const setMonth = (ym: string) => onChange(monthStart(ym + "-01"), monthEnd(ym + "-01"));

    const tabs: { key: FilterMode; label: string }[] = [
        { key: "day", label: "Day" },
        { key: "month", label: "Month" },
        { key: "range", label: "Range" },
    ];

    const tabsBgClass = isDayMode ? "bg-gray-200 border-gray-300" : "bg-gray-800 border-gray-700";
    const tabActiveClass = isDayMode ? "bg-gray-400 text-white" : "bg-gray-600 text-white";
    const tabInactiveClass = isDayMode ? "text-gray-600 hover:text-gray-800" : "text-gray-400 hover:text-white";
    const inputBgClass = isDayMode ? "bg-gray-100 border-gray-300 text-gray-900" : "bg-gray-800 border-gray-700 text-gray-200";
    const labelTextClass = isDayMode ? "text-gray-700" : "text-gray-500";

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* mode tabs */}
            <div className={`flex border rounded-xl p-1 gap-1 ${tabsBgClass}`}>
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => {
                            setMode(t.key);
                            if (t.key === "day") setDay(today());
                            if (t.key === "month") setMonth(new Date().toISOString().slice(0, 7));
                            if (t.key === "range") onChange(monthStart(), monthEnd());
                        }}
                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all
                            ${mode === t.key
                                ? tabActiveClass
                                : tabInactiveClass}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* inputs */}
            <div className={`flex items-center gap-2 border rounded-xl px-4 py-2 ${inputBgClass}`}>
                {mode === "day" && (
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setDay(e.target.value)}
                        className={`bg-transparent text-sm focus:outline-none ${isDayMode ? "text-gray-900" : "text-gray-200"}`}
                    />
                )}
                {mode === "month" && (
                    <>
                        <button
                            onClick={() => {
                                const d = new Date(currentMonth + "-01");
                                d.setMonth(d.getMonth() - 1);
                                setMonth(d.toISOString().slice(0, 7));
                            }}
                            className={`px-1 font-bold ${isDayMode ? "text-gray-600 hover:text-gray-900" : "text-gray-400 hover:text-white"}`}
                        >‹</button>
                        <span className={`text-sm font-semibold min-w-[140px] text-center ${isDayMode ? "text-gray-900" : "text-gray-200"}`}>
                            {monthLabel(currentMonth)}
                        </span>
                        <button
                            onClick={() => {
                                const d = new Date(currentMonth + "-01");
                                d.setMonth(d.getMonth() + 1);
                                setMonth(d.toISOString().slice(0, 7));
                            }}
                            className={`px-1 font-bold ${isDayMode ? "text-gray-600 hover:text-gray-900" : "text-gray-400 hover:text-white"}`}
                        >›</button>
                    </>
                )}
                {mode === "range" && (
                    <>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => onChange(e.target.value, endDate)}
                            className={`bg-transparent text-sm focus:outline-none ${isDayMode ? "text-gray-900" : "text-gray-200"}`}
                        />
                        <span className={isDayMode ? "text-gray-600" : "text-gray-500"}>→</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => onChange(startDate, e.target.value)}
                            className={`bg-transparent text-sm focus:outline-none ${isDayMode ? "text-gray-900" : "text-gray-200"}`}
                        />
                    </>
                )}
            </div>

            {/* active label */}
            <span className={`text-xs hidden sm:block ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>
                {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
            </span>
        </div>
    );
}

// ─── drill-down types ────────────────────────────────────────────────────────

type DrillDown =
    | { kind: "date"; date: string; label: string }
    | { kind: "status"; status: string; startDate: string; endDate: string; label: string }
    | { kind: "truck"; truck: string; startDate: string; endDate: string; label: string }
    | { kind: "client"; client: string; startDate: string; endDate: string; label: string }
    | { kind: "period"; startDate: string; endDate: string; label: string };

// ─── DrillDown panel ─────────────────────────────────────────────────────────

function DrillDownPanel({ drill, onClose, onAnalyticsClick, onAnalyticsClose, showAnalytics, isDayMode = false, onDrill }: { drill: DrillDown; onClose: () => void; onAnalyticsClick: () => void; onAnalyticsClose: () => void; showAnalytics: boolean; isDayMode?: boolean; onDrill?: (drillData: DrillDown) => void }) {
    const start = drill.kind === "date" ? drill.date : drill.startDate;
    const end = drill.kind === "date" ? drill.date : drill.endDate;

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

    // Track the original period/range when drilling down to a date
    const [parentDrill, setParentDrill] = useState<DrillDown | null>(null);

    // When drill changes and we're going from a period to a date, save the period as parent
    const prevDrillRef = useRef<DrillDown | null>(null);
    useEffect(() => {
        if (prevDrillRef.current && prevDrillRef.current.kind !== "date" && drill.kind === "date") {
            // Transitioning from a non-date drill (period/range) to a date drill
            setParentDrill(prevDrillRef.current);
        }
        prevDrillRef.current = drill;
    }, [drill]);

    const panelTheme = {
        bg: {
            primary: isDayMode ? "bg-white" : "bg-gray-950",
            secondary: isDayMode ? "bg-gray-50" : "bg-gray-900",
            tertiary: isDayMode ? "bg-gray-100" : "bg-gray-800",
        },
        text: {
            primary: isDayMode ? "text-gray-900" : "text-white",
            secondary: isDayMode ? "text-gray-700" : "text-gray-400",
            tertiary: isDayMode ? "text-gray-600" : "text-gray-500",
        },
        border: isDayMode ? "border-gray-200" : "border-gray-700",
    };

    const routes = useQuery(api.dailyRoutes.getForSheets, { startDate: start, endDate: end });

    const filtered = (routes ?? []).filter((r) => {
        if (drill.kind === "status") return ((r as any).status ?? "planned") === drill.status;
        if (drill.kind === "truck") return r.truckFleetNoStr === drill.truck;
        if (drill.kind === "client") return r.client === drill.client;
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

    const statusColour: Record<string, string> = {
        planned: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
        completed: "text-green-400 bg-green-500/10 border-green-500/30",
        locked: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    };

    const handleDeleteRoute = async () => {
        if (!deletingRouteId) return;
        try {
            await deleteDailyRoute({ id: deletingRouteId });
            setShowDeleteConfirm(false);
            setDeletingRouteId(null);
        } catch (error) {
            console.error("Failed to delete route:", error);
            alert("Failed to delete route. It might be locked.");
            setShowDeleteConfirm(false);
            setDeletingRouteId(null);
        }
    };

    const handleEditClick = (routeId: Id<"dailyRoutes">) => {
        setEditingRouteId(routeId);
    };

    const handleDeleteClick = (routeId: Id<"dailyRoutes">) => {
        setDeletingRouteId(routeId);
        setShowDeleteConfirm(true);
    };

    // Custom Tooltip Component for Revenue Chart
    const RevenueTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div style={{
                    backgroundColor: isDayMode ? "#ffffff" : "#111827",
                    border: `1px solid ${isDayMode ? "#d1d5db" : "#4b5563"}`,
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: isDayMode ? "0 10px 15px -3px rgb(0,0,0,0.1)" : "0 20px 25px -5px rgb(0,0,0,0.5)",
                    backdropFilter: "blur(4px)",
                    minWidth: "200px"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                        <div>
                            <p style={{
                                fontSize: "12px",
                                fontWeight: "bold",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: isDayMode ? "#6b7280" : "#9ca3af",
                                margin: "0"
                            }}>Date</p>
                            <p style={{
                                fontSize: "14px",
                                fontWeight: "600",
                                color: isDayMode ? "#111827" : "#ffffff",
                                margin: "4px 0 0 0"
                            }}>{data.date}</p>
                        </div>
                    </div>
                    <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: `1px solid ${isDayMode ? "#e5e7eb" : "#374151"}`
                    }}>
                        <p style={{
                            fontSize: "12px",
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: isDayMode ? "#6b7280" : "#9ca3af",
                            margin: "0"
                        }}>Revenue</p>
                        <p style={{
                            fontSize: "18px",
                            fontWeight: "900",
                            color: "#4ade80",
                            margin: "8px 0 0 0"
                        }}>{fmt(data.revenue)}</p>
                    </div>
                    <div style={{
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: `1px solid ${isDayMode ? "#e5e7eb" : "#374151"}`
                    }}>
                        <p style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: isDayMode ? "#4b5563" : "#9ca3af",
                            margin: "0"
                        }}>{data.routes} {data.routes === 1 ? 'route' : 'routes'}</p>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Custom Tooltip Component for Routes Chart
    const RoutesToolip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div style={{
                    backgroundColor: isDayMode ? "#ffffff" : "#111827",
                    border: `1px solid ${isDayMode ? "#d1d5db" : "#4b5563"}`,
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: isDayMode ? "0 10px 15px -3px rgb(0,0,0,0.1)" : "0 20px 25px -5px rgb(0,0,0,0.5)",
                    backdropFilter: "blur(4px)",
                    minWidth: "200px"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
                        <div>
                            <p style={{
                                fontSize: "12px",
                                fontWeight: "bold",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: isDayMode ? "#6b7280" : "#9ca3af",
                                margin: "0"
                            }}>Date</p>
                            <p style={{
                                fontSize: "14px",
                                fontWeight: "600",
                                color: isDayMode ? "#111827" : "#ffffff",
                                margin: "4px 0 0 0"
                            }}>{data.date}</p>
                        </div>
                    </div>
                    <div style={{
                        marginTop: "12px",
                        paddingTop: "12px",
                        borderTop: `1px solid ${isDayMode ? "#e5e7eb" : "#374151"}`
                    }}>
                        <p style={{
                            fontSize: "12px",
                            fontWeight: "bold",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: isDayMode ? "#6b7280" : "#9ca3af",
                            margin: "0"
                        }}>Routes</p>
                        <p style={{
                            fontSize: "18px",
                            fontWeight: "900",
                            color: "#60a5fa",
                            margin: "8px 0 0 0"
                        }}>{data.count}</p>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="fixed inset-0 z-50 flex">
            {/* backdrop - fills remaining space, clickable to close */}
            <div className="flex-1 bg-black/60 cursor-pointer" onClick={onClose} />

            {/* panels container - side by side */}
            <div className="flex h-full">
                {/* analytics panel - shown on left when active */}
                {showAnalytics && (
                    <div className={`w-full max-w-4xl ${panelTheme.bg.primary} border-r ${panelTheme.border} flex flex-col h-full shadow-2xl`}>
                        {/* header */}
                        <div className={`flex items-start justify-between px-6 py-5 border-b ${panelTheme.border}`}>
                            <div>
                                <h2 className={`text-lg font-black ${panelTheme.text.primary}`}>Analytics Dashboard</h2>
                                <p className={`text-xs ${panelTheme.text.secondary} mt-1`}>{start} → {end}</p>
                            </div>
                            <button onClick={onAnalyticsClose} className={`${isDayMode ? "text-gray-600 hover:text-gray-900" : "text-gray-500 hover:text-white"} text-xl font-bold leading-none mt-1`}>✕</button>
                        </div>

                        {/* analytics content */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                            {/* Active Filter Badge */}
                            {activeFilter && (
                                <div className={`${isDayMode ? "bg-blue-100" : "bg-blue-900/50"} border ${isDayMode ? "border-blue-300" : "border-blue-700"} rounded-lg px-3 py-2`}>
                                    <p className={`text-xs ${isDayMode ? "text-blue-800" : "text-blue-300"}`}>
                                        <span className="font-semibold">Filtered by Client:</span> {activeFilter}
                                    </p>
                                </div>
                            )}
                            
                            {/* KPI Cards with Progress Bars */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-4`}>
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Routes</h3>
                                        <span className="text-xs text-emerald-400 font-bold">↑ Active</span>
                                    </div>
                                    <p className={`text-2xl font-black ${panelTheme.text.primary}`}>{filteredData.length}</p>
                                    <div className={`mt-2 w-full ${isDayMode ? "bg-gray-300" : "bg-gray-800"} rounded-full h-1.5`}>
                                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${Math.min(100, (filteredData.length / 10) * 100)}%`}}></div>
                                    </div>
                                </div>
                                <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-4`}>
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Revenue</h3>
                                        <span className="text-xs text-emerald-400 font-bold">Peak</span>
                                    </div>
                                    <p className="text-2xl font-black text-emerald-400">{fmt(totalRevenue).replace('R', '')}</p>
                                    <div className={`mt-2 w-full ${isDayMode ? "bg-gray-300" : "bg-gray-800"} rounded-full h-1.5`}>
                                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${Math.min(100, (totalRevenue / 50000) * 100)}%`}}></div>
                                    </div>
                                </div>
                                <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-4`}>
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Distance</h3>
                                        <span className="text-xs text-blue-400 font-bold">Coverage</span>
                                    </div>
                                    <p className="text-2xl font-black text-blue-400">{fmtNum(totalKm)}</p>
                                    <div className={`mt-2 w-full ${isDayMode ? "bg-gray-300" : "bg-gray-800"} rounded-full h-1.5`}>
                                        <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${Math.min(100, (totalKm / 5000) * 100)}%`}}></div>
                                    </div>
                                </div>
                                <div className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-lg p-4`}>
                                    <div className="flex items-baseline justify-between mb-2">
                                        <h3 className={`text-xs font-semibold ${panelTheme.text.secondary} uppercase`}>Revenue/KM</h3>
                                        <span className="text-xs text-purple-400 font-bold">Efficiency</span>
                                    </div>
                                    <p className="text-2xl font-black text-purple-400">{fmt(totalKm > 0 ? totalRevenue / totalKm : 0).replace('R', '')}</p>
                                    <div className={`mt-2 w-full ${isDayMode ? "bg-gray-300" : "bg-gray-800"} rounded-full h-1.5`}>
                                        <div className="bg-purple-500 h-1.5 rounded-full" style={{width: `${Math.min(100, ((totalKm > 0 ? totalRevenue / totalKm : 0) / 50) * 100)}%`}}></div>
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
                                        acc.push({ date, revenue, routes: 1 });
                                    }
                                    return acc;
                                }, []).sort((a, b) => a.date.localeCompare(b.date));

                                const gridColor = isDayMode ? "#e5e7eb" : "#374151";
                                const axisColor = isDayMode ? "#6b7280" : "#9CA3AF";
                                const tooltipBg = isDayMode ? "#f3f4f6" : "#111827";
                                const tooltipBorder = isDayMode ? "#d1d5db" : "#374151";
                                const tooltipText = isDayMode ? "#1f2937" : "#fff";

                                const handleChartClick = (data: any) => {
                                    if (onDrill && data && data.date) {
                                        onDrill({ kind: "date", date: data.date, label: `Revenue detail — ${data.date}` });
                                    }
                                };

                                // Simple dot component - clicking is handled by overlay
                                const RevenueDot = (props: any) => {
                                    const { cx, cy, stroke } = props;
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
                                                    pointerEvents: "none",
                                                    transition: "opacity 0.3s ease"
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
                                                    pointerEvents: "none",
                                                    filter: "drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))",
                                                    transition: "r 0.3s ease"
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
                                                }}
                                                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                                    showRevenueFilters 
                                                        ? isDayMode ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
                                                        : isDayMode ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                                }`}
                                            >
                                                {showRevenueFilters ? "✕ Filters" : "⊕ Filters"}
                                            </button>
                                        </div>

                                        {/* Revenue Filter UI */}
                                        {showRevenueFilters && (
                                            <div className={`mb-3 p-3 rounded ${isDayMode ? "bg-gray-100" : "bg-gray-800"} border ${panelTheme.border}`}>
                                                <p className={`text-xs font-semibold ${panelTheme.text.secondary} mb-2`}>Filter by Client</p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => setRevenueSelectedClient(null)}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                                            revenueSelectedClient === null
                                                                ? isDayMode ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
                                                                : isDayMode ? "bg-gray-200 text-gray-700" : "bg-gray-700 text-gray-300"
                                                        }`}
                                                    >
                                                        All
                                                    </button>
                                                    {uniqueClients.map(client => (
                                                        <button
                                                            key={client}
                                                            onClick={() => setRevenueSelectedClient(client)}
                                                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                                                revenueSelectedClient === client
                                                                    ? isDayMode ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
                                                                    : isDayMode ? "bg-gray-200 text-gray-700" : "bg-gray-700 text-gray-300"
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
                                                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="date" stroke={axisColor} style={{ fontSize: "10px" }} />
                                                    <YAxis stroke={axisColor} style={{ fontSize: "10px" }} />
                                                    <Tooltip 
                                                        content={RevenueTooltip}
                                                        cursor={{ 
                                                            stroke: '#10b981', 
                                                            strokeWidth: 2, 
                                                            opacity: 0.3,
                                                            fill: '#10b981',
                                                            fillOpacity: 0.05
                                                        }}
                                                        wrapperStyle={{ outline: "none", zIndex: 999 }}
                                                    />
                                                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={<RevenueDot stroke="#10b981" />} activeDot={{ r: 7 }} isAnimationActive={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                            {/* Clickable overlay for drill-down */}
                                            <svg 
                                                width="100%" 
                                                height="200"
                                                style={{ 
                                                    position: "absolute", 
                                                    top: 0, 
                                                    left: 0,
                                                    pointerEvents: "auto",
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
                                        acc.push({ date, count: 1 });
                                    }
                                    return acc;
                                }, []).sort((a, b) => a.date.localeCompare(b.date));

                                const gridColor = isDayMode ? "#e5e7eb" : "#374151";
                                const axisColor = isDayMode ? "#6b7280" : "#9CA3AF";
                                const tooltipBg = isDayMode ? "#f3f4f6" : "#111827";
                                const tooltipBorder = isDayMode ? "#d1d5db" : "#374151";
                                const tooltipText = isDayMode ? "#1f2937" : "#fff";

                                const handleBarClick = (data: any) => {
                                    if (onDrill) {
                                        onDrill({ kind: "date", date: data.date, label: `Routes detail — ${data.date}` });
                                    }
                                };

                                const CustomBar = (props: any) => {
                                    const { fill, x, y, width, height } = props;
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
                                                    pointerEvents: "none", 
                                                    opacity: 0.15,
                                                    filter: "blur(4px)"
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
                                                    pointerEvents: "none", 
                                                    opacity: 0.85,
                                                    filter: "drop-shadow(0 0 4px rgba(59, 130, 246, 0.3))",
                                                    transition: "opacity 0.3s ease"
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
                                                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                                    showRoutesFilters 
                                                        ? isDayMode ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
                                                        : isDayMode ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                                }`}
                                            >
                                                {showRoutesFilters ? "✕ Filters" : "⊕ Filters"}
                                            </button>
                                        </div>

                                        {/* Routes Filter UI */}
                                        {showRoutesFilters && (
                                            <div className={`mb-3 p-3 rounded ${isDayMode ? "bg-gray-100" : "bg-gray-800"} border ${panelTheme.border}`}>
                                                <p className={`text-xs font-semibold ${panelTheme.text.secondary} mb-2`}>Filter by Client</p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => setRoutesSelectedClient(null)}
                                                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                                            routesSelectedClient === null
                                                                ? isDayMode ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
                                                                : isDayMode ? "bg-gray-200 text-gray-700" : "bg-gray-700 text-gray-300"
                                                        }`}
                                                    >
                                                        All
                                                    </button>
                                                    {uniqueClients.map(client => (
                                                        <button
                                                            key={client}
                                                            onClick={() => setRoutesSelectedClient(client)}
                                                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                                                                routesSelectedClient === client
                                                                    ? isDayMode ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
                                                                    : isDayMode ? "bg-gray-200 text-gray-700" : "bg-gray-700 text-gray-300"
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
                                                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                                    <XAxis dataKey="date" stroke={axisColor} style={{ fontSize: "10px" }} />
                                                    <YAxis stroke={axisColor} style={{ fontSize: "10px" }} />
                                                    <Tooltip
                                                        cursor={{
                                                            fill: '#3b82f6',
                                                            fillOpacity: 0.15
                                                        }}
                                                        wrapperStyle={{ outline: "none", zIndex: 999 }}
                                                    />
                                                    <Bar dataKey="count" fill="#3b82f6" shape={<CustomBar />} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                            {/* Clickable overlay for drill-down */}
                                            <svg 
                                                width="100%" 
                                                height="150"
                                                style={{ 
                                                    position: "absolute", 
                                                    top: 0, 
                                                    left: 0,
                                                    pointerEvents: "auto",
                                                    opacity: 0,
                                                    cursor: "pointer"
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
                )}

                {/* main drill-down panel */}
                <div className={`w-full max-w-4xl ${panelTheme.bg.primary} border-l ${panelTheme.border} flex flex-col h-full shadow-2xl`}>
                {/* header */}
                <div className={`flex items-start justify-between px-6 py-5 border-b ${panelTheme.border}`}>
                    <div className="flex-1">
                        {/* Breadcrumb Navigation */}
                        {drill.kind === "date" && parentDrill && (
                            <div className="mb-2">
                                <button
                                    onClick={() => {
                                        // Navigate back to the original period/range
                                        if (onDrill) {
                                            onDrill(parentDrill);
                                        }
                                    }}
                                    className={`text-xs font-semibold ${isDayMode ? "text-blue-600 hover:text-blue-800" : "text-blue-400 hover:text-blue-300"} transition-colors flex items-center gap-1`}
                                >
                                    <span>←</span> Back to {parentDrill.kind === "period" ? "Range" : parentDrill.kind}
                                </button>
                            </div>
                        )}
                        <h2 className={`text-lg font-black ${panelTheme.text.primary}`}>{drill.label}</h2>
                        <p className={`text-xs ${panelTheme.text.secondary} mt-1`}>
                            {drill.kind === "date" ? drill.date : `${drill.startDate} → ${drill.endDate}`}
                        </p>
                    </div>
                    <button onClick={onClose} className={`${isDayMode ? "text-gray-600 hover:text-gray-900" : "text-gray-500 hover:text-white"} text-xl font-bold leading-none mt-1 shrink-0`}>✕</button>
                </div>

                {/* summary strip */}
                <div className={`grid grid-cols-4 gap-px ${isDayMode ? "bg-gray-300" : "bg-gray-800"} border-b ${panelTheme.border}`}>
                    {[
                        { label: "Routes", value: String(filteredData.length) },
                        { label: "Revenue", value: fmt(totalRevenue) },
                        { label: "KM", value: fmtNum(totalKm) },
                    ].map((k) => (
                        <div key={k.label} className={`${panelTheme.bg.secondary} px-4 py-3 flex flex-col gap-0.5`}>
                            <span className={`text-xs ${panelTheme.text.tertiary} uppercase tracking-wider`}>{k.label}</span>
                            <span className={`text-base font-black ${panelTheme.text.primary}`}>{k.value}</span>
                        </div>
                    ))}
                    {/* Graph Card - Analytics */}
                    <button onClick={onAnalyticsClick} className="bg-gray-900 px-4 py-3 flex flex-col gap-2 items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors border border-gray-800 hover:border-gray-600">
                        <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-xs text-gray-300 uppercase tracking-wider text-center font-semibold">Analytics</span>
                    </button>
                </div>

                {/* route list */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {!routes ? (
                        <p className={`${panelTheme.text.tertiary} text-sm text-center py-12`}>Loading…</p>
                    ) : filteredData.length === 0 ? (
                        <p className={`${panelTheme.text.tertiary} text-sm text-center py-12`}>No routes found.</p>
                    ) : (
                        filteredData.map((r) => {
                            const status = (r as any).status ?? "planned";
                            const routeRevenue = (r.loads ?? []).reduce(
                                (s, l) => s + calcLoadAmount(l.quantity, l.rate, l.rateType), 0
                            );
                            return (
                                <div key={r._id} className={`${panelTheme.bg.secondary} border ${panelTheme.border} rounded-xl p-4 space-y-3`}>
                                    {/* route header */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`text-sm font-black ${panelTheme.text.primary} shrink-0`}>
                                                Truck {r.truckFleetNoStr ?? "—"}
                                            </span>
                                            {r.trailerFleetNoStr && (
                                                <span className={`text-xs ${panelTheme.text.tertiary}`}>· Trailer {r.trailerFleetNoStr}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleEditClick(r._id)}
                                                className={`p-1.5 rounded transition-all ${isDayMode ? "text-blue-500 hover:bg-blue-50" : "text-blue-400 hover:bg-blue-500/20"}`}
                                                title="Edit Route"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClick(r._id)}
                                                className={`p-1.5 rounded transition-all ${isDayMode ? "text-red-500 hover:bg-red-50" : "text-red-400 hover:bg-red-500/20"}`}
                                                title="Delete Route"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                            <div 
                                                className={`p-1.5 rounded-full flex items-center justify-center transition-all cursor-help
                                                    ${status === "completed" ? (isDayMode ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20") 
                                                    : status === "locked" ? (isDayMode ? "text-blue-600 bg-blue-50 hover:bg-blue-100" : "text-blue-400 bg-blue-500/10 hover:bg-blue-500/20") 
                                                    : (isDayMode ? "text-yellow-600 bg-yellow-50 hover:bg-yellow-100" : "text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20")}`}
                                                title={`Status: ${status}`}
                                            >
                                                {status === "completed" ? (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                ) : status === "locked" ? (
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
                                                ? "bg-emerald-50 text-emerald-600 border-emerald-200 shadow-sm" 
                                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
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
                                                                {(l.fromLocations ?? []).join(", ")} → {(l.toLocations ?? []).join(", ")}
                                                            </span>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className={panelTheme.text.primary}>{l.quantity} {l.quantityType}</span>
                                                            {hasMultipleLoads && (
                                                                <span className={`${isDayMode ? "text-emerald-600/70" : "text-emerald-400/70"} font-semibold ml-2`}>{fmt(amount)}</span>
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
                                className={`px-4 py-2 text-sm font-medium ${panelTheme.text.secondary} border ${panelTheme.border} rounded-lg hover:${panelTheme.bg.secondary} transition-all`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteRoute}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
                            >
                                Delete Route
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal - Using EditRouteForm Component */}
            {editingRouteId && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-end animate-in fade-in duration-200">
                    <div className={`w-full max-w-2xl h-full flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl overflow-hidden ${isDayMode ? "bg-white" : "bg-gray-950"}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b flex-shrink-0 ${isDayMode ? "bg-white border-gray-200" : "bg-gray-950 border-gray-800"}`}>
                            <h2 className={`text-lg font-bold ${isDayMode ? "text-gray-900" : "text-white"}`}>Edit Route</h2>
                            <button 
                                onClick={() => setEditingRouteId(null)}
                                className={`p-1 rounded-full transition-colors ${isDayMode ? "text-gray-500 hover:text-gray-700 hover:bg-gray-100" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
                            >
                                ✕
                            </button>
                        </div>
                        <div className={`flex-1 overflow-y-auto p-6 ${isDayMode ? "bg-gray-50" : "bg-gray-900"}`}>
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
    label, value, sub, accent, onClick, isDayMode = false,
}: {
    label: string; value: string; sub?: string; accent?: string; onClick?: () => void; isDayMode?: boolean;
}) {
    const bgClass = isDayMode ? "bg-gray-100 border-gray-200 hover:bg-gray-200 hover:border-gray-300" : "bg-gray-900/80 border-gray-700 hover:bg-gray-800/80 hover:border-gray-500";
    const labelClass = isDayMode ? "text-gray-600" : "text-gray-400";
    const subClass = isDayMode ? "text-gray-500" : "text-gray-500";
    const drillClass = isDayMode ? "text-gray-400" : "text-gray-600";
    const valueClass = accent ?? (isDayMode ? "text-gray-900" : "text-white");
    
    return (
        <button
            onClick={onClick}
            className={`border rounded-xl p-5 flex flex-col gap-1 text-left w-full transition-all ${bgClass}
                ${onClick ? "cursor-pointer active:scale-95" : "cursor-default"}`}
        >
            <span className={`text-xs font-semibold ${labelClass} uppercase tracking-wider`}>{label}</span>
            <span className={`text-2xl font-black ${valueClass}`}>{value}</span>
            {sub && <span className={`text-xs ${subClass}`}>{sub}</span>}
            {onClick && <span className={`text-xs ${drillClass} mt-1`}>Tap to drill down →</span>}
        </button>
    );
}

function SectionHeader({ title, isDayMode = false }: { title: string; isDayMode?: boolean }) {
    const textClass = isDayMode ? "text-gray-600" : "text-gray-400";
    return <h2 className={`text-sm font-bold ${textClass} uppercase tracking-widest mb-3`}>{title}</h2>;
}

function StatusPill({
    status, count, onClick, isDayMode = false,
}: {
    status: string; count: number; onClick?: () => void; isDayMode?: boolean;
}) {
    const colours: Record<string, string> = {
        planned: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30 hover:bg-yellow-500/25",
        completed: "bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/25",
        locked: "bg-blue-500/15 text-blue-600 border-blue-500/30 hover:bg-blue-500/25",
    };
    
    const dayColours: Record<string, string> = {
        planned: "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200",
        completed: "bg-green-100 text-green-700 border-green-300 hover:bg-green-200",
        locked: "bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200",
    };
    
    const colourMap = isDayMode ? dayColours : colours;
    
    return (
        <button
            onClick={onClick}
            className={`flex items-center justify-between px-4 py-3 rounded-lg border w-full transition-all
                ${colourMap[status] ?? (isDayMode ? "bg-gray-200 text-gray-700 border-gray-300" : "bg-gray-700/30 text-gray-300 border-gray-600")}
                ${onClick ? "cursor-pointer active:scale-95" : "cursor-default"}`}
        >
            <span className="text-sm font-semibold capitalize">{status}</span>
            <div className="flex items-center gap-2">
                <span className="text-lg font-black">{count}</span>
                {onClick && <span className="text-xs opacity-60">→</span>}
            </div>
        </button>
    );
}

function ProgressBar({ pct, colour }: { pct: number; colour: string }) {
    return (
        <div className="w-full bg-gray-700/40 rounded-full h-2 overflow-hidden">
            <div className={`h-2 rounded-full ${colour}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
    );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [startDate, setStartDate] = useState(monthStart());
    const [endDate, setEndDate] = useState(monthEnd());
    const [drill, setDrill] = useState<DrillDown | null>(null);
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [mounted, setMounted] = useState(false);

    const { resolvedTheme } = useTheme();
    const isDayMode = mounted ? resolvedTheme !== "dark" : true;

    useEffect(() => {
        setMounted(true);
    }, []);
    
    // Theme colors
    const themeClasses = {
        bg: {
            primary: isDayMode ? "bg-white" : "bg-gray-950/90",
            secondary: isDayMode ? "bg-gray-50" : "bg-gray-900",
            tertiary: isDayMode ? "bg-gray-100" : "bg-gray-800",
        },
        text: {
            primary: isDayMode ? "text-gray-900" : "text-white",
            secondary: isDayMode ? "text-gray-600" : "text-gray-400",
            tertiary: isDayMode ? "text-gray-500" : "text-gray-500",
        },
        border: isDayMode ? "border-gray-200" : "border-gray-700",
    };

    const todayStr = today();

    const summary = useQuery(api.dashboard.getExecutiveSummary, { startDate, endDate });
    const todaySummary = useQuery(api.dashboard.getDashboardLoadsSummary, { startDate: todayStr, endDate: todayStr });
    const statusBreakdown = useQuery(api.dashboard.getRoutesByStatus, { startDate, endDate });
    const topClients = useQuery(api.dashboard.getCustomerAnalytics, { startDate, endDate });
    const fleetPerf = useQuery(api.dashboard.getFleetPerformance, { startDate, endDate });
    const revenueOverTime = useQuery(api.dashboard.getRevenueOverTime, { startDate, endDate });

    const loading = !summary || !todaySummary || !statusBreakdown || !topClients || !fleetPerf;
    const maxRevDay = revenueOverTime ? Math.max(...revenueOverTime.map((d) => d.revenue), 1) : 1;

    return (
        <>
            {drill && <DrillDownPanel drill={drill} onClose={() => setDrill(null)} onAnalyticsClick={() => setShowAnalytics(true)} onAnalyticsClose={() => setShowAnalytics(false)} showAnalytics={showAnalytics} isDayMode={isDayMode} onDrill={(newDrill) => setDrill(newDrill)} />}

            <div className={`flex-1 overflow-y-auto ${themeClasses.bg.primary} ${themeClasses.text.primary} transition-colors duration-300`}>
                <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">

                    {/* ── Header ── */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
                                <p className={`${themeClasses.text.secondary} text-sm mt-1`}>Fleet operations overview · tap any card to drill down</p>
                            </div>
                        </div>
                        <FilterBar
                            startDate={startDate}
                            endDate={endDate}
                            isDayMode={isDayMode}
                            onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                        />
                    </div>

                    {loading ? (
                        <div className={`flex items-center justify-center py-32 ${themeClasses.text.secondary} text-sm`}>Loading…</div>
                    ) : (
                        <>
                            {/* ── Today ── */}
                            <section>
                                <SectionHeader title="Today" isDayMode={isDayMode} />
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <KpiCard label="Routes today" value={String(todaySummary.totalRoutes)} isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "date", date: todayStr, label: "All routes today" })} />
                                    <KpiCard label="Completed" value={String(todaySummary.completedRoutes)} accent="text-green-400" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "status", status: "completed", startDate: todayStr, endDate: todayStr, label: "Completed routes today" })} />
                                    <KpiCard label="Pending" value={String(todaySummary.incompleteRoutes)} accent="text-yellow-400" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "status", status: "planned", startDate: todayStr, endDate: todayStr, label: "Pending routes today" })} />
                                    <KpiCard label="KM today" value={fmtNum(todaySummary.totalKm)} sub="kilometres" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "date", date: todayStr, label: "KM breakdown — today" })} />
                                </div>
                            </section>

                            {/* ── Period KPIs ── */}
                            <section>
                                <SectionHeader title={`Period  ${startDate}  →  ${endDate}`} isDayMode={isDayMode} />
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                    <KpiCard label="Revenue" value={fmt(summary.totalRevenue)} accent="text-emerald-400" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "Revenue — all routes" })} />
                                    <KpiCard label="Routes" value={fmtNum(summary.totalRoutes)} isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "All routes this period" })} />
                                    <KpiCard label="Loads" value={fmtNum(summary.totalLoads)} isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "Loads breakdown" })} />
                                    <KpiCard label="Total KM" value={fmtNum(summary.totalKm)} isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "KM breakdown" })} />
                                    <KpiCard label="Completion" value={`${Math.round(summary.completionRate)}%`} isDayMode={isDayMode}
                                        accent={summary.completionRate >= 80 ? "text-green-400" : "text-yellow-400"}
                                        onClick={() => setDrill({ kind: "status", status: "completed", startDate, endDate, label: "Completed routes this period" })} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                                    <KpiCard label="Rev / Route" value={fmt(summary.revenuePerRoute)} sub="average" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "Revenue per route detail" })} />
                                    <KpiCard label="Rev / Load" value={fmt(summary.revenuePerLoad)} sub="average" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "Revenue per load detail" })} />
                                    <KpiCard label="Rev / KM" value={`R ${summary.revenuePerKm.toFixed(2)}`} sub="average" isDayMode={isDayMode}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "Revenue per KM detail" })} />
                                </div>
                            </section>

                            {/* ── Status + Revenue chart ── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <section className={`${themeClasses.bg.secondary} border ${themeClasses.border} rounded-xl p-5`}>
                                    <SectionHeader title="Route Status" isDayMode={isDayMode} />
                                    <div className="space-y-3">
                                        {(statusBreakdown ?? []).map((s) => (
                                            <StatusPill key={s.status} status={s.status} count={s.count} isDayMode={isDayMode}
                                                onClick={() => setDrill({ kind: "status", status: s.status, startDate, endDate, label: `${s.status.charAt(0).toUpperCase() + s.status.slice(1)} routes` })} />
                                        ))}
                                    </div>
                                </section>

                                <section className={`${themeClasses.bg.secondary} border ${themeClasses.border} rounded-xl p-5`}>
                                    <SectionHeader title="Revenue by Day — tap a row" isDayMode={isDayMode} />
                                    {!revenueOverTime || revenueOverTime.length === 0 ? (
                                        <p className="text-gray-500 text-sm">No data for this period.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                            {revenueOverTime.map((d) => (
                                                <button key={d.date} onClick={() => setDrill({ kind: "date", date: d.date, label: `Routes on ${d.date}` })}
                                                    className="flex items-center gap-3 w-full hover:bg-gray-800/60 rounded-lg px-1 py-1 transition-colors group">
                                                    <span className="text-xs text-gray-400 w-24 shrink-0 group-hover:text-white">{d.date}</span>
                                                    <div className="flex-1">
                                                        <ProgressBar pct={(d.revenue / maxRevDay) * 100} colour="bg-emerald-500" />
                                                    </div>
                                                    <span className="text-xs text-gray-300 w-24 text-right shrink-0 group-hover:text-emerald-400">{fmt(d.revenue)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>

                            {/* ── Top clients + Top trucks ── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <section className={`${themeClasses.bg.secondary} border ${themeClasses.border} rounded-xl p-5`}>
                                    <SectionHeader title="Top Clients — tap to drill down" isDayMode={isDayMode} />
                                    {(topClients.topCustomers ?? []).length === 0 ? (
                                        <p className={`text-sm ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>No data.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {topClients.topCustomers.slice(0, 8).map((c, i) => {
                                                const pct = summary.totalRevenue > 0 ? (c.revenue / summary.totalRevenue) * 100 : 0;
                                                return (
                                                    <button key={c.name} onClick={() => setDrill({ kind: "client", client: c.name, startDate, endDate, label: `${c.name} — routes` })}
                                                        className={`w-full space-y-1 rounded-lg px-2 py-1.5 transition-colors text-left group ${
                                                            isDayMode
                                                                ? "hover:bg-gray-200 text-gray-900"
                                                                : "hover:bg-gray-800/50 text-gray-200"
                                                        }`}>
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-sm font-semibold truncate max-w-[60%] ${
                                                                isDayMode
                                                                    ? "group-hover:text-gray-950"
                                                                    : "group-hover:text-white"
                                                            }`}>
                                                                <span className={`mr-2 ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>#{i + 1}</span>{c.name}
                                                            </span>
                                                            <div className="text-right">
                                                                <span className="text-sm font-bold text-emerald-400">{fmt(c.revenue)}</span>
                                                                <span className={`text-xs ml-2 ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>{c.loads} loads</span>
                                                            </div>
                                                        </div>
                                                        <ProgressBar pct={pct} colour="bg-emerald-600" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>

                                <section className={`${themeClasses.bg.secondary} border ${themeClasses.border} rounded-xl p-5`}>
                                    <SectionHeader title="Top Trucks — tap to drill down" isDayMode={isDayMode} />
                                    {(fleetPerf.topTrucks ?? []).length === 0 ? (
                                        <p className={`text-sm ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>No data.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {fleetPerf.topTrucks.slice(0, 8).map((t, i) => {
                                                const pct = summary.totalRevenue > 0 ? (t.revenue / summary.totalRevenue) * 100 : 0;
                                                return (
                                                    <button key={t.truckNumber} onClick={() => setDrill({ kind: "truck", truck: t.truckNumber, startDate, endDate, label: `Truck ${t.truckNumber} — routes` })}
                                                        className={`w-full space-y-1 rounded-lg px-2 py-1.5 transition-colors text-left group ${
                                                            isDayMode
                                                                ? "hover:bg-gray-200 text-gray-900"
                                                                : "hover:bg-gray-800/50 text-gray-200"
                                                        }`}>
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-sm font-semibold ${
                                                                isDayMode
                                                                    ? "group-hover:text-gray-950"
                                                                    : "group-hover:text-white"
                                                            }`}>
                                                                <span className={`mr-2 ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>#{i + 1}</span>Truck {t.truckNumber}
                                                            </span>
                                                            <div className="text-right">
                                                                <span className="text-sm font-bold text-blue-400">{fmt(t.revenue)}</span>
                                                                <span className={`text-xs ml-2 ${isDayMode ? "text-gray-600" : "text-gray-500"}`}>{t.routes} routes · {fmtNum(t.km)} km</span>
                                                            </div>
                                                        </div>
                                                        <ProgressBar pct={pct} colour="bg-blue-600" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </div>

                            {/* ── Fleet summary ── */}
                            <section className={`${themeClasses.bg.secondary} border ${themeClasses.border} rounded-xl p-5`}>
                                <SectionHeader title="Fleet Summary" isDayMode={isDayMode} />
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <KpiCard label="Active trucks" value={String(fleetPerf.totalTrucksActive)}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "All active trucks this period" })} />
                                    <KpiCard label="Unique clients" value={String(topClients.totalUniqueCustomers)}
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "All clients this period" })} />
                                    <KpiCard label="Avg KM / route" value={fmtNum(summary.avgKmPerRoute)} sub="kilometres"
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "KM per route breakdown" })} />
                                    <KpiCard label="Rev / KM fleet" value={`R ${fleetPerf.avgRevenuePerKm.toFixed(2)}`} sub="per kilometre" accent="text-emerald-400"
                                        onClick={() => setDrill({ kind: "period", startDate, endDate, label: "Revenue per KM — all routes" })} />
                                </div>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
