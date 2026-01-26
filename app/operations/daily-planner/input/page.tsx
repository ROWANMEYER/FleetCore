"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateLoadAmount } from "../../../../convex/utils";

type Load = {
  id: string; // Frontend-only ID for React keys
  clientName: string;
  fromLocations: string[]; // Changed to array
  toLocations: string[]; // Changed to array
  quantity: number;
  quantityType: string; // Added field
  rate: number;
  rateType: "per_unit" | "flat";
  sequence: number;
  kilometers?: number; // UI-only
};

// Helper to format currency (ZAR)
const formatZAR = (value: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);

const unitMap: Record<string, string> = {
  tons: "t",
  pallets: "pallets",
  bales: "bales",
  bags: "bags",
};

const unitOptions = [
  { value: "tons", label: "Tons" },
  { value: "pallets", label: "Pallets" },
  { value: "bales", label: "Bales" },
  { value: "bags", label: "Bags" },
];

const rateTypeOptions = [
  { value: "per_unit", label: "Per Unit" },
  { value: "flat", label: "Flat Rate" },
];

export default function DailyPlannerInputPage() {
  return (
    <Suspense fallback={null}>
      <DailyPlannerInputContent />
    </Suspense>
  );
}

function DailyPlannerInputContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeId = searchParams.get("id") as Id<"dailyRoutes"> | null;
  const urlDate = searchParams.get("date");

  // Explicit mode state as requested
  const [editingRouteId, setEditingRouteId] = useState<Id<"dailyRoutes"> | null>(routeId);

  // Sync state with URL param (handle initial load or navigation)
  useEffect(() => {
    setEditingRouteId(routeId);
  }, [routeId]);

  const isEditMode = !!editingRouteId;
  const mode: "create" | "edit" = isEditMode ? "edit" : "create";

  // Local state for the form
  const [date, setDate] = useState(urlDate || "");
  const [truckFleetNo, setTruckFleetNo] = useState("");
  const [trailerFleetNo, setTrailerFleetNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [notes, setNotes] = useState("");

  // 1) Loads state (single source of truth)
  const [loads, setLoads] = useState<Load[]>([]);

  // 2) Draft load form state
  const [draftLoad, setDraftLoad] = useState({
    clientName: "",
    fromLocations: [""] as string[], // Initialize with one empty string
    toLocations: [""] as string[], // Initialize with one empty string
    quantity: "",
    quantityType: "tons", // Default
    rate: "",
    rateType: "per_unit", // Default
    kilometers: "",
  });

  // Queries
  const existingRoute = useQuery(api.dailyRoutes.getById, routeId ? { id: routeId } : "skip");
  const trucks = useQuery(api.fleet.getTrucks) || [];
  const trailers = useQuery(api.fleet.getTrailers) || [];
  const drivers = useQuery(api.fleet.getDrivers) || [];

  // Mutations
  const createRoute = useMutation(api.dailyRoutes.createDailyRoute);
  const updateRoute = useMutation(api.dailyRoutes.updateDailyRoute);

  // Derived State
  const routeStatus = existingRoute?.status || "planned";
  const isEditable = routeStatus === "planned";

  // Populate form when existing route loads
  useEffect(() => {
    if (existingRoute && editingRouteId) {
      setDate(existingRoute.routeDate);

      // Sync URL for Sheets side-by-side view
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("date") !== existingRoute.routeDate) {
        params.set("date", existingRoute.routeDate);
        router.replace(`?${params.toString()}`, { scroll: false });
      }

      setTruckFleetNo(existingRoute.truckFleetNoStr ?? existingRoute.truckFleetNo?.toString() ?? "");
      setTrailerFleetNo(existingRoute.trailerFleetNoStr ?? existingRoute.trailerFleetNo?.toString() ?? "");
      setDriverName(existingRoute.driverName ?? "");
      setNotes(existingRoute.notes ?? "");

      // Map existing loads to UI format
      if (existingRoute.loads) {
        const mappedLoads: Load[] = existingRoute.loads.map((l: any, index: number) => ({
          id: crypto.randomUUID(),
          clientName: l.client ?? "",
          fromLocations: l.fromLocations ?? [], // Ensure array
          toLocations: l.toLocations ?? [], // Ensure array
          quantity: Number(l.quantity) || 0,
          quantityType: l.quantityType || "tons",
          rate: Number(l.rate) || 0,
          rateType: l.rateType === "flat" ? "flat" : "per_unit",
          sequence: index + 1,
          kilometers: l.kilometers || 0,
        }));
        setLoads(mappedLoads);
      }
    }
  }, [existingRoute, editingRouteId, searchParams, router]);

  // Helper to update specific location in draft
  const updateDraftLocation = (type: "from" | "to", index: number, value: string) => {
    setDraftLoad(prev => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: prev[type === "from" ? "fromLocations" : "toLocations"].map((loc, i) => i === index ? value : loc)
    }));
  };

  // Helper to add location field
  const addLocationField = (type: "from" | "to") => {
    setDraftLoad(prev => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: [...prev[type === "from" ? "fromLocations" : "toLocations"], ""]
    }));
  };

  // Helper to remove location field
  const removeLocationField = (type: "from" | "to", index: number) => {
    setDraftLoad(prev => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: prev[type === "from" ? "fromLocations" : "toLocations"].filter((_, i) => i !== index)
    }));
  };

  // 3) Add Load handler (REQUIRED)
  const handleAddLoad = () => {
    // Filter out empty strings
    const cleanFromLocations = draftLoad.fromLocations.filter(l => l.trim() !== "");
    const cleanToLocations = draftLoad.toLocations.filter(l => l.trim() !== "");

    // Validation
    if (!draftLoad.clientName) {
      alert("Client name is required");
      return;
    }
    if (cleanFromLocations.length === 0) {
      alert("At least one Pickup location is required");
      return;
    }
    if (cleanToLocations.length === 0) {
      alert("At least one Drop location is required");
      return;
    }

    const newLoad: Load = {
      id: crypto.randomUUID(),
      clientName: draftLoad.clientName,
      fromLocations: cleanFromLocations,
      toLocations: cleanToLocations,
      quantity: parseFloat(draftLoad.quantity) || 0,
      quantityType: draftLoad.quantityType,
      rate: parseFloat(draftLoad.rate) || 0,
      rateType: draftLoad.rateType as "per_unit" | "flat",
      sequence: loads.length + 1,
      kilometers: parseFloat(draftLoad.kilometers) || 0,
    };

    // Appends a new load
    setLoads([...loads, newLoad]);

    // Resets draftLoad
    setDraftLoad({
      clientName: "",
      fromLocations: [""],
      toLocations: [""],
      quantity: "",
      quantityType: "tons",
      rate: "",
      rateType: "per_unit",
      kilometers: "",
    });
  };

  // 3.5) Remove Load handler
  const handleRemoveLoad = (idToRemove: string) => {
    if (!isEditable) return;

    const updatedLoads = loads
      .filter((load) => load.id !== idToRemove)
      .map((load, index) => ({ ...load, sequence: index + 1 }));

    setLoads(updatedLoads);
  };

  // 4) Add Leg handler - REMOVED

  // 5) Inline Editing State
  const [editingLoadId, setEditingLoadId] = useState<string | null>(null);
  const [editingLoadState, setEditingLoadState] = useState<Load | null>(null);

  const handleEditLoad = (load: Load) => {
    setEditingLoadId(load.id);
    setEditingLoadState({ ...load });
  };

  const handleCancelEdit = () => {
    setEditingLoadId(null);
    setEditingLoadState(null);
  };

  const handleSaveEdit = () => {
    if (!editingLoadState) return;

    // Validate
    if (editingLoadState.fromLocations.length === 0 || editingLoadState.fromLocations[0] === "") {
      alert("At least one Pickup location is required");
      return;
    }

    setLoads(loads.map(l => l.id === editingLoadId ? editingLoadState : l));
    setEditingLoadId(null);
    setEditingLoadState(null);
  };

  const calculateTotals = () => {
    // 1. Calculate Total Revenue (always sum currency)
    const totalRevenue = loads.reduce((sum, load) => sum + calculateLoadAmount(load.quantity, load.rate, load.rateType), 0);

    // 2. Calculate Total Qty (strict unit check)
    const uniqueUnits = Array.from(new Set(loads.map(l => l.quantityType)));

    let quantityDisplay = "0 t";
    if (loads.length > 0) {
      if (uniqueUnits.length === 1) {
        const sum = loads.reduce((acc, l) => acc + l.quantity, 0);
        const unit = unitMap[uniqueUnits[0]] || uniqueUnits[0];
        quantityDisplay = `${sum.toFixed(2)} ${unit}`;
      } else {
        quantityDisplay = "Mixed";
      }
    }

    return { quantityDisplay, revenue: totalRevenue, totalKm: 0 };
  };

  const totals = calculateTotals();

  const handleSave = async () => {
    if (!date || !truckFleetNo || !driverName) {
      console.error("Missing required fields");
      alert("Missing required fields: Date, Truck, or Driver");
      return;
    }

    // Transform UI loads to Schema loads
    const schemaLoads = loads.map((l) => ({
      client: l.clientName,
      quantity: l.quantity.toString(),
      quantityType: l.quantityType,
      rate: l.rate.toString(),
      rateType: l.rateType,
      fromLocations: l.fromLocations, // Pass array directly
      toLocations: l.toLocations, // Pass array directly
    }));


    try {
      if (mode === "edit" && editingRouteId) {
        await updateRoute({
          id: editingRouteId,
          routeDate: date,
          truckFleetNoStr: truckFleetNo,
          driverName: driverName,
          trailerFleetNoStr: trailerFleetNo || undefined,
          notes: notes || undefined,
          kilometers: totals.totalKm, // Use calculated totals
          loads: schemaLoads,

        });
        alert("Route updated successfully!");

        // EXIT EDIT MODE & RESET FORM
        setEditingRouteId(null);
        setTruckFleetNo("");
        setTrailerFleetNo("");
        setDriverName("");
        setNotes("");
        setLoads([]);

        // Clear any inline editing state
        setEditingLoadId(null);
        setEditingLoadState(null);
        router.push("/operations/daily-planner/input"); // Clear URL param
      } else {
        await createRoute({
          routeDate: date,
          truckFleetNoStr: truckFleetNo,
          driverName: driverName,
          trailerFleetNoStr: trailerFleetNo || undefined,
          notes: notes || undefined,
          kilometers: totals.totalKm, // Use calculated totals
          loads: schemaLoads,

        });

        // Reset form only on create
        setTruckFleetNo("");
        setTrailerFleetNo("");
        setDriverName("");
        setNotes("");
        setLoads([]); // Reset loads too

        alert("Route saved successfully!");
      }
    } catch (error) {
      console.error("Failed to save route:", error);
      alert("Failed to save route. Please check console for details.");
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "edit" ? "Edit Route" : "New Route"}
        </h1>
        <p className="text-gray-500">
          {mode === "edit" ? "Update existing route details." : "Enter daily route details."}
        </p>
      </div>

      {/* Main Form */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date ?? ""}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
              disabled={!isEditable}
            />
          </div>

          {/* Truck */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Truck
            </label>
            <select
              value={truckFleetNo ?? ""}
              onChange={(e) => setTruckFleetNo(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
              disabled={!isEditable}
            >
              <option value="">Select truck...</option>
              {trucks?.map((t) => (
                <option key={t._id} value={t.truckFleetNo}>
                  {t.truckFleetNo} ({t.registration})
                </option>
              ))}
            </select>
          </div>

          {/* Trailer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Trailer
            </label>
            <select
              value={trailerFleetNo ?? ""}
              onChange={(e) => setTrailerFleetNo(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
              disabled={!isEditable}
            >
              <option value="">Select trailer...</option>
              {trailers?.map((t) => (
                <option key={t._id} value={t.trailerFleetNoStr ?? t.trailerFleetNo?.toString() ?? ""}>
                  {t.trailerFleetNo} ({t.type})
                </option>
              ))}
            </select>
          </div>

          {/* Driver */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Driver
            </label>
            <select
              value={driverName ?? ""}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
              disabled={!isEditable}
            >
              <option value="">Select driver...</option>
              {drivers?.map((d) => (
                <option key={d._id} value={d.driverName}>
                  {d.driverName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
            placeholder="Any additional notes..."
            disabled={!isEditable}
          />
        </div>
      </div>

      {/* Loads Section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Loads</h2>
            <div className="text-sm text-gray-500">
              Total Qty: <span className="font-medium text-black">{totals.quantityDisplay}</span> |
              Est. Revenue: <span className="font-medium text-black">{formatZAR(totals.revenue)}</span>
            </div>
          </div>

          {/* KM Mismatch Warning */}
          {(() => {
            const totalLoadKm = loads.reduce((sum, l) => sum + (l.kilometers || 0), 0);
            const routeKm = totals.totalKm;
            const mismatch = totalLoadKm !== routeKm;

            if (mismatch && routeKm > 0) {
              return (
                <div className="px-3 py-2 bg-yellow-50 border border-yellow-100 rounded text-xs text-yellow-800 flex items-center gap-2">
                  <span>⚠️</span>
                  <span className="font-medium">KM Mismatch:</span>
                  <span>Sum of Load KMs ({totalLoadKm} km) ≠ Total Route KM ({routeKm} km)</span>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Loads List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loads.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              No loads added yet. Use the form below to add a load.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {loads.map((load, index) => (
                <div key={load.id} className="p-4 flex items-center justify-between hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  {editingLoadId === load.id && editingLoadState ? (
                    /* Edit Mode */
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-1 text-sm text-gray-500 font-mono">#{load.sequence}</div>
                        <div className="col-span-3">
                          <input
                            type="text"
                            value={editingLoadState.clientName ?? ""}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, clientName: e.target.value })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                            placeholder="Client"
                          />
                        </div>
                        <div className="col-span-8 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={(editingLoadState.fromLocations ?? []).join(", ")}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, fromLocations: e.target.value.split(",").map(s => s.trim()) })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                            placeholder="From (comma sep)"
                          />
                          <input
                            type="text"
                            value={(editingLoadState.toLocations ?? []).join(", ")}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, toLocations: e.target.value.split(",").map(s => s.trim()) })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                            placeholder="To (comma sep)"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-1"></div>
                        <div className="col-span-5 grid grid-cols-5 gap-2">
                          <input
                            type="number"
                            value={editingLoadState.quantity ?? ""}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, quantity: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                            placeholder="Qty"
                          />
                          <select
                            value={editingLoadState.quantityType}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, quantityType: e.target.value })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                          >
                            {unitOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editingLoadState.rateType}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, rateType: e.target.value as "per_unit" | "flat" })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                          >
                            {rateTypeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={editingLoadState.rate ?? ""}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, rate: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                            placeholder="Rate"
                          />
                          <input
                            type="number"
                            value={editingLoadState.kilometers ?? ""}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, kilometers: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded border-gray-300 text-xs p-1"
                            placeholder="KM"
                          />
                        </div>
                        <div className="col-span-6 flex justify-end gap-2">
                          <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-800 text-xs font-medium px-2 py-1 border border-green-200 rounded bg-green-50">Save</button>
                          <button onClick={handleCancelEdit} className="text-gray-600 hover:text-gray-800 text-xs font-medium px-2 py-1 border border-gray-200 rounded">Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <>
                      <div className="grid grid-cols-12 gap-4 flex-1 items-center">
                        <div className="col-span-1 text-sm text-gray-500 font-mono">#{load.sequence}</div>
                        <div className="col-span-3 font-medium truncate">{load.clientName}</div>
                        <div className="col-span-3 text-sm text-gray-600">
                          <div className="truncate"><span className="text-xs font-semibold text-gray-400">FROM:</span> {load.fromLocations.join(", ")}</div>
                          <div className="truncate"><span className="text-xs font-semibold text-gray-400">TO:</span> {load.toLocations.join(", ")}</div>
                        </div>
                        <div className="col-span-1 text-sm text-right">{load.quantity} {unitMap[load.quantityType] || load.quantityType}</div>
                        <div className="col-span-1 text-sm text-right font-mono text-gray-400 text-xs">{load.kilometers ? `${load.kilometers} km` : "-"}</div>
                        <div className="col-span-2 text-right">
                          <div className="text-sm font-medium">{formatZAR(calculateLoadAmount(load.quantity, load.rate, load.rateType))}</div>
                          <div className="text-xs text-gray-500">{load.rateType === "flat" ? "Flat Rate" : `${formatZAR(load.rate)} / ${unitMap[load.quantityType] || load.quantityType}`}</div>
                        </div>
                      </div>
                      {isEditable && (
                        <div className="flex items-center ml-4 gap-2">
                          <button
                            onClick={() => handleEditLoad(load)}
                            className="text-blue-500 hover:text-blue-700 p-1"
                            title="Edit Load"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemoveLoad(load.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Remove Load"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Load Form */}
        {isEditable && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Add Load</h3>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              {/* Growing Zone: Client + Pickups + Drops */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                {/* Client */}
                <div>
                  <input
                    type="text"
                    placeholder="Client Name"
                    value={draftLoad.clientName ?? ""}
                    onChange={(e) => setDraftLoad({ ...draftLoad, clientName: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                  />
                </div>

                {/* From Locations (Repeatable) */}
                <div className="space-y-2">
                  {draftLoad.fromLocations.map((loc, idx) => (
                    <div key={idx} className="flex gap-1">
                      <input
                        type="text"
                        placeholder="Pickup Location"
                        value={loc ?? ""}
                        onChange={(e) => updateDraftLocation("from", idx, e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                      />
                      {draftLoad.fromLocations.length > 1 && (
                        <button onClick={() => removeLocationField("from", idx)} className="text-gray-400 hover:text-red-500">×</button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addLocationField("from")}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    + Add Pickup
                  </button>
                </div>

                {/* To Locations (Repeatable) */}
                <div className="space-y-2">
                  {draftLoad.toLocations.map((loc, idx) => (
                    <div key={idx} className="flex gap-1">
                      <input
                        type="text"
                        placeholder="Drop Location"
                        value={loc ?? ""}
                        onChange={(e) => updateDraftLocation("to", idx, e.target.value)}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                      />
                      {draftLoad.toLocations.length > 1 && (
                        <button onClick={() => removeLocationField("to", idx)} className="text-gray-400 hover:text-red-500">×</button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addLocationField("to")}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    + Add Drop
                  </button>
                </div>
              </div>

              {/* Fixed Zone: Numeric Inputs */}
              <div className="flex gap-2 self-start items-center">
                <input
                  type="number"
                  placeholder="Qty"
                  value={draftLoad.quantity ?? ""}
                  onChange={(e) => setDraftLoad({ ...draftLoad, quantity: e.target.value })}
                  className="w-24 h-10 min-h-[40px] self-start rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                />
                <select
                  value={draftLoad.quantityType}
                  onChange={(e) => setDraftLoad({ ...draftLoad, quantityType: e.target.value })}
                  className="w-24 h-10 min-h-[40px] self-start rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                >
                  {unitOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  value={draftLoad.rateType}
                  onChange={(e) => setDraftLoad({ ...draftLoad, rateType: e.target.value })}
                  className="w-24 h-10 min-h-[40px] self-start rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                >
                  {rateTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Rate"
                  value={draftLoad.rate ?? ""}
                  onChange={(e) => setDraftLoad({ ...draftLoad, rate: e.target.value })}
                  className="w-32 h-10 min-h-[40px] self-start rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                />
                <input
                  type="number"
                  placeholder="KM (Est)"
                  value={draftLoad.kilometers ?? ""}
                  onChange={(e) => setDraftLoad({ ...draftLoad, kilometers: e.target.value })}
                  className="w-28 h-10 min-h-[40px] self-start rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleAddLoad}
                className="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Add Load
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Journey Legs Section REMOVED */}

      {/* Save Actions */}
      {isEditable && (
        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={handleSave}
            className="bg-green-600 text-white px-6 py-2 rounded-md text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
          >
            {isEditMode ? "Update Route" : "Save Route"}
          </button>
        </div>
      )}
    </div>
  );
}
