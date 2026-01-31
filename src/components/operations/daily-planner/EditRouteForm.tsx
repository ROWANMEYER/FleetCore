"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateLoadAmount } from "../../../../convex/utils";

// --- Types ---
interface EditRouteFormProps {
  routeId: Id<"dailyRoutes">;
  onSuccess: () => void;
  onCancel: () => void;
}

type Load = {
  id: string; // Frontend-only ID for React keys
  clientName: string;
  fromLocations: string[];
  toLocations: string[];
  quantity: number;
  quantityType: string;
  rate: number;
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

export default function EditRouteForm({ routeId, onSuccess, onCancel }: EditRouteFormProps) {
  // --- Queries ---
  const route = useQuery(api.dailyRoutes.getById, { id: routeId });
  const trucks = useQuery(api.fleet.listTrucks) || [];
  const trailers = useQuery(api.fleet.listTrailers) || [];
  const drivers = useQuery(api.fleet.listDrivers) || [];

  // --- Mutations ---
  const updateRoute = useMutation(api.dailyRoutes.updateDailyRoute);

  // --- Form State ---
  const [routeDate, setRouteDate] = useState("");
  const [truck, setTruck] = useState("");
  const [trailer, setTrailer] = useState("");
  const [driver, setDriver] = useState("");
  const [notes, setNotes] = useState("");
  const [routeKilometers, setRouteKilometers] = useState("");

  const [loads, setLoads] = useState<Load[]>([]);
  
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

  // --- Initialization Effect ---
  useEffect(() => {
    if (!route) return;

    setRouteDate(route.routeDate ?? "");
    setTruck(route.truckFleetNoStr ?? route.truckFleetNo?.toString() ?? "");
    setTrailer(route.trailerFleetNoStr ?? route.trailerFleetNo?.toString() ?? "");
    setDriver(route.driverName ?? "");
    setNotes(route.notes ?? "");
    setRouteKilometers(route.routeKilometers?.toString() ?? "");

    // Map Loads
    if (route.loads) {
      const mappedLoads: Load[] = route.loads.map((l: any, index: number) => ({
        id: crypto.randomUUID(),
        clientName: l.client ?? "",
        fromLocations: l.fromLocations ?? [],
        toLocations: l.toLocations ?? [],
        quantity: Number(l.quantity) || 0,
        quantityType: l.quantityType || "tons",
        rate: Number(l.rate) || 0,
        rateType: l.rateType === "flat" ? "flat" : "per_unit",
        sequence: index + 1,
        kilometers: l.kilometers || 0,
      }));
      setLoads(mappedLoads);
    }
  }, [route]);

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
      quantity: parseFloat(draftLoad.quantity) || 0,
      quantityType: draftLoad.quantityType,
      rate: parseFloat(draftLoad.rate) || 0,
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
      (sum, l) => sum + calculateLoadAmount(l.quantity, l.rate, l.rateType),
      0
    );
    // Effective KM: Route KM > Max Load KM
    const rKm = parseFloat(routeKilometers) || 0;
    const maxLKm = loads.reduce((max, l) => Math.max(max, l.kilometers || 0), 0);
    const totalKm = rKm > 0 ? rKm : maxLKm;
    
    const uniqueUnits = Array.from(new Set(loads.map((l) => l.quantityType)));
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

    return { quantityDisplay, totalRevenue, totalKm };
  };

  const totals = calculateTotals();

  // --- Save Handler ---
  const handleSave = async () => {
    if (!routeDate || !truck || !driver) {
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
        truckFleetNoStr: truck,
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

  if (!route) {
    return <div className="p-4 text-gray-500">Loading route...</div>;
  }

  return (
    <div className="bg-white border rounded-lg shadow-sm p-6 space-y-8 max-w-5xl mx-auto">
      {/* Top Controls */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={routeDate}
            onChange={(e) => setRouteDate(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm p-2 border"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Truck</label>
          <select
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm p-2 border"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Trailer</label>
          <select
            value={trailer}
            onChange={(e) => setTrailer(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm p-2 border"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
          <select
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm p-2 border"
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border-gray-300 shadow-sm p-2 border"
        />
      </div>

      {/* Route KM */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Route KM
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={routeKilometers}
            onChange={(e) => setRouteKilometers(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm p-2 border"
            placeholder="Total trip distance..."
          />
          <span className="text-gray-500 text-sm font-medium">km</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Total trip distance (enter once per route — do not split per load)
        </p>
      </div>

      <hr />

      {/* Loads Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Loads</h2>
          <div className="text-sm text-gray-500">
            Qty: <span className="font-medium text-black">{totals.quantityDisplay}</span> | 
            Rev: <span className="font-medium text-black">{formatZAR(totals.totalRevenue)}</span>
          </div>
        </div>

        {/* List of Loads */}
        <div className="border rounded-lg overflow-hidden">
          {loads.length === 0 ? (
             <div className="p-4 text-center text-sm text-gray-500">No loads. Add one below.</div>
          ) : (
            <div className="divide-y">
              {loads.map((load) => (
                <div key={load.id} className="p-4 hover:bg-gray-50">
                  {editingLoadId === load.id && editingLoadState ? (
                    // Inline Edit Form
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                           placeholder="Client"
                           value={editingLoadState.clientName}
                           onChange={e => setEditingLoadState({...editingLoadState, clientName: e.target.value})}
                           className="border rounded p-1 text-sm"
                        />
                         <div className="flex gap-2">
                           <input
                             placeholder="Qty"
                             type="number"
                             value={editingLoadState.quantity}
                             onChange={e => setEditingLoadState({...editingLoadState, quantity: parseFloat(e.target.value) || 0})}
                             className="border rounded p-1 text-sm w-20"
                           />
                           <select
                              value={editingLoadState.quantityType}
                              onChange={e => setEditingLoadState({...editingLoadState, quantityType: e.target.value})}
                              className="border rounded p-1 text-sm flex-1"
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
                             onChange={e => setEditingLoadState({...editingLoadState, rate: parseFloat(e.target.value) || 0})}
                             className="border rounded p-1 text-sm w-24"
                           />
                           <select
                              value={editingLoadState.rateType}
                              onChange={e => setEditingLoadState({...editingLoadState, rateType: e.target.value as "per_unit" | "flat"})}
                              className="border rounded p-1 text-sm flex-1"
                           >
                              <option value="per_unit">/ Unit</option>
                              <option value="flat">Flat</option>
                           </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* From Locations */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-gray-500">Pickups</label>
                          {editingLoadState.fromLocations.map((loc, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                placeholder="Pickup Location"
                                value={loc}
                                onChange={(e) => updateEditLocation("from", idx, e.target.value)}
                                className="border rounded p-1 text-sm flex-1"
                              />
                              {editingLoadState.fromLocations.length > 1 && (
                                <button onClick={() => removeEditLocationField("from", idx)} className="text-red-500 px-2">×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addEditLocationField("from")} className="text-xs text-blue-600 hover:underline">+ Add Pickup</button>
                        </div>

                        {/* To Locations */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-gray-500">Drops</label>
                          {editingLoadState.toLocations.map((loc, idx) => (
                            <div key={idx} className="flex gap-2">
                              <input
                                placeholder="Drop Location"
                                value={loc}
                                onChange={(e) => updateEditLocation("to", idx, e.target.value)}
                                className="border rounded p-1 text-sm flex-1"
                              />
                              {editingLoadState.toLocations.length > 1 && (
                                <button onClick={() => removeEditLocationField("to", idx)} className="text-red-500 px-2">×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addEditLocationField("to")} className="text-xs text-blue-600 hover:underline">+ Add Drop</button>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={handleCancelEdit} className="text-xs text-gray-500 underline">Cancel</button>
                        <button onClick={handleSaveEdit} className="text-xs text-green-600 font-bold">Save</button>
                      </div>
                    </div>
                  ) : (
                    // Display Mode
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">#{load.sequence} {load.clientName}</div>
                        <div className="text-xs text-gray-500">
                          {load.fromLocations.join(", ")} → {load.toLocations.join(", ")}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                           {load.quantity} {load.quantityType} @ {formatZAR(load.rate)} ({load.rateType})
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditLoad(load)} className="text-blue-600 text-xs hover:underline">Edit</button>
                        <button onClick={() => handleRemoveLoad(load.id)} className="text-red-600 text-xs hover:underline">Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Load Form */}
        <div className="bg-gray-50 p-4 rounded-lg border space-y-3">
          <h3 className="text-sm font-medium">Add New Load</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              placeholder="Client Name"
              value={draftLoad.clientName}
              onChange={(e) => setDraftLoad({ ...draftLoad, clientName: e.target.value })}
              className="border rounded p-2 text-sm"
            />
            <div className="flex gap-2">
               <input
                 type="number"
                 placeholder="Quantity"
                 value={draftLoad.quantity}
                 onChange={(e) => setDraftLoad({ ...draftLoad, quantity: e.target.value })}
                 className="border rounded p-2 text-sm w-24"
               />
               <select
                 value={draftLoad.quantityType}
                 onChange={(e) => setDraftLoad({ ...draftLoad, quantityType: e.target.value })}
                 className="border rounded p-2 text-sm flex-1"
               >
                 {unitOptions.map((o) => (
                   <option key={o.value} value={o.value}>{o.label}</option>
                 ))}
               </select>
            </div>
            
            {/* Dynamic Locations: From */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500">Pickups</label>
              {draftLoad.fromLocations.map((loc, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Pickup Location"
                    value={loc}
                    onChange={(e) => updateDraftLocation("from", idx, e.target.value)}
                    className="border rounded p-2 text-sm flex-1"
                  />
                  {draftLoad.fromLocations.length > 1 && (
                    <button onClick={() => removeLocationField("from", idx)} className="text-red-500 px-2">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => addLocationField("from")} className="text-xs text-blue-600 hover:underline">+ Add Pickup</button>
            </div>

            {/* Dynamic Locations: To */}
             <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500">Drops</label>
              {draftLoad.toLocations.map((loc, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    placeholder="Drop Location"
                    value={loc}
                    onChange={(e) => updateDraftLocation("to", idx, e.target.value)}
                    className="border rounded p-2 text-sm flex-1"
                  />
                  {draftLoad.toLocations.length > 1 && (
                    <button onClick={() => removeLocationField("to", idx)} className="text-red-500 px-2">×</button>
                  )}
                </div>
              ))}
              <button onClick={() => addLocationField("to")} className="text-xs text-blue-600 hover:underline">+ Add Drop</button>
            </div>

            <div className="flex gap-2">
               <input
                 type="number"
                 placeholder="Rate"
                 value={draftLoad.rate}
                 onChange={(e) => setDraftLoad({ ...draftLoad, rate: e.target.value })}
                 className="border rounded p-2 text-sm flex-1"
               />
               <select
                 value={draftLoad.rateType}
                 onChange={(e) => setDraftLoad({ ...draftLoad, rateType: e.target.value as any })}
                 className="border rounded p-2 text-sm w-32"
               >
                 {rateTypeOptions.map((o) => (
                   <option key={o.value} value={o.value}>{o.label}</option>
                 ))}
               </select>
            </div>
          </div>
          <button
            onClick={handleAddLoad}
            className="w-full py-2 bg-gray-900 text-white rounded text-sm hover:bg-black"
          >
            Add Load
          </button>
        </div>
      </div>

      <hr />

      {/* Legs Section REMOVED */}
      
      {/* Bottom Actions */}
      <div className="flex justify-end gap-3 pt-6">
        <button
          onClick={handleCancel}
          className="px-6 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
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
