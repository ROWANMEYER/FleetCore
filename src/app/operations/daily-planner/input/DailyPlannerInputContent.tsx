"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { calculateLoadAmount } from "@/convex/utils";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";

import { WizardRouteHeader } from "@/src/components/operations/daily-planner/WizardRouteHeader";
import { PackageOpen, Plus, X, CheckCircle, Loader2, Pencil, Trash2 } from "lucide-react";

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
  subcontractorRate?: string;
  subcontractorRateType?: "per_unit" | "flat";
};

// Shared form control styling — big touch targets, readable text
const inputClass =
  "w-full h-11 px-3.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 dark:backdrop-blur-sm shadow-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none text-base transition-colors text-[var(--foreground)]";
// Fixed-width select (no w-full) for side-by-side input+dropdown pairs —
// lets the number input flex to fill the remaining space.
const selectClass =
  "h-11 px-3.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 dark:backdrop-blur-sm shadow-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none text-base transition-colors text-[var(--foreground)] appearance-none cursor-pointer";

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

function DailyPlannerInputForm() {
  const router = useRouter();
  const { user, token } = useAuth();
  const regionArg = useRegionArg();
  const [routeId, setRouteId] = useState<Id<"dailyRoutes"> | null>(null);
  const [urlDate, setUrlDate] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRouteId(params.get("id") as Id<"dailyRoutes"> | null);
    setUrlDate(params.get("date"));
  }, []);

  // We use routeId directly from URL as the source of truth.

  // Helper for Yesterday's date (Local time)
  const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Local state for the form
  const [date, setDate] = useState(urlDate || getYesterday());
  const [truckFleetNo, setTruckFleetNo] = useState("");
  const [trailerFleetNo, setTrailerFleetNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [notes, setNotes] = useState("");
  const [routeKilometers, setRouteKilometers] = useState("");
  const [region, setRegion] = useState<string>(
    user?.role === "regional" ? (user.region ?? "garden_route") : "garden_route"
  );
  const [headerComplete, setHeaderComplete] = useState(true);

  // Mobile: route details start expanded so the driver/truck/date fields are
  // immediately visible (the toggle is still there to collapse if wanted).
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  // Subcontractor mode
  const [isFleetMode, setIsFleetMode] = useState(true);
  const [selectedSubId, setSelectedSubId] = useState("");

  // Sync state with URL param (handle initial load or navigation)
  useEffect(() => {
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
      if (typeof draft.step === "number") {
        setWizardStep(draft.step);
        // If restored to summary (step 6), mark header complete
        if (draft.step > 5) {
          setHeaderComplete(true);
        }
      }
    } catch {
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
        notes,
      },
    };

    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [isEditMode, wizardStep, date, truckFleetNo, trailerFleetNo, driverName, routeKilometers, notes]);

  // 1) Loads state (single source of truth)
  const [loads, setLoads] = useState<Load[]>([]);
  const loadsListRef = useRef<HTMLDivElement>(null);

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
    subcontractorRate: "",
    subcontractorRateType: "per_unit",
  });

  // Queries
  const existingRoute = useQuery(api.dailyRoutes.getById, routeId ? { id: routeId, token, region: regionArg } : "skip");
  const appSettings = useQuery(api.settings.getAppSettings);
  const subcontractors = useQuery(api.subcontractors.getAll, {}) || [];
  const subcontractorIdFilter = isFleetMode ? undefined : ((selectedSubId || null) as Id<"subcontractors"> | null);
  const trucks = useQuery(api.fleet.getTrucks, { subcontractorId: subcontractorIdFilter }) || [];
  const trailers = useQuery(api.fleet.getTrailers, { subcontractorId: subcontractorIdFilter }) || [];
  const drivers = useQuery(api.fleet.getDrivers, { subcontractorId: subcontractorIdFilter }) || [];

  // Track if initial defaults have been applied (for new routes only)
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [showSubMargin, setShowSubMargin] = useState(true);

  // Apply fleet & subcontractor defaults from settings to new routes
  useEffect(() => {
    if (appSettings && !isEditMode && !defaultsApplied) {
      const settings = appSettings as any;
      const qty = settings.defaultQuantityType;
      const rate = settings.defaultRateType;
      const subRateType = settings.defaultSubRateType;
      const showMargin = settings.showSubMarginOnCards;
      if (qty || rate || subRateType) {
        setDraftLoad((prev) => ({
          ...prev,
          ...(qty ? { quantityType: qty } : {}),
          ...(rate ? { rateType: rate as "per_unit" | "flat" } : {}),
          ...(subRateType ? { subcontractorRateType: subRateType as "per_unit" | "flat" } : {}),
        }));
      }
      if (showMargin !== undefined) {
        setShowSubMargin(showMargin);
      }
      setDefaultsApplied(true);
    }
  }, [appSettings, isEditMode, defaultsApplied]);

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
      const params = new URLSearchParams(window.location.search);
      if (params.get("date") !== existingRoute.routeDate) {
        params.set("date", existingRoute.routeDate);
        router.replace(`?${params.toString()}`, { scroll: false });
      }

      setTruckFleetNo(existingRoute.truckFleetNoStr ?? existingRoute.truckFleetNo?.toString() ?? "");
      setTrailerFleetNo(existingRoute.trailerFleetNoStr ?? existingRoute.trailerFleetNo?.toString() ?? "");
      setDriverName(existingRoute.driverName ?? "");
      setNotes(existingRoute.notes ?? "");
      setRouteKilometers(existingRoute.routeKilometers?.toString() ?? "");
      setRegion((existingRoute as any).region ?? (user?.role === "regional" ? (user.region ?? "garden_route") : "garden_route"));

      // Restore subcontractor mode + selection
      const existingSubId = (existingRoute as any).subcontractorId as string | undefined;
      if (existingSubId) {
        setIsFleetMode(false);
        setSelectedSubId(existingSubId);
      } else {
        setIsFleetMode(true);
        setSelectedSubId("");
      }

      // Map existing loads to UI format
      if (existingRoute.loads) {
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
          subcontractorRate: l.subcontractorRate,
          subcontractorRateType: l.subcontractorRateType as "per_unit" | "flat" | undefined,
        }));
        setLoads(mappedLoads);
      }
    }
  }, [existingRoute, routeId, router, user]);

  // Regional users: keep the new-route region locked to their own region
  // (the populate effect above only runs for existing routes).
  useEffect(() => {
    const ownRegion = user?.role === "regional" ? user?.region : null;
    if (!routeId && ownRegion) {
      setRegion(ownRegion);
    }
  }, [routeId, user]);

  // Helper to update specific location in draft
  const updateDraftLocation = (type: "from" | "to", index: number, value: string) => {
    setDraftLoad((prev) => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: prev[
        type === "from" ? "fromLocations" : "toLocations"
      ].map((loc, i) => (i === index ? value : loc)),
    }));
  };

  // Helper to add location field
  const addLocationField = (type: "from" | "to") => {
    setDraftLoad((prev) => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: [
        ...prev[type === "from" ? "fromLocations" : "toLocations"],
        "",
      ],
    }));
  };

  // Helper to remove location field
  const removeLocationField = (type: "from" | "to", index: number) => {
    setDraftLoad((prev) => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: prev[
        type === "from" ? "fromLocations" : "toLocations"
      ].filter((_, i) => i !== index),
    }));
  };

  // 3) Add Load handler (REQUIRED)
  const handleAddLoad = (e?: React.MouseEvent) => {
    e?.preventDefault();

    // Filter out empty strings
    const cleanFromLocations = draftLoad.fromLocations.filter((l) => l && l.trim() !== "");
    const cleanToLocations = draftLoad.toLocations.filter((l) => l && l.trim() !== "");

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

    // Include subcontractor rate when in sub mode
    if (!isFleetMode) {
      newLoad.subcontractorRate = draftLoad.subcontractorRate;
      newLoad.subcontractorRateType = draftLoad.subcontractorRateType as "per_unit" | "flat";
    }

    // Appends a new load
    setLoads((prev) => [...prev, newLoad]);

    // Bring the newly added card into view (it appears above the form)
    requestAnimationFrame(() => {
      const container = loadsListRef.current;
      if (!container) return;
      const cards = container.querySelectorAll("[data-load-card]");
      const last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // Resets draftLoad
    const subDefault = appSettings ? (appSettings as any).defaultSubRateType : undefined;
    setDraftLoad({
      clientName: "",
      fromLocations: [""],
      toLocations: [""],
      quantity: "",
      quantityType: "tons",
      rate: "",
      rateType: "per_unit",
      subcontractorRate: "",
      subcontractorRateType: subDefault || "per_unit",
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

    setLoads(loads.map((l) => (l.id === editingLoadId ? editingLoadState : l)));
    setEditingLoadId(null);
    setEditingLoadState(null);
  };

  // Edit form is valid when client + at least one from + one to location are filled
  const editValid =
    !!editingLoadState &&
    editingLoadState.clientName.trim() !== "" &&
    (editingLoadState.fromLocations[0] ?? "").trim() !== "" &&
    (editingLoadState.toLocations[0] ?? "").trim() !== "";

  const calculateTotals = () => {
    const totalRevenue = loads.reduce(
      (sum, load) =>
        sum + calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.rate) || 0, load.rateType),
      0
    );

    const uniqueUnits = Array.from(new Set(loads.map((l) => l.quantityType)));

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

  // Add Load is only enabled once the required fields are filled
  const canAddLoad =
    draftLoad.clientName.trim() !== "" &&
    draftLoad.fromLocations.some((l) => l.trim() !== "") &&
    draftLoad.toLocations.some((l) => l.trim() !== "");

  const handleSave = async () => {
    // STAGE 4: Defensive check (Save should not proceed with missing fields)
    if (!date || !truckFleetNo || !driverName) {
      setSaveStatus("error");
      setSaveError("Please complete all required fields (Date, Truck, Driver).");
      return;
    }

    setSaveStatus("saving");
    setSaveError(null);

    const modeSubId = isFleetMode ? undefined : (selectedSubId || undefined) as Id<"subcontractors"> | undefined;

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
      subcontractorRate: l.subcontractorRate,
      subcontractorRateType: l.subcontractorRateType,
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
          subcontractorId: modeSubId,
          notes: notes || undefined,
          kilometers: totals.totalKm, // Legacy field (effective)
          routeKilometers: parseFloat(routeKilometers) || undefined,
          region: region as "garden_route" | "eastern_cape",
          token,
          loads: schemaLoads,
        });

        // EXIT EDIT MODE & RESET FORM
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
          subcontractorId: modeSubId,
          notes: notes || undefined,
          kilometers: totals.totalKm, // Legacy field (effective)
          routeKilometers: parseFloat(routeKilometers) || undefined,
          region: region as "garden_route" | "eastern_cape",
          token,
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
    <div className="h-full min-h-0 flex flex-col relative overflow-x-clip">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[var(--card-bg)]/90 backdrop-blur-lg -mx-4 sm:-mx-8 px-4 sm:px-8 pt-3 sm:pt-6 pb-3 sm:pb-4 border-b border-[var(--card-border)] shadow-sm mb-6 -mt-4 sm:-mt-8">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
          {mode === "edit" ? "Edit Route" : "New Route"}
        </h1>
        <p className="hidden sm:block text-sm text-[var(--nav-text-color)] mt-0.5">
          Create and manage your fleet routes
        </p>
      </div>

      <div className="space-y-8 pb-8">
        {/* Main Form - Wizard Header */}
        <div
          className={`
            bg-[var(--card-bg)] dark:backdrop-blur-lg border border-[var(--card-border)] rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300
            ${headerComplete ? "h-auto" : "h-auto"}
          `}
        >
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
            region={region}
            setRegion={setRegion}
            trucks={trucks || []}
            trailers={trailers || []}
            drivers={drivers || []}
            subcontractors={subcontractors}
            isFleetMode={isFleetMode}
            selectedSubId={selectedSubId}
            onFleetModeChange={setIsFleetMode}
            onSubIdChange={setSelectedSubId}
            isEditable={isEditable}
            isEditMode={mode === "edit"}
            onComplete={() => setHeaderComplete(true)}
            onEdit={() => setHeaderComplete(false)}
            step={wizardStep}
            setStep={setWizardStep}
            onSaveShortcut={handleSave}
            collapsed={detailsCollapsed}
            onToggleCollapse={() => setDetailsCollapsed((c) => !c)}
          />
        </div>

        {/* Loads Section */}
        <div className={`space-y-4 ${headerComplete ? "animate-in fade-in slide-in-from-bottom-4 duration-500" : "hidden"}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-[var(--foreground)]">Loads</h3>
            <div className="text-sm text-[var(--foreground)] bg-[var(--card-bg)] dark:backdrop-blur px-4 py-2.5 rounded-lg border border-[var(--card-border)] shadow-sm">
              Total: <span className="font-semibold text-[var(--foreground)]">{loads.length}</span>
              {loads.length > 0 && (
                <span className="ml-3 pl-3 border-l border-[var(--card-border)]">
                  {totals.quantityDisplay} • <span className="font-semibold text-[var(--foreground)]">{formatZAR(totals.revenue)}</span>
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3" ref={loadsListRef}>
            {loads.map((load) => {
              const isEditing = editingLoadId === load.id;

              // ── Inline edit card ─────────────────────────────
              if (isEditing && editingLoadState) {
                return (
                  <div
                    key={load.id}
                    data-load-card
                    className="p-3.5 sm:p-4 border border-[#06B6D4]/50 rounded-xl bg-[var(--card-bg)] dark:backdrop-blur-md shadow-md space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h5 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
                        <Pencil size={16} className="text-[#06B6D4]" />
                        Edit Load {load.sequence}
                      </h5>
                      <button
                        onClick={handleCancelEdit}
                        className="flex items-center justify-center w-11 h-11 rounded-lg text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
                        aria-label="Cancel editing"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">Client</label>
                        <input
                          type="text"
                          value={editingLoadState.clientName}
                          onChange={(e) =>
                            setEditingLoadState({ ...editingLoadState, clientName: e.target.value.toUpperCase() })
                          }
                          className={inputClass}
                          placeholder="Client Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">From</label>
                        <input
                          type="text"
                          value={editingLoadState.fromLocations.join(", ")}
                          onChange={(e) =>
                            setEditingLoadState({
                              ...editingLoadState,
                              fromLocations: e.target.value.split(",").map((s) => s.trim()),
                            })
                          }
                          className={inputClass}
                          placeholder="Pickup Location(s)"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">To</label>
                        <input
                          type="text"
                          value={editingLoadState.toLocations.join(", ")}
                          onChange={(e) =>
                            setEditingLoadState({
                              ...editingLoadState,
                              toLocations: e.target.value.split(",").map((s) => s.trim()),
                            })
                          }
                          className={inputClass}
                          placeholder="Drop Location(s)"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">Quantity</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={editingLoadState.quantity}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, quantity: e.target.value })}
                            className={`${inputClass} flex-1`}
                            placeholder="0.00"
                          />
                          <select
                            value={editingLoadState.quantityType}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, quantityType: e.target.value })}
                            className={`${selectClass} w-28 shrink-0`}
                          >
                            {unitOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[var(--foreground)] mb-1.5">Rate (ZAR)</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={editingLoadState.rate}
                            onChange={(e) => setEditingLoadState({ ...editingLoadState, rate: e.target.value })}
                            className={`${inputClass} flex-1`}
                            placeholder="0.00"
                          />
                          <select
                            value={editingLoadState.rateType}
                            onChange={(e) =>
                              setEditingLoadState({ ...editingLoadState, rateType: e.target.value as "per_unit" | "flat" })
                            }
                            className={`${selectClass} w-32 shrink-0`}
                          >
                            {rateTypeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={handleCancelEdit}
                        className="h-11 px-4 rounded-xl border border-[var(--card-border)] text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] text-base font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editValid}
                        className="flex-1 h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-base font-bold shadow-md shadow-[rgba(6,182,212,0.3)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle size={18} />
                        Save Load
                      </button>
                    </div>
                  </div>
                );
              }

              // ── Load card ────────────────────────────────────
              return (
                <div
                  key={load.id}
                  data-load-card
                  className="p-3.5 sm:p-4 border border-[var(--card-border)] rounded-xl bg-[var(--card-bg)] dark:backdrop-blur-md shadow-sm transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="font-semibold text-base text-[var(--foreground)] flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[var(--card-bg)] text-[var(--foreground)] text-xs font-bold border border-[var(--card-border)]">
                          {load.sequence}
                        </span>
                        <span className="truncate">{load.clientName}</span>
                      </div>
                      <div className="text-[15px] text-[var(--foreground)] leading-snug break-words">
                        {load.fromLocations.join(", ")} → {load.toLocations.join(", ")}
                      </div>
                      {!isFleetMode && load.subcontractorRate && showSubMargin && (
                        <div className="mt-1.5 pt-1.5 border-t border-dashed border-[var(--card-border)] space-y-0.5 text-sm">
                          <div className="flex justify-between text-[var(--nav-text-color)]">
                            <span>Sub cost:</span>
                            <span className="text-orange-500 font-medium">
                              {formatZAR(calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.subcontractorRate) || 0, load.subcontractorRateType || "per_unit"))}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span className="text-[var(--nav-text-color)]">Margin:</span>
                            <span className="text-emerald-500">
                              {formatZAR(calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.rate) || 0, load.rateType) - calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.subcontractorRate) || 0, load.subcontractorRateType || "per_unit"))}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions — always visible on touch, hover-revealed on desktop */}
                    {isEditable && (
                      <div className="flex items-center gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditLoad(load)}
                          className="flex items-center justify-center w-11 h-11 rounded-lg text-[var(--nav-text-color)] hover:text-[#06B6D4] hover:bg-[var(--card-bg)] transition-colors"
                          title="Edit Load"
                          aria-label={`Edit load ${load.sequence}`}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => handleRemoveLoad(load.id)}
                          className="flex items-center justify-center w-11 h-11 rounded-lg text-[var(--nav-text-color)] hover:text-red-600 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
                          title="Remove Load"
                          aria-label={`Remove load ${load.sequence}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-2.5 pt-2.5 border-t border-[var(--card-border)] flex items-center justify-between gap-3">
                    <span className="text-sm text-[var(--nav-text-color)]">
                      {load.quantity}{" "}
                      <span className="font-semibold text-[var(--foreground)]">{unitMap[load.quantityType] || load.quantityType}</span>
                      <span className="mx-1.5">•</span>
                      {formatZAR(parseFloat(load.rate) || 0)}
                      <span className="text-xs">/{load.rateType === "flat" ? "flat" : "unit"}</span>
                    </span>
                    <span className="text-base font-bold text-[var(--foreground)] shrink-0">
                      {formatZAR(calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.rate) || 0, load.rateType))}
                    </span>
                  </div>
                </div>
              );
            })}

            {loads.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-[var(--card-border)] rounded-lg text-[var(--nav-text-color)] bg-[var(--card-bg)] dark:backdrop-blur-sm transition-all duration-300">
                <PackageOpen className="w-11 h-11 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p className="font-medium text-base text-[var(--foreground)]">No loads added yet.</p>
                <p className="text-sm">Start adding loads to build your route</p>
              </div>
            )}
          </div>

          {/* Add Load Form */}
          <div
            className={`border border-[var(--card-border)] rounded-xl p-3.5 sm:p-5 bg-[var(--card-bg)] dark:backdrop-blur-xl shadow-lg transition-all duration-300 ${
              !isEditable ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <h4 className="text-lg font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-md shadow-[rgba(6,182,212,0.3)]">
                <Plus size={18} strokeWidth={2.5} />
              </span>
              Add a New Load
            </h4>
            <div className="space-y-4">
              {/* Row 1: Client */}
              <div className="mb-4">
                <label className="block text-base font-semibold text-[var(--foreground)] mb-2">
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
                  className={inputClass}
                  placeholder="Client Name"
                />
              </div>

              {/* Row 2: Locations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* From Locations */}
                <div className="space-y-2">
                  <label className="block text-base font-semibold text-[var(--foreground)]">
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
                        className={inputClass}
                        placeholder="Pickup Location"
                      />
                      {draftLoad.fromLocations.length > 1 && (
                        <button
                          onClick={() => removeLocationField("from", i)}
                          className="flex items-center justify-center w-12 shrink-0 text-[var(--nav-text-color)] hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                          aria-label="Remove pickup location"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addLocationField("from")}
                    className="text-sm text-[var(--nav-text-color)] hover:text-[var(--foreground)] dark:hover:text-white font-semibold hover:bg-[var(--card-bg)] px-4 py-3 rounded-lg transition-colors"
                  >
                    + Add Pickup
                  </button>
                </div>

                {/* To Locations */}
                <div className="space-y-2">
                  <label className="block text-base font-semibold text-[var(--foreground)]">
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
                        className={inputClass}
                        placeholder="Drop Location"
                      />
                      {draftLoad.toLocations.length > 1 && (
                        <button
                          onClick={() => removeLocationField("to", i)}
                          className="flex items-center justify-center w-12 shrink-0 text-[var(--nav-text-color)] hover:text-red-600 hover:bg-red-50/80 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                          aria-label="Remove drop location"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => addLocationField("to")}
                    className="text-sm text-[var(--nav-text-color)] hover:text-[var(--foreground)] dark:hover:text-white font-semibold hover:bg-[var(--card-bg)] px-4 py-3 rounded-lg transition-colors"
                  >
                    + Add Drop
                  </button>
                </div>
              </div>

              {/* Row 3: Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* Quantity */}
                <div>
                  <label className="block text-base font-semibold text-[var(--foreground)] mb-2">
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
                      className={`${inputClass} flex-1`}
                      placeholder="0.00"
                    />
                    <select
                      value={draftLoad.quantityType}
                      onChange={(e) => setDraftLoad({ ...draftLoad, quantityType: e.target.value })}
                      className={`${selectClass} w-28 shrink-0`}
                    >
                      {unitOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Rate */}
                <div>
                  <label className="block text-base font-semibold text-[var(--foreground)] mb-2">
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
                      className={`${inputClass} flex-1`}
                      placeholder="0.00"
                    />
                    <select
                      value={draftLoad.rateType}
                      onChange={(e) => setDraftLoad({ ...draftLoad, rateType: e.target.value })}
                      className={`${selectClass} w-32 shrink-0`}
                    >
                      {rateTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Subcontractor Rate (only in sub mode) */}
              {!isFleetMode && (
                <div className="border-t pt-4 mt-4 border-dashed border-[var(--card-border)]">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.51-1.31c-.562-.649-1.413-1.076-2.353-1.253V5z" clipRule="evenodd" />
                    </svg>
                    <span className="text-base font-semibold text-[var(--foreground)]">Subcontractor Rate</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-orange-700 dark:text-orange-400 mb-1.5">
                        Sub Rate (what you pay sub)
                      </label>
                      <input
                        type="number"
                        value={draftLoad.subcontractorRate}
                        onChange={(e) => setDraftLoad({ ...draftLoad, subcontractorRate: e.target.value })}
                        className="w-full h-12 px-4 rounded-lg border border-orange-300 dark:border-orange-700/50 bg-[var(--card-bg)]/60 shadow-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 focus:outline-none text-base transition-colors text-[var(--foreground)]"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-orange-700 dark:text-orange-400 mb-1.5">
                        Sub Rate Type
                      </label>
                      <select
                        value={draftLoad.subcontractorRateType}
                        onChange={(e) => setDraftLoad({ ...draftLoad, subcontractorRateType: e.target.value })}
                        className="w-full h-12 px-4 rounded-lg border border-orange-300 dark:border-orange-700/50 bg-[var(--card-bg)]/60 shadow-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 focus:outline-none text-base transition-colors appearance-none cursor-pointer text-[var(--foreground)]"
                      >
                        <option value="per_unit">Per Unit</option>
                        <option value="flat">Flat Rate</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Add Button */}
              <div className="pt-4">
                <button
                  onClick={handleAddLoad}
                  disabled={!canAddLoad}
                  className="w-full h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-base font-bold shadow-lg shadow-[rgba(6,182,212,0.3)] hover:opacity-90 transition-all flex justify-center items-center gap-2 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  <Plus size={20} strokeWidth={2.5} />
                  <span>Add Load</span>
                </button>
                {!canAddLoad && (
                  <p className="text-xs text-[var(--nav-text-color)] mt-2 text-center">
                    Enter a client, pickup and drop location to add a load
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Save Actions — in normal flow at the end of the form, scrolls with the content */}
        {isEditable && (
          <div className="-mx-4 sm:-mx-8 px-4 sm:px-8 py-4 sm:py-5 flex flex-col gap-4 border-t border-[var(--card-border)] bg-[var(--card-bg)]/95 backdrop-blur-xl">
          {saveStatus === "error" && (
            <div className="bg-red-50 dark:bg-red-500/20 text-red-900 dark:text-red-200 p-4 rounded-lg text-sm border border-red-200 dark:border-red-500/40 flex items-center gap-3 shadow-sm">
              <span className="font-semibold">Error:</span>
              <span>{saveError}</span>
            </div>
          )}
          {saveStatus === "success" && (
            <div className="bg-green-50 dark:bg-green-500/20 text-green-900 dark:text-green-200 p-4 rounded-lg text-sm border border-green-200 dark:border-green-500/40 flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <span>Route saved successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--nav-text-color)]">Total</p>
              <p className="text-xl sm:text-2xl font-black text-[var(--foreground)] truncate">
                {formatZAR(totals.revenue)}
              </p>
              {loads.length > 0 && (
                <p className="text-xs text-[var(--nav-text-color)]">
                  {loads.length} load{loads.length === 1 ? "" : "s"} • {totals.quantityDisplay}
                </p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saveStatus === "saving"}
              className={`flex-1 max-w-[220px] h-12 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-base font-bold shadow-lg shadow-[rgba(6,182,212,0.35)] hover:opacity-90 transition-all flex items-center justify-center gap-2 ${
                saveStatus === "saving" ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {saveStatus === "saving" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle size={20} />
                  Save Route
                </span>
              )}
            </button>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DailyPlannerInputContent() {
  return (
    <Suspense fallback={null}>
      <DailyPlannerInputForm />
    </Suspense>
  );
}
