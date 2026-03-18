"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * ⚠️ LEGACY COMPONENT - RouteForm
 * 
 * This component is used by legacy /planner routes for backward compatibility.
 * New route planning UI should use components in /operations/daily-planner/*
 * 
 * TODO (Phase 3+): Phase out once legacy routes are redirected.
 */

export type Load = {
  client: string;
  quantity: string;
  quantityType: string; // "ton" | "pallet"
  rate: string;
  rateType: string; // "full" | "per_qty"
  fromLocation: string; // Simplified for UI (backend expects array)
  toLocation: string; // Simplified for UI
};

export type RouteFormData = {
  routeDate: string;
  truckFleetNo: string;
  truckFleetNoStr?: string; // Legacy support
  driverName: string;
  trailerFleetNoStr?: string;
  kilometers: number;
  notes: string;
  loads: Load[];
};

interface RouteFormProps {
  initialValues?: RouteFormData;
  onSubmit: (data: RouteFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  buttonLabel: string;
}

export default function RouteForm({ initialValues, onSubmit, onDelete, buttonLabel }: RouteFormProps) {
  const trucks = useQuery(api.fleet.listTrucks);
  const drivers = useQuery(api.fleet.listDrivers);
  const trailers = useQuery(api.fleet.listTrailers);

  const [routeDate, setRouteDate] = useState(initialValues?.routeDate || new Date().toISOString().split('T')[0]);
  const [truckFleetNoStr, setTruckFleetNoStr] = useState(initialValues?.truckFleetNoStr || "");
  const [driverName, setDriverName] = useState(initialValues?.driverName || "");
  const [trailerFleetNoStr, setTrailerFleetNoStr] = useState(initialValues?.trailerFleetNoStr || "");
  const [kilometers, setKilometers] = useState(initialValues?.kilometers || 0);
  const [notes, setNotes] = useState(initialValues?.notes || "");

  const [loads, setLoads] = useState<(Load & { tempId: string })[]>(
    (initialValues?.loads || [
      { client: "", quantity: "0", quantityType: "ton", rate: "0", rateType: "full", fromLocation: "", toLocation: "" },
    ]).map((l, index) => ({ ...l, tempId: String(index) }))
  );

  const updateLoad = (index: number, field: keyof Load, value: string) => {
    const updatedLoads = [...loads];
    updatedLoads[index][field] = value;
    setLoads(updatedLoads);
  };

  const addLoad = () => {
    setLoads([
      ...loads,
      {
        client: "",
        quantity: "0",
        quantityType: "ton",
        rate: "0",
        rateType: "full",
        fromLocation: "",
        toLocation: "",
        tempId: Math.random().toString(36).substring(7)
      },
    ]);
  };

  const removeLoad = (index: number) => {
    const updatedLoads = loads.filter((_, i) => i !== index);
    setLoads(updatedLoads);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!routeDate || !truckFleetNoStr || !driverName) {
      alert("Please fill in Date, Truck, and Driver.");
      return;
    }

    await onSubmit({
      routeDate,
      truckFleetNo: truckFleetNoStr,
      truckFleetNoStr,
      driverName,
      trailerFleetNoStr,
      kilometers: Number(kilometers),
      notes,
      loads: loads.map((l) => ({
        client: l.client,
        quantity: l.quantity,
        quantityType: l.quantityType,
        rate: l.rate,
        rateType: l.rateType,
        fromLocation: l.fromLocation,
        toLocation: l.toLocation,
      })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Daily Planner</h1>

      {/* Route Details Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={routeDate}
            onChange={(e) => setRouteDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Truck</label>
          <select
            value={truckFleetNoStr}
            onChange={(e) => setTruckFleetNoStr(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select Truck</option>
            {trucks?.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Driver</label>
          <select
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select Driver</option>
            {drivers?.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Trailer (Optional)</label>
          <select
            value={trailerFleetNoStr}
            onChange={(e) => setTrailerFleetNoStr(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="">Select Trailer</option>
            {trailers?.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Total Kilometers</label>
          <input
            type="number"
            value={kilometers}
            onChange={(e) => setKilometers(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      {/* Loads Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Loads</h2>
          <button
            type="button"
            onClick={addLoad}
            className="px-4 py-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
          >
            + Add Load
          </button>
        </div>

        {loads.map((load, index) => (
          <div key={load.tempId} className="border p-4 rounded-lg bg-gray-50 relative space-y-4">
            <button
              type="button"
              onClick={() => removeLoad(index)}
              className="absolute top-2 right-2 text-red-500 hover:text-red-700"
            >
              ×
            </button>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">Client</label>
                <input
                  type="text"
                  value={load.client}
                  onChange={(e) => updateLoad(index, "client", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">From</label>
                <input
                  type="text"
                  value={load.fromLocation}
                  onChange={(e) => updateLoad(index, "fromLocation", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">To</label>
                <input
                  type="text"
                  value={load.toLocation}
                  onChange={(e) => updateLoad(index, "toLocation", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">Quantity</label>
                <input
                  type="text"
                  value={load.quantity}
                  onChange={(e) => updateLoad(index, "quantity", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Type</label>
                <select
                  value={load.quantityType}
                  onChange={(e) => updateLoad(index, "quantityType", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="ton">Ton</option>
                  <option value="pallet">Pallet</option>
                  <option value="load">Load</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Rate</label>
                <input
                  type="text"
                  value={load.rate}
                  onChange={(e) => updateLoad(index, "rate", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Rate Type</label>
                <select
                  value={load.rateType}
                  onChange={(e) => updateLoad(index, "rateType", e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="full">Full Load</option>
                  <option value="per_qty">Per Qty</option>
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t">
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Are you sure you want to delete this route?")) {
                onDelete();
              }
            }}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Delete Route
          </button>
        )}
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
