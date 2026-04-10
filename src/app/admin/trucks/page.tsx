"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type SortDir = "asc" | "desc";

export default function AdminTrucksPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"truckFleetNo" | "registration" | "make" | "model">("truckFleetNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [includeInactive, setIncludeInactive] = useState(true);

  const trucks = useQuery(api.fleet.getTrucks, { search, sortBy, sortDir, includeInactive }) || [];
  const stats = useQuery(api.fleet.getTruckStats) || { total: 0, active: 0, inactive: 0 };

  const createTruck = useMutation(api.fleet.createTruck);
  const updateTruck = useMutation(api.fleet.updateTruck);
  const deleteTruck = useMutation(api.fleet.deleteTruck);
  const updateTruckStatus = useMutation(api.fleet.updateTruckStatus);

  const [newTruck, setNewTruck] = useState({
    truckFleetNo: "",
    registration: "",
    make: "",
    model: "",
    status: "active",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<any | null>(null);

  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(null), 2500);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const toggleStatus = async (t: any) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = t.status === "inactive" ? "active" : "inactive";
      await updateTruckStatus({ id: t._id as Id<"trucks">, status: newStatus });
      setSuccessMsg(`Truck ${newStatus === "inactive" ? "deactivated" : "activated"}`);
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const handleCreate = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (!newTruck.truckFleetNo || !newTruck.registration || !newTruck.make || !newTruck.model) {
        setErrorMsg("All fields are required");
        return;
      }
      await createTruck(newTruck);
      setNewTruck({ truckFleetNo: "", registration: "", make: "", model: "", status: "active" });
      setSuccessMsg("Truck created");
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const startEdit = (t: any) => {
    setEditingId(t._id as string);
    setEditingState({ ...t });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingState(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editingState) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateTruck({ id: editingId as Id<"trucks">, patch: {
        truckFleetNo: editingState.truckFleetNo,
        registration: editingState.registration,
        make: editingState.make,
        model: editingState.model,
      } });
      setSuccessMsg("Truck updated");
      cancelEdit();
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const removeTruck = async (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const ok = confirm("Delete this truck? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteTruck({ id: id as Id<"trucks"> });
      setSuccessMsg("Truck deleted");
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  return (
    <div className="w-full h-full p-6 space-y-6 overflow-y-auto">
      <div>
        <h1 className="text-xl font-bold">Admin — Trucks</h1>
        <p className="text-xs text-gray-500">Manage truck master data. Changes apply system-wide.</p>
      </div>

      <div className="flex gap-4">
        <div className="bg-slate-50 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Total Trucks</div>
          <div className="text-2xl font-bold text-slate-600">{stats.total}</div>
        </div>
        <div className="bg-green-50 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-green-600/80 mb-0.5">Active</div>
          <div className="text-2xl font-bold text-green-700">{stats.active}</div>
        </div>
        <div className="bg-gray-100/50 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Inactive</div>
          <div className="text-2xl font-bold text-gray-500">{stats.inactive}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fleet no, registration, make, model"
          className="border rounded px-2 py-1 text-sm w-80"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive
        </label>
      </div>

      {errorMsg && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{errorMsg}</div>}
      {successMsg && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">{successMsg}</div>}

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 bg-gray-50 px-3 py-2 border-b text-[10px] font-semibold text-gray-500 uppercase tracking-wider items-center">
          <div className="col-span-2 flex items-center gap-1">
            <button onClick={() => handleSort("truckFleetNo")} className="hover:text-black">Fleet No</button>
            <span className="text-blue-600">{sortBy === "truckFleetNo" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1 flex items-center gap-1">
            <button onClick={() => handleSort("registration")} className="hover:text-black">Registration</button>
            <span className="text-blue-600">{sortBy === "registration" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1 flex items-center gap-1">
            <button onClick={() => handleSort("make")} className="hover:text-black">Make</button>
            <span className="text-blue-600">{sortBy === "make" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1 flex items-center gap-1">
            <button onClick={() => handleSort("model")} className="hover:text-black">Model</button>
            <span className="text-blue-600">{sortBy === "model" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="divide-y divide-gray-200">
          {/* New row */}
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
            <input
              className="col-span-2 border rounded px-2 py-1"
              placeholder="Fleet No"
              value={newTruck.truckFleetNo}
              onChange={(e) => setNewTruck({ ...newTruck, truckFleetNo: e.target.value })}
            />
            <input
              className="col-span-1 border rounded px-2 py-1"
              placeholder="Registration"
              value={newTruck.registration}
              onChange={(e) => setNewTruck({ ...newTruck, registration: e.target.value })}
            />
            <input
              className="col-span-1 border rounded px-2 py-1"
              placeholder="Make"
              value={newTruck.make}
              onChange={(e) => setNewTruck({ ...newTruck, make: e.target.value })}
            />
            <input
              className="col-span-1 border rounded px-2 py-1"
              placeholder="Model"
              value={newTruck.model}
              onChange={(e) => setNewTruck({ ...newTruck, model: e.target.value })}
            />
            <div className="col-span-2 text-right">
              <button onClick={handleCreate} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Add</button>
            </div>
          </div>

          {trucks.map((t: any) => {
            console.log("TRUCK ROW", t);
            const isEditing = editingId === (t._id as string);
            return (
              <div key={t._id} className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
                {isEditing ? (
                  <>
                    <input className="col-span-2 border rounded px-2 py-1" value={editingState.truckFleetNo} onChange={(e) => setEditingState({ ...editingState, truckFleetNo: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.registration} onChange={(e) => setEditingState({ ...editingState, registration: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.make} onChange={(e) => setEditingState({ ...editingState, make: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.model} onChange={(e) => setEditingState({ ...editingState, model: e.target.value })} />
                    <div className="col-span-2 text-right space-x-2">
                      <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">Save</button>
                      <button onClick={cancelEdit} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2 font-medium text-gray-900">{t.truckFleetNo}</div>
                    <div className="col-span-1">{t.registration}</div>
                    <div className="col-span-1">{t.make}</div>
                    <div className="col-span-1">{t.model}</div>
                    <div className="col-span-1">
                      <span
                        className={
                          t.status === "inactive"
                            ? "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500"
                            : "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700"
                        }
                      >
                        {t.status === "inactive" ? "Inactive" : "Active"}
                      </span>
                    </div>
                    <div className="col-span-1 text-right space-x-3">
                      <button onClick={() => startEdit(t)} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Edit</button>
                      <button
                        onClick={() => toggleStatus(t)}
                        className="text-xs font-medium text-gray-600 hover:text-black hover:underline"
                      >
                        {t.status === "inactive" ? "Activate" : "Deactivate"}
                      </button>
                      <button onClick={() => removeTruck(t._id as string)} className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline">Delete</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
