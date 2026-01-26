"use client";

import { useState, Suspense } from "react";
import LoadsTab from "./components/LoadsTab";
import RevenueTab from "./components/RevenueTab";
import WorkspaceSplit from "../../components/workspace/WorkspaceSplit";
import SheetsPage from "../daily-planner/sheets/page";

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

    // Default to current month date range
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [startDate, setStartDate] = useState(
        firstDayOfMonth.toISOString().split("T")[0]
    );
    const [endDate, setEndDate] = useState(
        lastDayOfMonth.toISOString().split("T")[0]
    );

    const dashboardContent = (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-gray-500 mt-1 text-xs">
                        Read-only management intelligence
                    </p>
                </div>
                <button
                    onClick={() => setShowSheets(!showSheets)}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 transition-colors font-medium"
                >
                    {showSheets ? "Hide Sheets" : "Show Sheets"}
                </button>
            </div>

            {/* Controls */}
            <div className="bg-white p-3 rounded-lg border shadow-sm flex items-center justify-between">
                {/* Date Range Selector */}
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-700">From:</label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                    <span className="text-gray-400 text-xs">→</span>
                    <label className="text-xs font-medium text-gray-700">To:</label>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center gap-2 bg-gray-100 rounded-md p-1">
                    <button
                        onClick={() => setActiveTab("loads")}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === "loads"
                            ? "bg-white text-black shadow-sm"
                            : "text-gray-600 hover:text-black"
                            }`}
                    >
                        Loads
                    </button>
                    <button
                        onClick={() => setActiveTab("revenue")}
                        className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === "revenue"
                            ? "bg-white text-black shadow-sm"
                            : "text-gray-600 hover:text-black"
                            }`}
                    >
                        Revenue
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="bg-gray-50 rounded-lg border p-6">
                {activeTab === "loads" ? (
                    <LoadsTab startDate={startDate} endDate={endDate} />
                ) : (
                    <RevenueTab startDate={startDate} endDate={endDate} />
                )}
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
