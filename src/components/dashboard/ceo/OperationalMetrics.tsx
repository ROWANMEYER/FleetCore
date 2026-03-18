import React from "react";

interface OperationalMetricsProps {
    data: any;
}

export default function OperationalMetrics({ data }: OperationalMetricsProps) {
    if (!data) {
        return (
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
            </div>
        );
    }

    const metrics = [
        {
            label: "Total Routes",
            value: data.totalRoutes || 0,
            icon: "📍",
            color: "text-blue-600",
        },
        {
            label: "Loads Per Route",
            value: (data.loadsPerRoute || 0).toFixed(1),
            icon: "📦",
            color: "text-purple-600",
        },
        {
            label: "KM Per Route",
            value: `${(data.kmPerRoute || 0).toFixed(0)} km`,
            icon: "🛣️",
            color: "text-green-600",
        },
        {
            label: "Revenue Per Route",
            value: `R${(data.revenuePerRoute || 0).toFixed(0)}`,
            icon: "💰",
            color: "text-yellow-600",
        },
    ];

    const completionRate = data.plannedCompletionRate || 0;

    return (
        <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Operational Efficiency</h2>
                <p className="text-gray-600 text-sm mt-1">Route and load performance metrics</p>
            </div>

            {/* Main metrics grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {metrics.map((metric, idx) => (
                    <div key={idx} className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-lg border border-gray-100">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-gray-600 text-xs font-medium mb-2">{metric.label}</p>
                                <p className={`text-2xl font-bold ${metric.color}`}>{metric.value}</p>
                            </div>
                            <span className="text-2xl">{metric.icon}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Completion status */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-100">
                <div className="flex items-end justify-between mb-4">
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-1">Route Completion Status</h3>
                        <p className="text-sm text-gray-600">
                            {data.completedRoutes} of {data.totalRoutes} routes completed
                        </p>
                    </div>
                    <p className="text-3xl font-bold text-blue-900">{completionRate.toFixed(1)}%</p>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                        className={`h-3 rounded-full transition-all ${
                            completionRate >= 80
                                ? "bg-green-500"
                                : completionRate >= 60
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(completionRate, 100)}%` }}
                    ></div>
                </div>

                <div className="flex justify-between text-xs text-gray-600 mt-2">
                    <span>{data.plannedRoutes} planned</span>
                    <span>{data.completedRoutes} completed</span>
                </div>
            </div>
        </div>
    );
}
