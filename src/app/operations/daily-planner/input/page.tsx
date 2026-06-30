"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { calculateLoadAmount } from "@/convex/utils";

import { WizardRouteHeader } from "@/src/components/operations/daily-planner/WizardRouteHeader";

type Load = {
  id: string;
  clientName: string;
  fromLocations: string[];
  toLocations: string[];
  quantity: string;
  quantityType: string;
  rate: string;
  rateType: "per_unit" | "flat";
  sequence: number;
  kilometers?: number;
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
          fromLocations: l.fromLocations ?? [],
          toLocations: l.toLocations ?? [],
          quantity: String(l.quantity ?? ""),
          quantityType: l.quantityType || "tons",
          rate: String(l.rate ?? ""),
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
      quantity: draftLoad.quantity,
      quantityType: draftLoad.quantityType || "tons",
      rate: draftLoad.rate,
      rateType: (draftLoad.rateType as "per_unit" | "flat") || "per_unit",
      sequence: loads.length + 1,
      kilometers: 0,
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
    const totalRevenue = loads.reduce((sum, load) =>
      sum + calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.rate) || 0, load.rateType), 0);

    const uniqueUnits = Array.from(new Set(loads.map(l => l.quantityType)));

    let quantityDisplay = "0 t";
    if (loads.length > 0) {
      if (uniqueUnits.length === 1) {
        const sum = loads.reduce((acc, l) => acc + (parseFloat(l.quantity) || 0), 0);
        const unit = unitMap[uniqueUnits[0]] || uniqueUnits[0];
        quantityDisplay = `${sum.toFixed(2)} ${unit}`;
      } else {
        quantityDisplay = "Mixed";
      }
    }

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
          truckFleetNo: truckFleetNo, // Canonical
          truckFleetNoStr: truckFleetNo, // Legacy
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
          truckFleetNo: truckFleetNo, // Canonical
          truckFleetNoStr: truckFleetNo, // Legacy
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
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-900/70 backdrop-blur-lg -mx-8 px-8 pt-8 pb-4 border-b border-gray-200 dark:border-white/10 shadow-sm mb-8 -mt-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {mode === "edit" ? "Edit Route" : "New Route"}
        </h1>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Create and manage your fleet routes efficiently</p>
      </div>

      <div className="space-y-8 pb-8">
        {/* Main Form - Wizard Header */}
        <div className={`
          bg-white dark:bg-white/5 dark:backdrop-blur-lg border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300
          ${headerComplete ? "h-auto" : "h-auto"}
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
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Loads
                  </h3>
                  <div className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-white/10 dark:backdrop-blur px-4 py-2 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                    Total: <span className="font-semibold text-gray-900 dark:text-gray-100">{loads.length}</span>
                    {loads.length > 0 && (
                        <span className="ml-3 pl-3 border-l border-gray-300 dark:border-white/20">
                            {totals.quantityDisplay} • <span className="font-semibold text-gray-900 dark:text-gray-100">{formatZAR(totals.revenue)}</span>
                        </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {loads.map((load, index) => (
                    <div key={load.id} className="p-4 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 dark:backdrop-blur-md hover:bg-gray-50 dark:hover:bg-white/10 transition-all duration-200 relative group shadow-sm">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1 flex-1">
                                <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 dark:bg-white/20 text-gray-700 dark:text-gray-200 text-xs font-bold">{load.sequence}</span>
                                    {load.clientName}
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    {load.fromLocations.join(", ")} → {load.toLocations.join(", ")}
                                </div>
                            </div>
                            <div className="text-right space-y-1 pl-4">
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                    {load.quantity} <span className="text-gray-600 dark:text-gray-400 text-sm">{unitMap[load.quantityType] || load.quantityType}</span>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                    {formatZAR(parseFloat(load.rate) || 0)} <span className="text-xs text-gray-500 dark:text-gray-400">/{load.rateType === "flat" ? "flat" : "unit"}</span>
                                </div>
                                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm pt-2 border-t border-gray-200 dark:border-white/10 mt-2">
                                    {formatZAR(calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.rate) || 0, load.rateType))}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        {isEditable && (
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button 
                                    onClick={() => handleRemoveLoad(load.id)}
                                    className="p-2 text-gray-500 hover:text-red-600 rounded hover:bg-red-100/50 transition-colors"
                                    title="Remove Load"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                  ))}
                  
                  {loads.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-white/20 rounded-lg text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-white/5 dark:backdrop-blur-sm transition-all duration-300">
                        <span className="text-4xl block mb-2">📋</span>
                        <p className="font-medium">No loads added yet.</p>
                        <p className="text-sm">Start adding loads to build your route</p>
                    </div>
                  )}
                </div>

                {/* Add Load Form */}
                <div className={`border border-gray-200 dark:border-white/10 rounded-xl p-6 bg-white dark:bg-white/10 dark:backdrop-blur-xl shadow-lg transition-all duration-300 ${!isEditable ? "opacity-50 pointer-events-none" : ""}`}>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <span className="text-lg">➕</span> Add a New Load
                  </h4>
                  <div className="space-y-4">
                    {/* Row 1: Client */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        <span className="inline-flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 10a3 3 0 100-6 3 3 0 000 6z" />
                            <path fillRule="evenodd" d="M2 16a6 6 0 1112 0H2z" clipRule="evenodd" />
                          </svg>
                          <span>Client</span>
                        </span>
                      </label>
                      <input
                        type="text"
                        value={draftLoad.clientName}
                        onChange={(e) => setDraftLoad({ ...draftLoad, clientName: e.target.value.toUpperCase() })}
                        className="w-full h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors text-gray-900 dark:text-gray-100"
                        placeholder="Client Name"
                      />
                    </div>

                    {/* Row 2: Locations */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {/* From Locations */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          <span className="inline-flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 4.418 6 10 6 10s6-5.582 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z" clipRule="evenodd" />
                            </svg>
                            <span>From</span>
                          </span>
                        </label>
                        {draftLoad.fromLocations.map((loc, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              value={loc}
                              onChange={(e) => updateDraftLocation("from", i, e.target.value.toUpperCase())}
                              className="flex-1 h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors text-gray-900 dark:text-gray-100"
                              placeholder="Pickup Location"
                            />
                            {draftLoad.fromLocations.length > 1 && (
                              <button
                                onClick={() => removeLocationField("from", i)}
                                className="px-3 text-gray-400 hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addLocationField("from")}
                          className="text-xs text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white font-medium hover:bg-gray-100 dark:hover:bg-white/5 px-3 py-1.5 rounded transition-colors"
                        >
                          + Add Pickup
                        </button>
                      </div>

                      {/* To Locations */}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          <span className="inline-flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 4.418 6 10 6 10s6-5.582 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z" clipRule="evenodd" />
                            </svg>
                            <span>To</span>
                          </span>
                        </label>
                        {draftLoad.toLocations.map((loc, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              type="text"
                              value={loc}
                              onChange={(e) => updateDraftLocation("to", i, e.target.value.toUpperCase())}
                              className="flex-1 h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors text-gray-900 dark:text-gray-100"
                              placeholder="Drop Location"
                            />
                            {draftLoad.toLocations.length > 1 && (
                              <button
                                onClick={() => removeLocationField("to", i)}
                                className="px-3 text-gray-400 hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addLocationField("to")}
                          className="text-xs text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white font-medium hover:bg-gray-100 dark:hover:bg-white/5 px-3 py-1.5 rounded transition-colors"
                        >
                          + Add Drop
                        </button>
                      </div>
                    </div>

                    {/* Row 3: Metrics */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {/* Quantity */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          <span className="inline-flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M4 3a2 2 0 00-2 2v2a2 2 0 002 2h3V5a2 2 0 00-2-2H4z" />
                              <path d="M11 3a2 2 0 00-2 2v9a2 2 0 002 2h3a2 2 0 002-2V5a2 2 0 00-2-2h-3z" />
                            </svg>
                            <span>Quantity</span>
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={draftLoad.quantity}
                            onChange={(e) => setDraftLoad({ ...draftLoad, quantity: e.target.value })}
                            className="flex-1 h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors text-gray-900 dark:text-gray-100"
                            placeholder="0.00"
                          />
                          <select
                            value={draftLoad.quantityType}
                            onChange={(e) => setDraftLoad({ ...draftLoad, quantityType: e.target.value })}
                            className="h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors appearance-none cursor-pointer text-gray-900 dark:text-gray-100"
                          >
                            {unitOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Rate */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          <span className="inline-flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-600" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M10 2a6 6 0 00-6 6h2a4 4 0 118 0h2a6 6 0 00-6-6z" />
                              <path d="M4 11a6 6 0 0012 0h-2a4 4 0 11-8 0H4z" />
                            </svg>
                            <span>Rate (ZAR)</span>
                          </span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={draftLoad.rate}
                            onChange={(e) => setDraftLoad({ ...draftLoad, rate: e.target.value })}
                            className="flex-1 h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors text-gray-900 dark:text-gray-100"
                            placeholder="0.00"
                          />
                          <select
                            value={draftLoad.rateType}
                            onChange={(e) => setDraftLoad({ ...draftLoad, rateType: e.target.value })}
                            className="h-10 px-3 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-gray-900/60 dark:backdrop-blur-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none text-sm transition-colors appearance-none cursor-pointer text-gray-900 dark:text-gray-100"
                          >
                            {rateTypeOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Add Button */}
                    <div className="pt-4">
                      <button
                        onClick={handleAddLoad}
                        className="w-full bg-gray-800 hover:bg-gray-900 text-white px-6 py-2.5 rounded text-sm font-medium shadow-sm hover:shadow-md transition-all duration-200 flex justify-center items-center gap-2"
                      >
                        <span>Add Load</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

        {/* Save Actions */}
        {isEditable && (
          <div className="flex flex-col gap-4 pt-6 border-t border-gray-200 dark:border-white/10">
            {saveStatus === "error" && (
              <div className="bg-red-50 dark:bg-red-500/20 text-red-900 dark:text-red-200 p-4 rounded text-sm border border-red-200 dark:border-red-500/40 flex items-center gap-3 shadow-sm">
                <span className="font-semibold">Error:</span>
                <span>{saveError}</span>
              </div>
            )}
            {saveStatus === "success" && (
              <div className="bg-green-50 dark:bg-green-500/20 text-green-900 dark:text-green-200 p-4 rounded text-sm border border-green-200 dark:border-green-500/40 flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                <span className="font-semibold">✓</span>
                <span>Route saved successfully!</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className={`
                  bg-gray-900 hover:bg-black text-white px-8 py-2.5 rounded text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 dark:bg-gray-800/80 dark:backdrop-blur-sm dark:hover:bg-gray-700/80
                  ${saveStatus === "saving" ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {saveStatus === "saving" ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin inline-block">↻</span>
                    Saving...
                  </span>
                ) : (
                  "Save Route"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
