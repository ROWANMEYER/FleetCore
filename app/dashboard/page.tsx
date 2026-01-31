"use client";

import { useState, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import LoadsTab from "@/src/components/dashboard/operations/LoadsTab";
import RevenueTab from "@/src/components/dashboard/operations/RevenueTab";
import FinanceSection from "@/src/components/dashboard/operations/FinanceSection";
import WorkspaceSplit from "@/src/components/workspace/WorkspaceSplit";
import SheetsPage from "../operations/daily-planner/sheets/page";
import DashboardCard from "@/src/components/dashboard/DashboardCard";

export default function DashboardPage() {
    return (
        <Suspense fallback={null}>
            <DashboardContent />
        </Suspense>
    );
}

function DashboardContent() {
    const [activeTab, setActiveTab] = useState<"loads" | "revenue">("loads");
    const [showSheets, setShowSheets] = useState(false);

    // Date Logic
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [startDate, setStartDate] = useState(
        firstDayOfMonth.toISOString().split("T")[0]
    );
    const [endDate, setEndDate] = useState(
        lastDayOfMonth.toISOString().split("T")[0]
    );

    // Data Fetching - Today's Stats (Primary Row)
    const todayLoads = useQuery(api.dashboard.getDashboardLoadsSummary, {
        startDate: todayStr,
        endDate: todayStr,
    });
    
    const todayRevenue = useQuery(api.dashboard.getDashboardRevenueSummary, {
        startDate: todayStr,
        endDate: todayStr,
    });

    // Secondary KPI Data
    const truckStats = useQuery(api.fleet.getTruckStats);
    const driverStats = useQuery(api.fleet.getDriverStats);
    const clientBreakdown = useQuery(api.dashboard.getClientBreakdown, {
        startDate: startDate,
        endDate: endDate,
    });

    // Helper for currency
    const formatZAR = (value: number) => {
        return new Intl.NumberFormat("en-ZA", {
            style: "currency",
            currency: "ZAR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    const dashboardContent = (
        <div className="space-y-8 p-6">
            {/* 1. Greeting Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                        Good afternoon, Rowan
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Here’s what’s happening across your fleet today
                    </p>
                </div>
                
                {/* Global Controls (Date + Sheets) */}
                <div className="flex items-center gap-3">
                     <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-md border shadow-sm">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="text-xs border-none focus:ring-0 text-gray-600 font-medium"
                        />
                        <span className="text-gray-300">→</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="text-xs border-none focus:ring-0 text-gray-600 font-medium"
                        />
                    </div>
                    <button
                        onClick={() => setShowSheets(!showSheets)}
                        className="text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all font-medium shadow-sm text-gray-700"
                    >
                        {showSheets ? "Hide Sheets" : "Show Sheets"}
                    </button>
                </div>
            </div>

            {/* 2. Primary KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DashboardCard
                    title="Loads Today"
                    value={todayLoads ? todayLoads.totalLoads : "-"}
                    trend={todayLoads && todayLoads.totalLoads > 0 ? { value: "Active", direction: "up" } : undefined}
                >
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                        <span>{todayLoads?.totalRoutes || 0} active routes</span>
                        <span>{todayLoads?.completedRoutes || 0} completed</span>
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="Revenue Today"
                    value={todayRevenue ? formatZAR(todayRevenue.totalRevenue) : "-"}
                    trend={todayRevenue && todayRevenue.totalRevenue > 0 ? { value: "Generated", direction: "up" } : undefined}
                >
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                         <span>Avg/Load: {todayRevenue ? formatZAR(todayRevenue.avgRevenuePerLoad) : "-"}</span>
                    </div>
                </DashboardCard>

                <DashboardCard
                    title="KM Completed Today"
                    value={todayLoads ? `${todayLoads.totalKm} km` : "-"}
                    trend={todayLoads && todayLoads.totalKm > 0 ? { value: "On road", direction: "neutral" } : undefined}
                >
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                         <span>Avg {todayLoads ? Math.round(todayLoads.totalKm / (todayLoads.totalRoutes || 1)) : 0} km/route</span>
                    </div>
                </DashboardCard>
            </div>

            {/* 3. Secondary KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Loads by Client */}
                <DashboardCard
                    title="Top Clients (Loads)"
                    value={clientBreakdown?.[0]?.count || 0}
                    trend={undefined}
                >
                    <div className="space-y-2 mt-2">
                        {clientBreakdown?.map((client, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-gray-600 border-b border-gray-50 pb-1 last:border-0">
                                <span className="font-medium truncate pr-2">{client.client}</span>
                                <span>{client.count}</span>
                            </div>
                        ))}
                        {(!clientBreakdown || clientBreakdown.length === 0) && (
                            <div className="text-xs text-gray-400 italic">No data available</div>
                        )}
                    </div>
                </DashboardCard>

                {/* Fleet Utilization */}
                <DashboardCard
                    title="Fleet Utilization"
                    value={`${todayLoads?.totalRoutes || 0}/${truckStats?.total || 0}`}
                    trend={undefined}
                >
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                         <span>Active: {todayLoads?.totalRoutes || 0}</span>
                         <span>Idle: {(truckStats?.total || 0) - (todayLoads?.totalRoutes || 0)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                        <div 
                            className="bg-blue-600 h-1.5 rounded-full" 
                            style={{ width: `${Math.min(((todayLoads?.totalRoutes || 0) / (truckStats?.total || 1)) * 100, 100)}%` }}
                        ></div>
                    </div>
                </DashboardCard>

                {/* Driver Availability */}
                <DashboardCard
                    title="Driver Availability"
                    value={`${driverStats?.active || 0}/${driverStats?.total || 0}`}
                    trend={undefined}
                >
                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                         <span>Active: {driverStats?.active || 0}</span>
                         <span>Inactive: {driverStats?.inactive || 0}</span>
                    </div>
                     <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
                        <div 
                            className="bg-green-600 h-1.5 rounded-full" 
                            style={{ width: `${Math.min(((driverStats?.active || 0) / (driverStats?.total || 1)) * 100, 100)}%` }}
                        ></div>
                    </div>
                </DashboardCard>
            </div>

            {/* 4. Secondary Content (Tabs) */}
            <div className="space-y-4">
                 <div className="flex items-center gap-6 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab("loads")}
                        className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === "loads"
                            ? "text-black border-b-2 border-black"
                            : "text-gray-500 hover:text-gray-800"
                            }`}
                    >
                        Loads Analysis
                    </button>
                    <button
                        onClick={() => setActiveTab("revenue")}
                        className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === "revenue"
                            ? "text-black border-b-2 border-black"
                            : "text-gray-500 hover:text-gray-800"
                            }`}
                    >
                        Revenue Analysis
                    </button>
                </div>

                <div className="pt-2">
                    {activeTab === "loads" ? (
                        <LoadsTab startDate={startDate} endDate={endDate} />
                    ) : (
                        <RevenueTab startDate={startDate} endDate={endDate} />
                    )}
                </div>
            </div>

            {/* 4. Finance Section (Legacy but useful) */}
            <div className="pt-8 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Financial Health</h3>
                <FinanceSection />
            </div>
        </div>
    );

    return (
        <WorkspaceSplit
            primary={dashboardContent}
            secondary={showSheets ? <SheetsPage mode="secondary" /> : null}
        />
    );
}
