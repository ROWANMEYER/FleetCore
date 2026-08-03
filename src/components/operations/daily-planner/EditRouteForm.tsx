"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateLoadAmount } from "../../../../convex/utils";
import { useToast } from "../../../components/common/Toast";
import { useAuth, useRegionArg } from "../../../components/auth/AuthProvider";

// --- Types ---
interface EditRouteFormProps {
  routeId: Id<"dailyRoutes">;
  onSuccess: () => void;
  onCancel: () => void;
  isDayMode?: boolean;
}

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

// --- Helpers ---
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

export default function EditRouteForm({ routeId, onSuccess, onCancel, isDayMode = true }: EditRouteFormProps) {
  // --- Queries ---
  const { user, token } = useAuth();
  const region = useRegionArg();
  const route = useQuery(api.dailyRoutes.getById, { id: routeId, token, region });
  const appSettings = useQuery(api.settings.getAppSettings);
  const subcontractors = useQuery(api.subcontractors.list, {}) || [];
  const [isFleetMode, setIsFleetMode] = useState(true);
  const [selectedSubId, setSelectedSubId] = useState<string>("");
  const subcontractorIdFilter = isFleetMode ? undefined : ((selectedSubId || null) as Id<"subcontractors"> | null);
  const trucks = useQuery(api.fleet.listTrucks, { subcontractorId: subcontractorIdFilter }) || [];
  const trailers = useQuery(api.fleet.listTrailers, { subcontractorId: subcontractorIdFilter }) || [];
  const drivers = useQuery(api.fleet.listDrivers, { subcontractorId: subcontractorIdFilter }) || [];

  if (!route) {
    return <div className={`p-4 ${isDayMode ? "text-gray-500" : "text-gray-400"}`}>Loading route...</div>;
  }

  return (
    <EditRouteFormInner
      route={route}
      appSettings={appSettings}
      routeId={routeId}
      token={token}
      user={user}
      trucks={trucks}
      trailers={trailers}
      drivers={drivers}
      subcontractors={subcontractors}
      isFleetMode={isFleetMode}
      selectedSubId={selectedSubId}
      onFleetModeChange={setIsFleetMode}
      onSubIdChange={setSelectedSubId}
      onSuccess={onSuccess}
      onCancel={onCancel}
      isDayMode={isDayMode}
    />
  );
}

type EditRouteFormInnerProps = {
  route: any;
  appSettings: any;
  routeId: Id<"dailyRoutes">;
  token: string | null;
  user: { role: "admin" | "regional"; region: "garden_route" | "eastern_cape" | null } | null;
  trucks: any[];
  trailers: any[];
  drivers: any[];
  subcontractors: any[];
  isFleetMode: boolean;
  selectedSubId: string;
  onFleetModeChange: (v: boolean) => void;
  onSubIdChange: (v: string) => void;
  onSuccess: () => void;
  onCancel: () => void;
  isDayMode?: boolean;
};

