"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateLoadAmount } from "../../../../convex/utils";

import { WizardRouteHeader } from "@/src/components/operations/daily-planner/WizardRouteHeader";

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
// [HYDRATION SAFE] Use deterministic formatting to avoid server/client mismatches
// Matches strict ZAR format in src/pdf/formatters.ts: "R 1 234,56"
const formatZAR = (value: number) => {
  const parts = value.toFixed(2).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R ${integerPart},${parts[1]}`;
};

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

import WarningIcon from "@/src/components/common/WarningIcon";

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
  // REMOVED: const [editingRouteId, setEditingRouteId] = useState<Id<"dailyRoutes"> | null>(routeId);
  // We use routeId directly from URL as the source of truth.

  // Helper for Yesterday's date (Local time)
  const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Local state for the form
  const [date, setDate] = useState(urlDate || getYesterday());
  const [truckFleetNo, setTruckFleetNo] = useState("");
  const [trailerFleetNo, setTrailerFleetNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [notes, setNotes] = useState("");
  const [routeKilometers, setRouteKilometers] = useState("");
  const [headerComplete, setHeaderComplete] = useState(true);

  // Sync state with URL param (handle initial load or navigation)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (routeId) setHeaderComplete(true);
  }, [routeId]);

  const isEditMode = !!routeId;
  const mode: "create" | "edit" = isEditMode ? "edit" : "create";

  // ---------------------------------------------------------------------------
  // SESSION RECOVERY (STAGE 5)
  // ---------------------------------------------------------------------------
  const DRAFT_KEY = "fleetcor_daily_planner_draft";
  const DRAFT_TTL = 10 * 60 * 1000; // 10 minutes

  // Controlled step state for Wizard
  const [wizardStep, setWizardStep] = useState(isEditMode ? 6 : 0);

  // 1. RECOVERY (Mount only)
  useEffect(() => {
    // Only recover for NEW routes (Create Mode)
    if (isEditMode) return;

    try {
      const stored = sessionStorage.getItem(DRAFT_KEY);
      if (!stored) return;

      const draft = JSON.parse(stored);
      const age = Date.now() - draft.timestamp;

      if (age > DRAFT_TTL) {
        sessionStorage.removeItem(DRAFT_KEY);
        return;
      }

      // Restore State (Silent)
      if (draft.data) {
        if (draft.data.date) setDate(draft.data.date);
        if (draft.data.truckFleetNo) setTruckFleetNo(draft.data.truckFleetNo);
        if (draft.data.trailerFleetNo) setTrailerFleetNo(draft.data.trailerFleetNo);
        if (draft.data.driverName) setDriverName(draft.data.driverName);
        if (draft.data.routeKilometers) setRouteKilometers(draft.data.routeKilometers);
        if (draft.data.notes) setNotes(draft.data.notes);
      }

      // Restore Step
      if (typeof draft.step === 'number') {
        setWizardStep(draft.step);
        // If restored to summary (step 6), mark header complete
        if (draft.step > 5) {
          setHeaderComplete(true);
        }
      }
    } catch (e) {
      // Silent failure - clear corrupt data
      sessionStorage.removeItem(DRAFT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // 2. PERSISTENCE (On Change)
  useEffect(() => {
    if (isEditMode) return;
    
    const draft = {
      timestamp: Date.now(),
      step: wizardStep,
      data: {
        date,
        truckFleetNo,
        trailerFleetNo,
        driverName,
        routeKilometers,
        notes
      }
    };
    
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [isEditMode, wizardStep, date, truckFleetNo, trailerFleetNo, driverName, routeKilometers, notes]);

  // 1) Loads state (single source of truth)
  const [loads, setLoads] = useState<Load[]>([]);

  // Feedback state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // 2) Draft load form state
  const [draftLoad, setDraftLoad] = useState({
    clientName: "",
    fromLocations: [""] as string[], // Initialize with one empty string
    toLocations: [""] as string[], // Initialize with one empty string
    quantity: "",
    quantityType: "tons", // Default
    rate: "",
    rateType: "per_unit", // Default
  });

  // Queries
  const existingRoute = useQuery(api.dailyRoutes.getById, routeId ? { id: routeId } : "skip");
  const trucks = useQuery(api.fleet.getTrucks, {}) || [];
  const trailers = useQuery(api.fleet.getTrailers, {}) || [];
  const drivers = useQuery(api.fleet.getDrivers, {}) || [];

  // Mutations
  const createRoute = useMutation(api.dailyRoutes.createDailyRoute);
  const updateRoute = useMutation(api.dailyRoutes.updateDailyRoute);

  // Derived State
  const routeStatus = existingRoute?.status || "planned";
  const isEditable = routeStatus === "planned";

  // Populate form when existing route loads
  useEffect(() => {
    if (existingRoute && routeId) {
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
      setRouteKilometers(existingRoute.routeKilometers?.toString() ?? "");

      // Map existing loads to UI format
      if (existingRoute.loads) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }, [existingRoute, routeId, searchParams, router]);

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
  const handleAddLoad = (e?: React.MouseEvent) => {
    e?.preventDefault();

    // Filter out empty strings
    const cleanFromLocations = draftLoad.fromLocations.filter(l => l && l.trim() !== "");
    const cleanToLocations = draftLoad.toLocations.filter(l => l && l.trim() !== "");

    // Validation - Simple and Explicit
    if (!draftLoad.clientName?.trim()) return;
    if (cleanFromLocations.length === 0) return;
    if (cleanToLocations.length === 0) return;

    const newLoad: Load = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      clientName: draftLoad.clientName.trim(),
      fromLocations: cleanFromLocations,
      toLocations: cleanToLocations,
      quantity: parseFloat(draftLoad.quantity) || 0,
      quantityType: draftLoad.quantityType || "tons",
      rate: parseFloat(draftLoad.rate) || 0,
      rateType: (draftLoad.rateType as "per_unit" | "flat") || "per_unit",
      sequence: loads.length + 1,
      kilometers: 0, // Default to 0
    };

    // Appends a new load
    setLoads(prev => [...prev, newLoad]);

    // Resets draftLoad
    setDraftLoad({
      clientName: "",
      fromLocations: [""],
      toLocations: [""],
      quantity: "",
      quantityType: "tons",
      rate: "",
      rateType: "per_unit",
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

    // Effective KM: Route KM > Max Load KM
    const rKm = parseFloat(routeKilometers) || 0;
    const maxLKm = loads.reduce((max, l) => Math.max(max, l.kilometers || 0), 0);
    const effectiveKm = rKm > 0 ? rKm : maxLKm;

    return { quantityDisplay, revenue: totalRevenue, totalKm: effectiveKm };
  };

  const totals = calculateTotals();

  const handleSave = async () => {
    // STAGE 4: Defensive check (Save should not proceed with missing fields)
    if (!date || !truckFleetNo || !driverName) {
      setSaveStatus("error");
      setSaveError("Please complete all required fields (Date, Truck, Driver).");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    // Transform UI loads to Schema loads
    const schemaLoads = loads.map((l) => ({
      client: l.clientName,
      quantity: l.quantity.toString(),
      quantityType: l.quantityType,
      rate: l.rate.toString(),
      rateType: l.rateType,
      fromLocations: l.fromLocations, // Pass array directly
      toLocations: l.toLocations, // Pass array directly
      kilometers: l.kilometers,
    }));


    try {
      if (mode === "edit" && routeId) {
        await updateRoute({
          id: routeId,
          routeDate: date,
          truckFleetNoStr: truckFleetNo,
          driverName: driverName,
          trailerFleetNoStr: trailerFleetNo || undefined,
          notes: notes || undefined,
          kilometers: totals.totalKm, // Legacy field (effective)
          routeKilometers: parseFloat(routeKilometers) || undefined,
          loads: schemaLoads,
        });

        // EXIT EDIT MODE & RESET FORM
        // REMOVED: setEditingRouteId(null);
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
          kilometers: totals.totalKm, // Legacy field (effective)
          routeKilometers: parseFloat(routeKilometers) || undefined,
          loads: schemaLoads,

        });

        // Clear session draft (STAGE 5)
        sessionStorage.removeItem(DRAFT_KEY);
        setWizardStep(0);

        // Reset form only on create
        setTruckFleetNo("");
        setTrailerFleetNo("");
        setDriverName("");
        setNotes("");
        setLoads([]); // Reset loads too
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (error) {
      console.error("Failed to save route:", error);
      setSaveStatus("error");
      setSaveError(error instanceof Error ? error.message : "An unexpected error occurred.");
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white -mx-8 px-8 pt-8 pb-4 border-b border-gray-100 shadow-sm mb-8 -mt-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "edit" ? "Edit Route" : "New Route"}
        </h1>
      </div>

      <div className="space-y-8 pb-8">
        {/* Main Form - Wizard Header */}
        <div className={`
          bg-gray-50 border border-gray-200 rounded-lg overflow-hidden
          ${headerComplete ? "h-auto" : "h-auto"}
          transition-all duration-300
        `}>
          <WizardRouteHeader
            date={date}
            setDate={setDate}
            truckFleetNo={truckFleetNo}
            setTruckFleetNo={setTruckFleetNo}
            trailerFleetNo={trailerFleetNo}
            setTrailerFleetNo={setTrailerFleetNo}
            driverName={driverName}
            setDriverName={setDriverName}
            routeKilometers={routeKilometers}
            setRouteKilometers={setRouteKilometers}
            notes={notes}
            setNotes={setNotes}
            trucks={trucks || []}
            trailers={trailers || []}
            drivers={drivers || []}
            isEditable={isEditable}
            isEditMode={mode === "edit"}
            onComplete={() => setHeaderComplete(true)}
            onEdit={() => setHeaderComplete(false)}
            step={wizardStep}
            setStep={setWizardStep}
            onSaveShortcut={handleSave}
          />
        </div>

        {/* Loads Section - RESTORED PARTIAL (List Only) */}
              <div className={`space-y-4 ${headerComplete ? "animate-in fade-in slide-in-from-bottom-4 duration-500" : "hidden"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Loads</h3>
                  <div className="text-sm text-gray-500">
                    Total: <span className="font-medium text-gray-900">{loads.length}</span>
                    {loads.length > 0 && (
                        <span className="ml-2 pl-2 border-l border-gray-300">
                            {totals.quantityDisplay} • {formatZAR(totals.revenue)}
                        </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {loads.map((load, index) => (
                    <div key={load.id} className="p-4 border rounded-lg bg-white shadow-sm relative group">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <div className="font-medium text-gray-900 flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-400">#{load.sequence}</span>
                                    {load.clientName}
                                </div>
                                <div className="text-sm text-gray-600">
                                    <span className="text-gray-400">From:</span> {load.fromLocations.join(", ")}
                                </div>
                                <div className="text-sm text-gray-600">
                                    <span className="text-gray-400">To:</span> {load.toLocations.join(", ")}
                                </div>
                            </div>
                            <div className="text-right space-y-1">
                                <div className="font-medium text-gray-900">
                                    {load.quantity} <span className="text-gray-500 text-sm">{unitMap[load.quantityType] || load.quantityType}</span>
                                </div>
                                <div className="text-sm text-gray-600">
                                    {formatZAR(load.rate)} <span className="text-xs text-gray-400">/{load.rateType === "flat" ? "flat" : "unit"}</span>
                                </div>
                                <div className="font-medium text-emerald-600 text-sm pt-1 border-t border-gray-100 mt-1">
                                    {formatZAR(calculateLoadAmount(load.quantity, load.rate, load.rateType))}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        {isEditable && (
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button 
                                    onClick={() => handleRemoveLoad(load.id)}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                                    title="Remove Load"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                  ))}
                  
                  {loads.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 bg-gray-50/50">
                        No loads added yet.
                    </div>
                  )}
                </div>

                {/* Add Load Form */}
                <div className={`border rounded-lg p-4 bg-gray-50 transition-all duration-300 ${!isEditable ? "opacity-50 pointer-events-none" : ""}`}>
                  <div className="space-y-4">
                    {/* Row 1: Client */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                      <input
                        type="text"
                        value={draftLoad.clientName}
                        onChange={(e) => setDraftLoad({ ...draftLoad, clientName: e.target.value })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        placeholder="Client Name"
                      />
                    </div>

                    {/* Row 2: Locations */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* From Locations */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">From</label>
                        {draftLoad.fromLocations.map((loc, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              value={loc}
                              onChange={(e) => updateDraftLocation("from", i, e.target.value)}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                              placeholder="Pickup Location"
                            />
                            {draftLoad.fromLocations.length > 1 && (
                              <button
                                onClick={() => removeLocationField("from", i)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addLocationField("from")}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          + Add Pickup
                        </button>
                      </div>

                      {/* To Locations */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">To</label>
                        {draftLoad.toLocations.map((loc, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              value={loc}
                              onChange={(e) => updateDraftLocation("to", i, e.target.value)}
                              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                              placeholder="Drop Location"
                            />
                            {draftLoad.toLocations.length > 1 && (
                              <button
                                onClick={() => removeLocationField("to", i)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addLocationField("to")}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          + Add Drop
                        </button>
                      </div>
                    </div>

                    {/* Row 3: Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Quantity */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={draftLoad.quantity}
                            onChange={(e) => setDraftLoad({ ...draftLoad, quantity: e.target.value })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="0.00"
                          />
                          <select
                            value={draftLoad.quantityType}
                            onChange={(e) => setDraftLoad({ ...draftLoad, quantityType: e.target.value })}
                            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          >
                            {unitOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Rate */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rate (R)</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={draftLoad.rate}
                            onChange={(e) => setDraftLoad({ ...draftLoad, rate: e.target.value })}
                            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="0.00"
                          />
                          <select
                            value={draftLoad.rateType}
                            onChange={(e) => setDraftLoad({ ...draftLoad, rateType: e.target.value })}
                            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          >
                            {rateTypeOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Add Button */}
                    <div className="pt-2">
                      <button
                        onClick={handleAddLoad}
                        className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 shadow-sm flex justify-center items-center gap-2"
                      >
                        <span>+ Add Load to Route</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

        {/* Save Actions */}
        {isEditable && (
          <div className="flex flex-col gap-4 pt-4 border-t">
            {saveStatus === "error" && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-200 flex items-center gap-2">
                <WarningIcon tooltip="Error" />
                {saveError}
              </div>
            )}
            {saveStatus === "success" && (
              <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm border border-green-200">
                Route saved successfully!
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className={`
                  bg-green-600 text-white px-6 py-2 rounded-md text-sm font-medium shadow-sm transition-colors
                  ${saveStatus === "saving" ? "opacity-50 cursor-not-allowed" : "hover:bg-green-700"}
                `}
              >
                {saveStatus === "saving" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
