import React from "react";
import { TrendIcon } from "@/src/components/dashboard/ceo/TrendIcon";

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

interface ExecutiveSummaryProps {
    data: any;
}

export default function ExecutiveSummary({ data }: ExecutiveSummaryProps) {
    if (!data) {
        return (
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="grid grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-20 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const kpis: Array<{ label: string; value: string; subtext: string; trend: "up" | "down" | "neutral" }> = [
        {
            label: "Total Revenue",
            value: formatCurrency(data.totalRevenue || 0),
            subtext: `${data.totalRoutes || 0} routes`,
            trend: data.totalRevenue > 0 ? "up" : "neutral",
        },
        {
            label: "Revenue per KM",
            value: `R${((data.revenuePerKm || 0).toFixed(2))}`,
            subtext: `${(data.totalKm || 0).toLocaleString()} km total`,
            trend: data.revenuePerKm > 5 ? "up" : "neutral",
        },
        {
            label: "Avg Revenue per Load",
            value: formatCurrency(data.revenuePerLoad || 0),
            subtext: `${data.totalLoads || 0} loads`,
            trend: "neutral",
        },
        {
            label: "Completion Rate",
            value: `${(data.completionRate || 0).toFixed(1)}%`,
            subtext: `${data.completedRoutes || 0} completed`,
            trend: data.completionRate >= 80 ? "up" : data.completionRate >= 60 ? "neutral" : "down",
        },
    ];

    return (
        <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Executive Summary</h2>
                <p className="text-gray-600 text-sm mt-1">
                    Key performance indicators for the selected period
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {kpis.map((kpi, idx) => (
                    <div
                        key={idx}
                        className="relative p-6 bg-gradient-to-br from-gray-50 to-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <p className="text-gray-600 text-sm font-medium">{kpi.label}</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{kpi.value}</p>
                                <p className="text-gray-500 text-xs mt-3">{kpi.subtext}</p>
                            </div>
                            <div className="ml-2">
                                <TrendIcon direction={kpi.trend} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100">
                <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Avg Route Length</p>
                    <p className="text-2xl font-bold text-blue-900 mt-2">
                        {(data.avgKmPerRoute || 0).toFixed(0)} km
                    </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Active Routes</p>
                    <p className="text-2xl font-bold text-green-900 mt-2">{data.activeRoutes || 0}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Total Loads</p>
                    <p className="text-2xl font-bold text-purple-900 mt-2">{data.totalLoads || 0}</p>
                </div>
            </div>
        </div>
    );
}
