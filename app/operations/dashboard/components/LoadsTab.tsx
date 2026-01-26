"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import KpiCard from "./KpiCard";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface LoadsTabProps {
    startDate: string;
    endDate: string;
}

const STATUS_COLORS = {
    planned: "#3b82f6", // blue
    completed: "#10b981", // green
    locked: "#6b7280", // gray
};

export default function LoadsTab({ startDate, endDate }: LoadsTabProps) {
    const loadsSummary = useQuery(api.dashboard.getDashboardLoadsSummary, {
        startDate,
        endDate,
    });

    const loadsOverTime = useQuery(api.dashboard.getLoadsOverTime, {
        startDate,
        endDate,
    });

    const routesByStatus = useQuery(api.dashboard.getRoutesByStatus, {
        startDate,
        endDate,
    });

    const isLoading =
        loadsSummary === undefined ||
        loadsOverTime === undefined ||
        routesByStatus === undefined;

    if (isLoading) {
        return (
            <div className="p-8 text-center text-gray-500 text-sm">
                Loading loads intelligence...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-5 gap-4">
                <KpiCard
                    label="Total Routes"
                    value={loadsSummary.totalRoutes}
                />
                <KpiCard
                    label="Total Loads"
                    value={loadsSummary.totalLoads}
                />
                <KpiCard
                    label="Completed Routes"
                    value={loadsSummary.completedRoutes}
                    trend={loadsSummary.completedRoutes > 0 ? "up" : "neutral"}
                />
                <KpiCard
                    label="Incomplete Routes"
                    value={loadsSummary.incompleteRoutes}
                    trend={loadsSummary.incompleteRoutes > 0 ? "down" : "neutral"}
                />
                <KpiCard
                    label="Avg Loads/Route"
                    value={loadsSummary.avgLoadsPerRoute}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-6">
                {/* Loads Over Time */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                        Loads Over Time
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={loadsOverTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            <Line
                                type="monotone"
                                dataKey="loadCount"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                name="Loads"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Routes by Status */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                        Routes by Status
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={routesByStatus}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ status, count }) => `${status}: ${count}`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="count"
                            >
                                {routesByStatus.map((entry: any, index: number) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={STATUS_COLORS[entry.status as keyof typeof STATUS_COLORS] || "#gray"}
                                    />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
