import React from "react";

interface FleetPerformanceProps {
    data: any;
}

export default function FleetPerformance({ data }: FleetPerformanceProps) {
    if (!data) {
        return (
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <div className="animate-pulse h-80 bg-gray-200 rounded"></div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Fleet Performance</h2>
                <p className="text-gray-600 text-sm mt-1">Truck efficiency and utilization metrics</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Fleet Summary */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-900 mb-2">
                        Active Trucks
                    </p>
                    <p className="text-3xl font-bold text-green-900">{data.totalTrucksActive || 0}</p>
                    <p className="text-sm text-green-700 mt-2">In use this period</p>
                </div>

                {/* Avg Revenue Per KM */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-900 mb-2">
                        Avg Revenue/KM
                    </p>
                    <p className="text-3xl font-bold text-blue-900">
                        R{(data.avgRevenuePerKm || 0).toFixed(2)}
                    </p>
                    <p className="text-sm text-blue-700 mt-2">Fleet efficiency metric</p>
                </div>

                {/* Top Truck */}
                {data.topTrucks && data.topTrucks.length > 0 && (
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-6 border border-yellow-200">
                        <p className="text-xs font-semibold uppercase tracking-wide text-yellow-900 mb-2">
                            Top Performer
                        </p>
                        <p className="text-lg font-bold text-yellow-900 font-mono">
                            {data.topTrucks[0].truckNumber}
                        </p>
                        <p className="text-sm text-yellow-700 mt-2">
                            R{(data.topTrucks[0].revenue || 0).toFixed(0)}
                        </p>
                    </div>
                )}
            </div>

            {/* Top Performing Trucks */}
            <div className="pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">Top Performing Trucks</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-y border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Truck #</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Revenue</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Routes</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">KM</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Loads</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">R/KM</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Efficiency</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.topTrucks?.map((truck: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                                    <td className="px-4 py-3 text-gray-900 font-mono font-semibold">
                                        {truck.truckNumber}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-900 font-semibold">
                                        R{(truck.revenue || 0).toFixed(0)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">{truck.routes}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                        {(truck.km || 0).toFixed(0)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">{truck.loads}</td>
                                    <td className="px-4 py-3 text-right">
                                        <span
                                            className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                                truck.revenuePerKm > 6
                                                    ? "bg-green-100 text-green-800"
                                                    : truck.revenuePerKm > 4
                                                      ? "bg-blue-100 text-blue-800"
                                                      : "bg-gray-100 text-gray-800"
                                            }`}
                                        >
                                            R{(truck.revenuePerKm || 0).toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                        {(truck.efficiency || 0).toFixed(0)} km/route
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {(!data.topTrucks || data.topTrucks.length === 0) && (
                    <p className="text-center text-gray-500 py-8">No truck data available</p>
                )}
            </div>
        </div>
    );
}
