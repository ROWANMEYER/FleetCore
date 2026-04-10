"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

interface EditRouteModalProps {
    routeId: Id<"dailyRoutes">;
    onClose: () => void;
    onSuccess: () => void;
}

type Load = {
    id: string;
    client: string;
    fromLocations: string[];
    toLocations: string[];
    quantity: string;
    quantityType: string;
    rate: string;
    rateType: "per_unit" | "flat";
};

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

export default function EditRouteModal({ routeId, onClose, onSuccess }: EditRouteModalProps) {
    const route = useQuery(api.dailyRoutes.getById, { id: routeId });
    const trucks = useQuery(api.fleet.listTrucks) || [];
    const drivers = useQuery(api.fleet.listDrivers) || [];
    const trailers = useQuery(api.fleet.listTrailers) || [];

    const [formData, setFormData] = useState({
        routeDate: route?.routeDate || "",
        truckFleetNoStr: route?.truckFleetNoStr || "",
        driverName: route?.driverName || "",
        trailerFleetNoStr: route?.trailerFleetNoStr || "",
        kilometers: route?.kilometers || 0,
        notes: route?.notes || "",
    });

    const [loads, setLoads] = useState<Load[]>(
        (route?.loads ?? []).map((l, i) => ({
            id: String(i),
            client: (l as any).client || "",
            fromLocations: (l as any).fromLocations || [],
            toLocations: (l as any).toLocations || [],
            quantity: String((l as any).quantity || "0"),
            quantityType: (l as any).quantityType || "tons",
            rate: String((l as any).rate || "0"),
            rateType: ((l as any).rateType === "flat" ? "flat" : "per_unit") as "per_unit" | "flat",
        }))
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    const updateRoute = useMutation(api.dailyRoutes.updateDailyRoute);

    if (!route) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6">
                    <p className="text-gray-500">Loading route...</p>
                </div>
            </div>
        );
    }

    const handleLoadChange = (id: string, field: keyof Load, value: any) => {
        setLoads(loads.map(l => l.id === id ? { ...l, [field]: value } : l));
    };

    const handleAddLoad = () => {
        setLoads([
            ...loads,
            {
                id: String(loads.length),
                client: "",
                fromLocations: [],
                toLocations: [],
                quantity: "0",
                quantityType: "tons",
                rate: "0",
                rateType: "per_unit",
            },
        ]);
    };

    const handleRemoveLoad = (id: string) => {
        setLoads(loads.filter(l => l.id !== id));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await updateRoute({
                id: routeId,
                routeDate: formData.routeDate,
                truckFleetNoStr: formData.truckFleetNoStr,
                driverName: formData.driverName,
                trailerFleetNoStr: formData.trailerFleetNoStr,
                kilometers: Number(formData.kilometers),
                notes: formData.notes,
                loads: loads.map((l) => ({
                    client: l.client,
                    fromLocations: l.fromLocations,
                    toLocations: l.toLocations,
                    quantity: l.quantity,
                    quantityType: l.quantityType,
                    rate: l.rate,
                    rateType: l.rateType,
                })),
            });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to update route:", error);
            alert("Failed to update route.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Edit Route</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl"
                    >
                        ×
                    </button>
                </div>

                <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Route Details */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">Route Details</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Date
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.routeDate}
                                        onChange={(e) =>
                                            setFormData({ ...formData, routeDate: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Truck
                                    </label>
                                    <select
                                        value={formData.truckFleetNoStr}
                                        onChange={(e) =>
                                            setFormData({ ...formData, truckFleetNoStr: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Truck</option>
                                        {trucks.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Driver
                                    </label>
                                    <select
                                        value={formData.driverName}
                                        onChange={(e) =>
                                            setFormData({ ...formData, driverName: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Driver</option>
                                        {drivers.map((d) => (
                                            <option key={d.value} value={d.value}>
                                                {d.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Trailer (Optional)
                                    </label>
                                    <select
                                        value={formData.trailerFleetNoStr}
                                        onChange={(e) =>
                                            setFormData({ ...formData, trailerFleetNoStr: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select Trailer</option>
                                        {trailers.map((t) => (
                                            <option key={t.value} value={t.value}>
                                                {t.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Kilometers
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.kilometers}
                                        onChange={(e) =>
                                            setFormData({ ...formData, kilometers: Number(e.target.value) })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Notes
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) =>
                                        setFormData({ ...formData, notes: e.target.value })
                                    }
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Loads Section */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    Loads ({loads.length})
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddLoad}
                                    className="px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
                                >
                                    + Add Load
                                </button>
                            </div>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                {loads.map((load) => {
                                    const revenue = calculateLoadAmount(
                                        Number(load.quantity || 0),
                                        Number(load.rate || 0),
                                        load.rateType || "per_unit"
                                    );
                                    return (
                                        <div
                                            key={load.id}
                                            className="border border-gray-200 rounded-lg p-4 bg-gray-50 relative"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveLoad(load.id)}
                                                className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold"
                                            >
                                                ×
                                            </button>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Client
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={load.client}
                                                        onChange={(e) =>
                                                            handleLoadChange(load.id, "client", e.target.value)
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        From Location
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={load.fromLocations?.[0] || ""}
                                                        onChange={(e) =>
                                                            handleLoadChange(load.id, "fromLocations", [e.target.value])
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        To Location
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={load.toLocations?.[0] || ""}
                                                        onChange={(e) =>
                                                            handleLoadChange(load.id, "toLocations", [e.target.value])
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Quantity
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={load.quantity}
                                                        onChange={(e) =>
                                                            handleLoadChange(load.id, "quantity", e.target.value)
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Rate
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={load.rate}
                                                        onChange={(e) =>
                                                            handleLoadChange(load.id, "rate", e.target.value)
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Rate Type
                                                    </label>
                                                    <select
                                                        value={load.rateType}
                                                        onChange={(e) =>
                                                            handleLoadChange(load.id, "rateType", e.target.value as "per_unit" | "flat")
                                                        }
                                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="per_unit">Per Unit</option>
                                                        <option value="flat">Flat Rate</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="mt-2 text-right text-xs font-semibold text-green-600">
                                                Revenue: {formatZAR(revenue)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 justify-end pt-6 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isSubmitting ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
