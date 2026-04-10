"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import KpiCard from "./KpiCard";
import EditRouteModal from "./EditRouteModal";
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

const calculateLoadAmount = (quantity: number, rate: number, rateType: "per_unit" | "flat") => {
    if (rateType === "flat") return rate;
    return quantity * rate;
};

export default function RevenueTab({ startDate, endDate }: RevenueTabProps) {
    const [editingRouteId, setEditingRouteId] = useState<Id<"dailyRoutes"> | null>(null);
    const [deletingRouteId, setDeletingRouteId] = useState<Id<"dailyRoutes"> | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [expandedRouteId, setExpandedRouteId] = useState<Id<"dailyRoutes"> | null>(null);

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

    const routes = useQuery(api.dailyRoutes.getForSheets, {
        startDate,
        endDate,
    });

    const deleteDailyRoute = useMutation(api.dailyRoutes.deleteDailyRoute);

    const isLoading =
        revenueSummary === undefined ||
        revenueOverTime === undefined ||
        revenueByTruck === undefined ||
        routes === undefined;

    const handleDeleteRoute = async () => {
        if (!deletingRouteId) return;
        try {
            await deleteDailyRoute({ id: deletingRouteId });
            setShowDeleteConfirm(false);
            setDeletingRouteId(null);
        } catch (error) {
            console.error("Failed to delete route:", error);
            alert("Failed to delete route. It might be locked.");
        }
    };

    const handleEditClick = (routeId: Id<"dailyRoutes">) => {
        setEditingRouteId(routeId);
    };

    const handleDeleteClick = (routeId: Id<"dailyRoutes">) => {
        setDeletingRouteId(routeId);
        setShowDeleteConfirm(true);
    };

    if (isLoading) {
        return (
            <div className="p-8 text-center text-gray-500 text-sm">
                Loading revenue intelligence...
            </div>
        );
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
    };
    
    const dateRangeText = `${formatDate(startDate)} - ${formatDate(endDate)}`;

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
                <KpiCard
                    label="Total Revenue"
                    value={formatZAR(revenueSummary.totalRevenue)}
                    trend="up"
                    subtext={`All active routes • ${dateRangeText}`}
                />
                <KpiCard
                    label="Avg Revenue/Route"
                    value={formatZAR(revenueSummary.avgRevenuePerRoute)}
                    subtext={`Based on all active routes • ${dateRangeText}`}
                />
                <KpiCard
                    label="Avg Revenue/Load"
                    value={formatZAR(revenueSummary.avgRevenuePerLoad)}
                    subtext={`Based on all active loads • ${dateRangeText}`}
                />
                <KpiCard
                    label="Total Loads"
                    value={revenueSummary.totalLoads}
                    subtext={`${revenueSummary.totalRoutes} active routes • ${dateRangeText}`}
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-6">
                {/* Revenue Over Time */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                        Revenue Over Time
                    </h3>
                    <div className="w-full min-h-[300px]">
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
                </div>

                {/* Revenue by Truck */}
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                        Revenue by Truck (Top 10)
                    </h3>
                    <div className="w-full min-h-[300px]">
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

            {/* Routes List */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    Routes ({routes?.length || 0})
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-gray-600 font-medium">
                                <th className="text-left py-3 px-4">Date</th>
                                <th className="text-left py-3 px-4">Truck</th>
                                <th className="text-left py-3 px-4">Driver</th>
                                <th className="text-left py-3 px-4">Client</th>
                                <th className="text-right py-3 px-4">Revenue</th>
                                <th className="text-right py-3 px-4">KM</th>
                                <th className="text-left py-3 px-4">Status</th>
                                <th className="text-right py-3 px-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!routes || routes.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-gray-500">
                                        No routes found for this period.
                                    </td>
                                </tr>
                            ) : (
                                routes.map((route) => {
                                    const revenue = (route.loads ?? []).reduce((sum, load) => {
                                        const loadAmount = calculateLoadAmount(
                                            Number(load.quantity),
                                            Number(load.rate),
                                            load.rateType as "per_unit" | "flat"
                                        );
                                        return sum + loadAmount;
                                    }, 0);

                                    const status = (route as any).status ?? "planned";
                                    const statusColor: Record<string, string> = {
                                        planned: "bg-yellow-100 text-yellow-800",
                                        completed: "bg-green-100 text-green-800",
                                        locked: "bg-blue-100 text-blue-800",
                                    };

                                    return (
                                        <tr
                                            key={route._id}
                                            className="border-b border-gray-100 hover:bg-gray-50"
                                        >
                                            <td className="py-3 px-4">{route.routeDate}</td>
                                            <td className="py-3 px-4 font-medium">{route.truckFleetNoStr}</td>
                                            <td className="py-3 px-4">{route.driverName}</td>
                                            <td className="py-3 px-4">{route.client || "—"}</td>
                                            <td className="py-3 px-4 text-right font-medium text-green-600">
                                                {formatZAR(revenue)}
                                            </td>
                                            <td className="py-3 px-4 text-right">{route.kilometers || 0} km</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold capitalize ${statusColor[status] || "bg-gray-100 text-gray-800"}`}>
                                                    {status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-right space-x-2">
                                                <button
                                                    onClick={() => handleEditClick(route._id)}
                                                    className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(route._id)}
                                                    className="px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded border border-red-200"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Confirm Delete</h2>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to delete this route and all its loads? This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setDeletingRouteId(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteRoute}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                            >
                                Delete Route
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingRouteId && (
                <EditRouteModal
                    routeId={editingRouteId}
                    onClose={() => setEditingRouteId(null)}
                    onSuccess={() => {
                        setEditingRouteId(null);
                        // Data will automatically refresh from the query
                    }}
                />
            )}
        </div>
    );
}
