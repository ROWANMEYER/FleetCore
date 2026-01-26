"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import KpiCard from "./KpiCard";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface RevenueTabProps {
    startDate: string;
    endDate: string;
}

const formatZAR = (value: number) => {
    return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        minimumFractionDigits: 2,
    }).format(value);
};

export default function RevenueTab({ startDate, endDate }: RevenueTabProps) {
    const revenueSummary = useQuery(api.dashboard.getDashboardRevenueSummary, {
        startDate,
        endDate,
    });

    const revenueOverTime = useQuery(api.dashboard.getRevenueOverTime, {
        startDate,
        endDate,
    });

    const revenueByTruck = useQuery(api.dashboard.getRevenueByTruck, {
        startDate,
        endDate,
        limit: 10,
    });

    const isLoading =
        revenueSummary === undefined ||
        revenueOverTime === undefined ||
        revenueByTruck === undefined;

    if (isLoading) {
        return (
            <div className="p-8 text-center text-gray-500 text-sm">
                Loading revenue intelligence...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
                <KpiCard
                    label="Total Revenue"
                    value={formatZAR(revenueSummary.totalRevenue)}
                    trend="up"
                />
                <KpiCard
                    label="Avg Revenue/Route"
                    value={formatZAR(revenueSummary.avgRevenuePerRoute)}
                />
                <KpiCard
                    label="Avg Revenue/Load"
                    value={formatZAR(revenueSummary.avgRevenuePerLoad)}
                />
                <KpiCard
                    label="Total Loads"
                    value={revenueSummary.totalLoads}
                    subtext={`${revenueSummary.totalRoutes} routes`}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-6">
                {/* Revenue Over Time */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                        Revenue Over Time
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueOverTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`} />
                            <Tooltip formatter={(value) => formatZAR(Number(value))} />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="#10b981"
                                strokeWidth={2}
                                name="Revenue (ZAR)"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Revenue by Truck */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                        Revenue by Truck (Top 10)
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={revenueByTruck} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`} />
                            <YAxis dataKey="truckFleetNo" type="category" tick={{ fontSize: 11 }} width={60} />
                            <Tooltip formatter={(value) => formatZAR(Number(value))} />
                            <Legend wrapperStyle={{ fontSize: "12px" }} />
                            <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (ZAR)" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
