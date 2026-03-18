import React from "react";

interface CustomerPerformanceProps {
    data: any;
}

export default function CustomerPerformance({ data }: CustomerPerformanceProps) {
    if (!data) {
        return (
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <div className="animate-pulse h-80 bg-gray-200 rounded"></div>
            </div>
        );
    }

    const concentrationRisk = data.concentrationRisk || 0;
    const riskLevel = 
        concentrationRisk > 70 ? "critical" :
        concentrationRisk > 60 ? "high" :
        concentrationRisk > 50 ? "medium" : "low";

    const riskColors = {
        critical: "text-red-700 bg-red-50 border-red-200",
        high: "text-orange-700 bg-orange-50 border-orange-200",
        medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
        low: "text-green-700 bg-green-50 border-green-200",
    };

    return (
        <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Customer Performance</h2>
                <p className="text-gray-600 text-sm mt-1">Revenue concentration and customer analytics</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Concentration Risk */}
                <div className={`rounded-lg p-6 border ${riskColors[riskLevel]}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2">Concentration Risk</p>
                    <p className="text-3xl font-bold mb-2">{concentrationRisk.toFixed(1)}%</p>
                    <p className="text-sm font-medium">
                        {concentrationRisk > 70
                            ? "⚠️ Top 10 customers over 70% of revenue - HIGH RISK"
                            : concentrationRisk > 60
                              ? "⚡ Top 10 customers over 60% - Monitor closely"
                              : "✓ Healthy customer diversification"}
                    </p>
                </div>

                {/* Customer Count */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 mb-2">
                        Unique Customers
                    </p>
                    <p className="text-3xl font-bold text-blue-900 mb-2">
                        {data.totalUniqueCustomers || 0}
                    </p>
                    <p className="text-sm text-blue-700">
                        In selected period
                    </p>
                </div>

                {/* Top Customer */}
                {data.topCustomers && data.topCustomers.length > 0 && (
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-900 mb-2">
                            Top Customer
                        </p>
                        <p className="text-lg font-bold text-purple-900 truncate">
                            {data.topCustomers[0].name}
                        </p>
                        <p className="text-sm text-purple-700 mt-2">
                            R{(data.topCustomers[0].revenue || 0).toFixed(0)}
                        </p>
                    </div>
                )}
            </div>

            {/* Top Customers Table */}
            <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">Top 10 Customers</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-y border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Rank</th>
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Customer</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Revenue</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Loads</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Routes</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Avg/Load</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.topCustomers?.map((customer: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-600 font-medium">#{idx + 1}</td>
                                    <td className="px-4 py-3 text-gray-900 font-medium">{customer.name}</td>
                                    <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                                        R{(customer.revenue || 0).toFixed(0)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">{customer.loads}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">{customer.routes}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                        R{(customer.avgRevenuePerLoad || 0).toFixed(0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {(!data.topCustomers || data.topCustomers.length === 0) && (
                    <p className="text-center text-gray-500 py-8">No customer data available</p>
                )}
            </div>
        </div>
    );
}