function EditRouteFormInner({
  route,
  appSettings,
  routeId,
  token,
  user,
  trucks,
  trailers,
  drivers,
  subcontractors,
  isFleetMode,
  selectedSubId,
  onFleetModeChange,
  onSubIdChange,
  onSuccess,
  onCancel,
  isDayMode = true,
}: EditRouteFormInnerProps) {
  const panelTheme = {
    bg: {
        primary: "bg-[var(--card-bg)]",
        secondary: "bg-[var(--card-bg)]/80",
    },
    text: {
        primary: "text-[var(--foreground)]",
        secondary: "text-[var(--nav-text-color)]",
        tertiary: "text-[var(--nav-text-color)]/80",
    },
    border: "border-[var(--card-border)]",
    input: "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground)] focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]",
  };

  // --- Mutations ---
  const { addToast } = useToast();
  const updateRoute = useMutation(api.dailyRoutes.updateDailyRoute);

  // --- Form State ---
  const [routeDate, setRouteDate] = useState(route.routeDate ?? "");
  const [truckFleetNo, setTruckFleetNo] = useState(
    route.truckFleetNo?.toString() ?? route.truckFleetNoStr ?? ""
  );
  const [trailer, setTrailer] = useState(
    route.trailerFleetNoStr ?? route.trailerFleetNo?.toString() ?? ""
  );
  const [driver, setDriver] = useState(route.driverName ?? "");
  const [notes, setNotes] = useState(route.notes ?? "");
  const [region, setRegion] = useState<string>(
    (route as any).region ?? (user?.role === "regional" ? (user.region ?? "garden_route") : "garden_route")
  );
  const [routeKilometers, setRouteKilometers] = useState(
    route.routeKilometers?.toString() ?? ""
  );

  // --- Settings defaults ---
  const [showSubMargin, setShowSubMargin] = useState(true);
  const [settingsDefaultsApplied, setSettingsDefaultsApplied] = useState(false);

  // Apply sub defaults from settings to draft load
  useEffect(() => {
    if (appSettings && !settingsDefaultsApplied) {
      const settings = appSettings as any;
      const subRateType = settings.defaultSubRateType;
      const showMargin = settings.showSubMarginOnCards;
      if (subRateType) {
        setDraftLoad(prev => ({
          ...prev,
          subcontractorRateType: subRateType as "per_unit" | "flat",
        }));
      }
      if (showMargin !== undefined) {
        setShowSubMargin(showMargin);
      }
      setSettingsDefaultsApplied(true);
    }
  }, [appSettings, settingsDefaultsApplied]);

  // Sync subcontractor mode from existing route on mount
  useEffect(() => {
    const subId = (route as any).subcontractorId as string | undefined;
    if (subId) {
      onFleetModeChange(false);
      onSubIdChange(subId);
    } else {
      onFleetModeChange(true);
      onSubIdChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialLoads: Load[] = (route.loads ?? []).map((l: any, index: number) => ({
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

  const [loads, setLoads] = useState<Load[]>(initialLoads);
  
  // --- Draft State ---
  const [draftLoad, setDraftLoad] = useState({
    clientName: "",
    fromLocations: [""] as string[],
    toLocations: [""] as string[],
    quantity: "",
    quantityType: "tons",
    rate: "",
    rateType: "per_unit",
    subcontractorRate: "",
    subcontractorRateType: "per_unit",
  });

  // --- Inline Editing State ---
  const [editingLoadId, setEditingLoadId] = useState<string | null>(null);
  const [editingLoadState, setEditingLoadState] = useState<Load | null>(null);

  // --- Load Handlers ---
  const addLocationField = (type: "from" | "to") => {
    setDraftLoad((prev) => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: [
        ...prev[type === "from" ? "fromLocations" : "toLocations"],
        "",
      ],
    }));
  };

  const updateDraftLocation = (type: "from" | "to", index: number, value: string) => {
    setDraftLoad((prev) => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: prev[
        type === "from" ? "fromLocations" : "toLocations"
      ].map((loc, i) => (i === index ? value : loc)),
    }));
  };

  const removeLocationField = (type: "from" | "to", index: number) => {
    setDraftLoad((prev) => ({
      ...prev,
      [type === "from" ? "fromLocations" : "toLocations"]: prev[
        type === "from" ? "fromLocations" : "toLocations"
      ].filter((_, i) => i !== index),
    }));
  };

  const handleAddLoad = () => {
    const cleanFrom = draftLoad.fromLocations.filter((l) => l.trim() !== "");
    const cleanTo = draftLoad.toLocations.filter((l) => l.trim() !== "");

    if (!draftLoad.clientName) return addToast("Client name is required", "error");
    if (cleanFrom.length === 0) return addToast("At least one Pickup location is required", "error");
    if (cleanTo.length === 0) return addToast("At least one Drop location is required", "error");

    const newLoad: Load = {
      id: crypto.randomUUID(),
      clientName: draftLoad.clientName,
      fromLocations: cleanFrom,
      toLocations: cleanTo,
      quantity: draftLoad.quantity,
      quantityType: draftLoad.quantityType,
      rate: draftLoad.rate,
      rateType: draftLoad.rateType as "per_unit" | "flat",
      sequence: loads.length + 1,
    };

    // Include subcontractor rate when in sub mode
    if (!isFleetMode) {
      newLoad.subcontractorRate = draftLoad.subcontractorRate;
      newLoad.subcontractorRateType = draftLoad.subcontractorRateType as "per_unit" | "flat";
    }

    setLoads([...loads, newLoad]);
    // Reset draft, using settings default for sub rate type if available
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

  const handleRemoveLoad = (id: string) => {
    setLoads(
      loads
        .filter((l) => l.id !== id)
        .map((l, idx) => ({ ...l, sequence: idx + 1 }))
    );
  };

  // --- Inline Edit Handlers ---
  const handleEditLoad = (load: Load) => {
    setEditingLoadId(load.id);
    setEditingLoadState({ ...load });
  };

  const handleCancelEdit = () => {
    setEditingLoadId(null);
    setEditingLoadState(null);
  };

  const addEditLocationField = (type: "from" | "to") => {
    if (!editingLoadState) return;
    setEditingLoadState({
      ...editingLoadState,
      [type === "from" ? "fromLocations" : "toLocations"]: [
        ...editingLoadState[type === "from" ? "fromLocations" : "toLocations"],
        "",
      ],
    });
  };

  const updateEditLocation = (type: "from" | "to", index: number, value: string) => {
    if (!editingLoadState) return;
    setEditingLoadState({
      ...editingLoadState,
      [type === "from" ? "fromLocations" : "toLocations"]: editingLoadState[
        type === "from" ? "fromLocations" : "toLocations"
      ].map((loc, i) => (i === index ? value : loc)),
    });
  };

  const removeEditLocationField = (type: "from" | "to", index: number) => {
    if (!editingLoadState) return;
    setEditingLoadState({
      ...editingLoadState,
      [type === "from" ? "fromLocations" : "toLocations"]: editingLoadState[
        type === "from" ? "fromLocations" : "toLocations"
      ].filter((_, i) => i !== index),
    });
  };

  const handleSaveEdit = () => {
    if (!editingLoadState) return;
    if (editingLoadState.fromLocations.length === 0 || editingLoadState.fromLocations[0] === "") {
        addToast("At least one Pickup location is required", "error");
        return;
    }
    setLoads(loads.map((l) => (l.id === editingLoadId ? editingLoadState : l)));
    setEditingLoadId(null);
    setEditingLoadState(null);
  };



  // --- Totals Calculation ---
  const calculateTotals = () => {
    const totalRevenue = loads.reduce(
      (sum, l) => sum + calculateLoadAmount(parseFloat(l.quantity) || 0, parseFloat(l.rate) || 0, l.rateType),
      0
    );
    const rKm = parseFloat(routeKilometers) || 0;
    const maxLKm = loads.reduce((max, l) => Math.max(max, l.kilometers || 0), 0);
    const totalKm = rKm > 0 ? rKm : maxLKm;

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

    return { quantityDisplay, totalRevenue, totalKm };
  };

  const totals = calculateTotals();

  // --- Save Handler ---
  const handleSave = async () => {
    if (!routeDate || !truckFleetNo || !driver) {
      return addToast("Missing required fields: Date, Truck, or Driver", "error");
    }

    try {
      const modeSubId = isFleetMode ? undefined : (selectedSubId || undefined) as Id<"subcontractors"> | undefined;

      const schemaLoads = loads.map((l) => ({
        client: l.clientName,
        quantity: l.quantity.toString(),
        quantityType: l.quantityType,
        rate: l.rate.toString(),
        rateType: l.rateType,
        fromLocations: l.fromLocations,
        toLocations: l.toLocations,
        kilometers: l.kilometers,
        subcontractorRate: l.subcontractorRate,
        subcontractorRateType: l.subcontractorRateType,
      }));

      await updateRoute({
        id: routeId,
        routeDate: routeDate,
        truckFleetNoStr: truckFleetNo.toString(),
        driverName: driver,
        trailerFleetNoStr: trailer || undefined,
        subcontractorId: modeSubId,
        notes: notes || undefined,
        kilometers: totals.totalKm,
        routeKilometers: parseFloat(routeKilometers) || undefined,
        region: region as "garden_route" | "eastern_cape",
        token,
        loads: schemaLoads,
      });

      addToast("Route updated successfully!", "success");
      onSuccess();
    } catch (err) {
      console.error("Failed to save:", err);
      addToast("Failed to save route.", "error");
    }
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className={`${panelTheme.bg.primary} ${panelTheme.border} border rounded-lg shadow-sm p-6 space-y-8 max-w-5xl mx-auto`}>
      {/* Top Controls */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleCancel}
          className={`px-4 py-2 text-sm font-medium ${panelTheme.text.secondary} ${panelTheme.bg.primary} border ${panelTheme.border} rounded-md hover:${panelTheme.bg.secondary}`}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] rounded-md hover:opacity-90 shadow-sm"
        >
          Save Changes
        </button>
      </div>

      {/* Fleet / Subcontractor Toggle */}
      <div className="flex items-center gap-4 mb-4">
        <span className={`text-sm font-medium ${panelTheme.text.secondary}`}>Mode:</span>
        <button
          type="button"
          onClick={() => onFleetModeChange(true)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
            isFleetMode
              ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
              : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border border-[var(--card-border)]"
          }`}
        >
          Fleet
        </button>
        <button
          type="button"
          onClick={() => onFleetModeChange(false)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
            !isFleetMode
              ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
              : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border border-[var(--card-border)]"
          }`}
        >
          Subcontractor
        </button>
      </div>

      {/* Subcontractor dropdown */}
      {!isFleetMode && (
        <div className="mb-4">
          <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Subcontractor</label>
          <select
            value={selectedSubId}
            onChange={(e) => onSubIdChange(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
          >
            <option value="">Select Subcontractor...</option>
            {subcontractors
              .filter((s: any) => s.status !== "inactive")
              .map((s: any) => (
                <option key={s._id} value={s._id}>
                  {s.companyName}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Main Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Date</label>
          <input
            type="date"
            value={routeDate}
            onChange={(e) => setRouteDate(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
          />
        </div>
        <div>
          <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Truck</label>
          <select
            value={truckFleetNo}
            onChange={(e) => setTruckFleetNo(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
          >
            <option value="">Select truck...</option>
            {trucks.map((t: any) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Trailer</label>
          <select
            value={trailer}
            onChange={(e) => setTrailer(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
          >
            <option value="">Select trailer...</option>
            {trailers.map((t: any) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Driver</label>
          <select
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
          >
            <option value="">Select driver...</option>
            {drivers.map((d: any) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Region</label>
          <select
            value={region}
            disabled={user?.role === "regional"}
            onChange={(e) => setRegion(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input} disabled:opacity-60`}
          >
            <option value="garden_route">Garden Route</option>
            <option value="eastern_cape">Eastern Cape</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
        />
      </div>

      {/* Route KM */}
      <div>
        <label className={`block text-sm font-medium ${panelTheme.text.secondary} mb-1`}>
          Route KM
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={routeKilometers}
            onChange={(e) => setRouteKilometers(e.target.value)}
            className={`w-full rounded-md shadow-sm p-2 border ${panelTheme.input}`}
            placeholder="Total trip distance..."
          />
          <span className={`${panelTheme.text.tertiary} text-sm font-medium`}>km</span>
        </div>
        <p className={`mt-1 text-xs ${panelTheme.text.tertiary}`}>
          Total trip distance (enter once per route — do not split per load)
        </p>
      </div>

      <hr className={panelTheme.border} />

      {/* Loads Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-semibold ${panelTheme.text.primary}`}>Loads</h2>
          <div className={`text-sm ${panelTheme.text.secondary}`}>
            Qty: <span className={`font-medium ${panelTheme.text.primary}`}>{totals.quantityDisplay}</span> | 
            Rev: <span className={`font-medium ${panelTheme.text.primary}`}>{formatZAR(totals.totalRevenue)}</span>
          </div>
        </div>

        {/* List of Loads */}
        <div className={`border rounded-lg overflow-hidden ${panelTheme.border}`}>
          {loads.length === 0 ? (
             <div className={`p-4 text-center text-sm ${panelTheme.text.tertiary}`}>No loads. Add one below.</div>
          ) : (
            <div className={`divide-y divide-[var(--card-border)]`}>
              {loads.map((load) => (
                <div key={load.id} className={`p-4 hover:${panelTheme.bg.secondary}`}>
                  {editingLoadId === load.id && editingLoadState ? (
                    // Inline Edit Form
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                           placeholder="Client"
                           value={editingLoadState.clientName}
                           onChange={e => setEditingLoadState({...editingLoadState, clientName: e.target.value})}
                           className={`rounded p-2 text-sm border ${panelTheme.input}`}
                        />
                         <div className="flex gap-2">
                           <input
                             placeholder="Qty"
                             type="number"
                             value={editingLoadState.quantity}
                             onChange={e => setEditingLoadState({...editingLoadState, quantity: e.target.value})}
                             className={`rounded p-2 text-sm w-20 border ${panelTheme.input}`}
                           />
                           <select
                              value={editingLoadState.quantityType}
                              onChange={e => setEditingLoadState({...editingLoadState, quantityType: e.target.value})}
                              className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
                           >
                              {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                           </select>
                         </div>
                      </div>
                      
                      {/* Rate and KM Row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex gap-2">
                           <input
                             placeholder="Rate"
                             type="number"
                             value={editingLoadState.rate}
                             onChange={e => setEditingLoadState({...editingLoadState, rate: e.target.value})}
                             className={`rounded p-2 text-sm w-24 border ${panelTheme.input}`}
                           />
                           <select
                              value={editingLoadState.rateType}
                              onChange={e => setEditingLoadState({...editingLoadState, rateType: e.target.value as "per_unit" | "flat"})}
                              className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
                           >
                              <option value="per_unit">/ Unit</option>
                              <option value="flat">Flat</option>
                           </select>
                        </div>
                      </div>
                      
                      {/* Subcontractor Rate (only in sub mode) */}
                      {!isFleetMode && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex gap-2">
                            <input
                              placeholder="Sub Rate"
                              type="number"
                              value={editingLoadState.subcontractorRate || ""}
                              onChange={e => setEditingLoadState({...editingLoadState, subcontractorRate: e.target.value})}
                              className={`rounded p-2 text-sm w-24 border border-orange-300 dark:border-orange-700/50 ${panelTheme.input}`}
                            />
                            <select
                              value={editingLoadState.subcontractorRateType || "per_unit"}
                              onChange={e => setEditingLoadState({...editingLoadState, subcontractorRateType: e.target.value as "per_unit" | "flat"})}
                              className={`rounded p-2 text-sm flex-1 border border-orange-300 dark:border-orange-700/50 ${panelTheme.input}`}
                            >
                              <option value="per_unit">/ Unit</option>
                              <option value="flat">Flat</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* From Locations */}
                        <div className="space-y-2">
                          <label className={`text-xs font-medium ${panelTheme.text.tertiary}`}>Pickups</label>
                          {editingLoadState.fromLocations.map((loc, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                placeholder="Pickup Location"
                                value={loc}
                                onChange={(e) => updateEditLocation("from", idx, e.target.value)}
                                className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
                              />
                              {editingLoadState.fromLocations.length > 1 && (
                                <button onClick={() => removeEditLocationField("from", idx)} className="text-red-500 px-2">×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addEditLocationField("from")} className="text-xs text-blue-500 hover:text-blue-400 hover:underline">+ Add Pickup</button>
                        </div>

                        {/* To Locations */}
                        <div className="space-y-2">
                          <label className={`text-xs font-medium ${panelTheme.text.tertiary}`}>Drops</label>
                          {editingLoadState.toLocations.map((loc, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                placeholder="Drop Location"
                                value={loc}
                                onChange={(e) => updateEditLocation("to", idx, e.target.value)}
                                className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
                              />
                              {editingLoadState.toLocations.length > 1 && (
                                <button onClick={() => removeEditLocationField("to", idx)} className="text-red-500 px-2">×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addEditLocationField("to")} className="text-xs text-blue-500 hover:text-blue-400 hover:underline">+ Add Drop</button>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={handleCancelEdit} className={`text-xs ${panelTheme.text.tertiary} hover:${panelTheme.text.primary} underline`}>Cancel</button>
                        <button onClick={handleSaveEdit} className="text-xs text-emerald-500 hover:text-emerald-400 font-bold">Save</button>
                      </div>
                    </div>
                  ) : (
                    // Display Mode
                    <div className="flex justify-between items-start">
                      <div>
                        <div className={`font-medium text-sm ${panelTheme.text.primary}`}>#{load.sequence} {load.clientName}</div>
                        <div className={`text-xs ${panelTheme.text.tertiary}`}>
                          {load.fromLocations.join(", ")} → {load.toLocations.join(", ")}
                        </div>
                        <div className={`text-xs ${panelTheme.text.tertiary} mt-1`}>
                           <span className={panelTheme.text.secondary}>{load.quantity} {load.quantityType}</span> @ <span className="font-semibold">{formatZAR(parseFloat(load.rate) || 0)}</span> ({load.rateType})
                        </div>
                        {!isFleetMode && load.subcontractorRate && showSubMargin && (
                          <div className={`text-xs mt-1 space-x-2`}>
                            <span className="text-orange-500">Sub: {formatZAR(calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.subcontractorRate) || 0, load.subcontractorRateType || "per_unit"))}</span>
                            <span className="text-emerald-500">
                              Margin: {formatZAR(calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.rate) || 0, load.rateType) - calculateLoadAmount(parseFloat(load.quantity) || 0, parseFloat(load.subcontractorRate) || 0, load.subcontractorRateType || "per_unit"))}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditLoad(load)} className="text-blue-500 hover:text-blue-400 text-xs hover:underline">Edit</button>
                        <button onClick={() => handleRemoveLoad(load.id)} className="text-red-500 hover:text-red-400 text-xs hover:underline">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Load Form */}
        <div className={`p-4 rounded-lg border space-y-3 ${panelTheme.bg.secondary} ${panelTheme.border}`}>
          <h3 className={`text-sm font-medium ${panelTheme.text.primary}`}>Add New Load</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              placeholder="Client Name"
              value={draftLoad.clientName}
              onChange={(e) => setDraftLoad({ ...draftLoad, clientName: e.target.value })}
              className={`rounded p-2 text-sm border ${panelTheme.input}`}
            />
            <div className="flex gap-2">
               <input
                 type="number"
                 placeholder="Quantity"
                 value={draftLoad.quantity}
                 onChange={(e) => setDraftLoad({ ...draftLoad, quantity: e.target.value })}
                 className={`rounded p-2 text-sm w-24 border ${panelTheme.input}`}
               />
               <select
                 value={draftLoad.quantityType}
                 onChange={(e) => setDraftLoad({ ...draftLoad, quantityType: e.target.value })}
                 className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
               >
                 {unitOptions.map((o) => (
                   <option key={o.value} value={o.value}>{o.label}</option>
                 ))}
               </select>
            </div>
            
            {/* Dynamic Locations: From */}
            <div className="space-y-2">
              <label className={`text-xs font-medium ${panelTheme.text.tertiary}`}>Pickups</label>
              {draftLoad.fromLocations.map((loc, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Pickup Location"
                    value={loc}
                    onChange={(e) => updateDraftLocation("from", idx, e.target.value)}
                    className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
                  />
                  {draftLoad.fromLocations.length > 1 && (
                    <button onClick={() => removeLocationField("from", idx)} className="text-red-500 px-2">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => addLocationField("from")} className="text-xs text-blue-500 hover:text-blue-400 hover:underline">+ Add Pickup</button>
            </div>

            {/* Dynamic Locations: To */}
             <div className="space-y-2">
              <label className={`text-xs font-medium ${panelTheme.text.tertiary}`}>Drops</label>
              {draftLoad.toLocations.map((loc, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Drop Location"
                    value={loc}
                    onChange={(e) => updateDraftLocation("to", idx, e.target.value)}
                    className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
                  />
                  {draftLoad.toLocations.length > 1 && (
                    <button onClick={() => removeLocationField("to", idx)} className="text-red-500 px-2">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => addLocationField("to")} className="text-xs text-blue-500 hover:text-blue-400 hover:underline">+ Add Drop</button>
            </div>

            <div className="flex gap-2">
               <input
                 type="number"
                 placeholder="Rate"
                 value={draftLoad.rate}
                 onChange={(e) => setDraftLoad({ ...draftLoad, rate: e.target.value })}
                 className={`rounded p-2 text-sm flex-1 border ${panelTheme.input}`}
               />
               <select
                 value={draftLoad.rateType}
                 onChange={(e) => setDraftLoad({ ...draftLoad, rateType: e.target.value as any })}
                 className={`rounded p-2 text-sm w-32 border ${panelTheme.input}`}
               >
                 {rateTypeOptions.map((o) => (
                   <option key={o.value} value={o.value}>{o.label}</option>
                 ))}
               </select>
            </div>
          </div>
          <button
            onClick={handleAddLoad}
            className={`w-full py-2 rounded text-sm transition-colors bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm`}
          >
            Add Load
          </button>
        </div>
      </div>

      <hr className={panelTheme.border} />

      {/* Legs Section REMOVED */}
      
      {/* Bottom Actions */}
      <div className="flex justify-end gap-3 pt-6">
        <button
          onClick={handleCancel}
          className={`px-6 py-2 font-medium ${panelTheme.text.secondary} ${panelTheme.bg.primary} border ${panelTheme.border} rounded-md hover:${panelTheme.bg.secondary}`}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-6 py-2 font-medium text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] rounded-md hover:opacity-90 shadow-sm"
        >
          Save Route
        </button>
      </div>
    </div>
  );
}
