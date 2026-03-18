"use client";

import { useState, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import WorkspaceSplit from "@/src/components/workspace/WorkspaceSplit";

// Import new CEO dashboard components
import ExecutiveSummary from "@/src/components/dashboard/ceo/ExecutiveSummary";
import FinancialHealthWidget from "@/src/components/dashboard/ceo/FinancialHealthWidget";
import OperationalMetrics from "@/src/components/dashboard/ceo/OperationalMetrics";
import CustomerPerformance from "@/src/components/dashboard/ceo/CustomerPerformance";
import FleetPerformance from "@/src/components/dashboard/ceo/FleetPerformance";
import StrategicInsights from "@/src/components/dashboard/ceo/StrategicInsights";

export default function DashboardPage() {
    return (
        <Suspense fallback={null}>
            <DashboardContent />
        </Suspense>
    );
}

function DashboardContent() {
    const [activeTab, setActiveTab] = useState<"overview" | "details">("overview");
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

    // Executive queries
    const execSummary = useQuery(api.dashboard.getExecutiveSummary, { startDate, endDate });
    const financialHealth = useQuery(api.dashboard.getFinancialHealth);
    const operationalEfficiency = useQuery(api.dashboard.getOperationalEfficiency, {
        startDate,
        endDate,
    });
    const customerAnalytics = useQuery(api.dashboard.getCustomerAnalytics, {
        startDate,
        endDate,
    });
    const fleetPerformance = useQuery(api.dashboard.getFleetPerformance, {
        startDate,
        endDate,
    });

    const dashboardContent = (
        <div className="space-y-8 p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                        Executive Dashboard
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Real-time business intelligence for fleet operations
                    </p>
                </div>

                {/* Date Range Controls */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="text-sm border-none focus:ring-0 text-gray-700 font-medium"
                        />
                        <span className="text-gray-400">→</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="text-sm border-none focus:ring-0 text-gray-700 font-medium"
                        />
                    </div>
                    <button
                        onClick={() => setActiveTab(activeTab === "overview" ? "details" : "overview")}
                        className="px-4 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors font-medium text-gray-700 shadow-sm"
                    >
                        {activeTab === "overview" ? "View Details" : "Overview"}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            {activeTab === "overview" ? (
                <div className="space-y-8">
                    {/* 1. Executive Summary KPIs */}
                    <ExecutiveSummary data={execSummary} />

                    {/* 2. Financial Health */}
                    <FinancialHealthWidget data={financialHealth} />

                    {/* 3. Operational Efficiency */}
                    <OperationalMetrics data={operationalEfficiency} />

                    {/* 4. Customer Performance */}
                    <CustomerPerformance data={customerAnalytics} />

                    {/* 5. Fleet Performance */}
                    <FleetPerformance data={fleetPerformance} />

                    {/* 6. Strategic Insights */}
                    <StrategicInsights
                        execSummary={execSummary}
                        financial={financialHealth}
                        operational={operationalEfficiency}
                        customers={customerAnalytics}
                        fleet={fleetPerformance}
                    />
                </div>
            ) : (
                <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">Detailed Analytics</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Customer Details */}
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-3">Top Customers</h3>
                            {customerAnalytics?.topCustomers?.map((customer, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                    <span className="text-sm text-gray-700">{customer.name}</span>
                                    <div className="text-right">
                                        <div className="text-sm font-semibold text-gray-900">
                                            R{(customer.revenue || 0).toFixed(0)}
                                        </div>
                                        <div className="text-xs text-gray-500">{customer.loads} loads</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Fleet Details */}
                        <div>
                            <h3 className="font-semibold text-gray-800 mb-3">Top Trucks</h3>
                            {fleetPerformance?.topTrucks?.map((truck, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                                    <span className="text-sm text-gray-700 font-mono">{truck.truckNumber}</span>
                                    <div className="text-right">
                                        <div className="text-sm font-semibold text-gray-900">
                                            R{(truck.revenue || 0).toFixed(0)}
                                        </div>
                                        <div className="text-xs text-gray-500">{truck.routes} routes</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <WorkspaceSplit
            primary={dashboardContent}
            secondary={null}
        />
    );
}
