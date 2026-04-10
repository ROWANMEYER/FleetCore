"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateLoadAmount } from "../../../../convex/utils";

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
  const route = useQuery(api.dailyRoutes.getById, { id: routeId });
  const trucks = useQuery(api.fleet.listTrucks) || [];
  const trailers = useQuery(api.fleet.listTrailers) || [];
  const drivers = useQuery(api.fleet.listDrivers) || [];

  if (!route) {
    return <div className={`p-4 ${isDayMode ? "text-gray-500" : "text-gray-400"}`}>Loading route...</div>;
  }

  return (
    <EditRouteFormInner
      route={route}
      routeId={routeId}
      trucks={trucks}
      trailers={trailers}
      drivers={drivers}
      onSuccess={onSuccess}
      onCancel={onCancel}
      isDayMode={isDayMode}
    />
  );
}

type EditRouteFormInnerProps = {
  route: any;
  routeId: Id<"dailyRoutes">;
  trucks: any[];
  trailers: any[];
  drivers: any[];
  onSuccess: () => void;
  onCancel: () => void;
  isDayMode?: boolean;
};

function EditRouteFormInner({
  route,
  routeId,
  trucks,
  trailers,
  drivers,
  onSuccess,
  onCancel,
  isDayMode = true,
}: EditRouteFormInnerProps) {
  const panelTheme = {
    bg: {
        primary: isDayMode ? "bg-white" : "bg-gray-950",
        secondary: isDayMode ? "bg-gray-50" : "bg-gray-900",
    },
    text: {
        primary: isDayMode ? "text-gray-900" : "text-white",
        secondary: isDayMode ? "text-gray-700" : "text-gray-300",
        tertiary: isDayMode ? "text-gray-500" : "text-gray-400",
    },
    border: isDayMode ? "border-gray-300" : "border-gray-700",
    input: isDayMode ? "bg-white border-gray-300 text-gray-900" : "bg-gray-900 border-gray-700 text-white focus:bg-gray-800",
  };

  // --- Mutations ---
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
  const [routeKilometers, setRouteKilometers] = useState(
    route.routeKilometers?.toString() ?? ""
  );

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

    if (!draftLoad.clientName) return alert("Client name is required");
    if (cleanFrom.length === 0) return alert("At least one Pickup location is required");
    if (cleanTo.length === 0) return alert("At least one Drop location is required");

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

    setLoads([...loads, newLoad]);
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
        alert("At least one Pickup location is required");
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
      return alert("Missing required fields: Date, Truck, or Driver");
    }

    try {
      const schemaLoads = loads.map((l) => ({
        client: l.clientName,
        quantity: l.quantity.toString(),
        quantityType: l.quantityType,
        rate: l.rate.toString(),
        rateType: l.rateType,
        fromLocations: l.fromLocations,
        toLocations: l.toLocations,
        kilometers: l.kilometers,
      }));

      await updateRoute({
        id: routeId,
        routeDate: routeDate,
        truckFleetNoStr: truckFleetNo.toString(),
        driverName: driver,
        trailerFleetNoStr: trailer || undefined,
        notes: notes || undefined,
        kilometers: totals.totalKm,
        routeKilometers: parseFloat(routeKilometers) || undefined,
        loads: schemaLoads,
      });

      alert("Route updated successfully!");
      onSuccess();
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Failed to save route.");
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
          className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800"
        >
          Save Changes
        </button>
      </div>

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
            <div className={`divide-y ${isDayMode ? "divide-gray-200" : "divide-gray-800"}`}>
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
            className={`w-full py-2 rounded text-sm transition-colors ${isDayMode ? "bg-gray-900 text-white hover:bg-black" : "bg-white text-gray-900 hover:bg-gray-100"}`}
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
          className="px-6 py-2 font-medium text-white bg-black rounded-md hover:bg-gray-800"
        >
          Save Route
        </button>
      </div>
    </div>
  );
}
