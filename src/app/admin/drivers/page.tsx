"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type SortDir = "asc" | "desc";

export default function AdminDriversPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"driverName" | "driverId" | "status">("driverName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [kpiFilter, setKpiFilter] = useState<"total" | "active" | "inactive">("total");

  const drivers = useQuery(api.fleet.getDrivers, { search, sortBy, sortDir, includeInactive }) || [];
  const filteredDrivers =
    kpiFilter === "total"
      ? drivers
      : drivers.filter((d: any) =>
          kpiFilter === "active" ? d.status !== "inactive" : d.status === "inactive"
        );
  const stats = useQuery(api.fleet.getDriverStats) || { total: 0, active: 0, inactive: 0 };

  const createDriver = useMutation(api.fleet.createDriver);
  const updateDriver = useMutation(api.fleet.updateDriver);
  const updateDriverStatus = useMutation(api.fleet.updateDriverStatus);
  const deleteDriver = useMutation(api.fleet.deleteDriver);

  const [newDriver, setNewDriver] = useState({
    driverId: "",
    driverName: "",
    idNumber: "",
    phone: "",
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

  const handleCreate = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (!newDriver.driverId || !newDriver.driverName || !newDriver.idNumber || !newDriver.phone) {
        setErrorMsg("All fields are required");
        return;
      }
      await createDriver(newDriver);
      setNewDriver({ driverId: "", driverName: "", idNumber: "", phone: "", status: "active" });
      setSuccessMsg("Driver created");
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const startEdit = (d: any) => {
    setEditingId(d._id as string);
    setEditingState({ ...d });
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
      await updateDriver({ id: editingId as Id<"drivers">, patch: {
        driverId: editingState.driverId,
        driverName: editingState.driverName,
        idNumber: editingState.idNumber,
        phone: editingState.phone,
        status: editingState.status,
      } });
      setSuccessMsg("Driver updated");
      cancelEdit();
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const toggleStatus = async (d: any) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = d.status === "inactive" ? "active" : "inactive";
      await updateDriverStatus({ id: d._id as Id<"drivers">, status: newStatus });
      setSuccessMsg(`Driver ${newStatus === "inactive" ? "deactivated" : "activated"}`);
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const removeDriver = async (id: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const ok = confirm("Delete this driver? This cannot be undone.");
    if (!ok) return;
    try {
      await deleteDriver({ id: id as Id<"drivers"> });
      setSuccessMsg("Driver deleted");
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  return (
    <div className="w-full h-full p-6 space-y-6 overflow-y-auto">
      <div>
        <h1 className="text-xl font-bold">Admin — Drivers</h1>
        <p className="text-xs text-gray-500">Manage driver master data. Inactive drivers are hidden from dropdowns.</p>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setKpiFilter("total")}
          className={`rounded-lg px-4 py-2 min-w-[120px] text-left border ${
            kpiFilter === "total"
              ? "bg-slate-100 border-slate-400"
              : "bg-slate-50 border-transparent"
          }`}
        >
           <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Total Drivers</div>
           <div className="text-2xl font-bold text-slate-600">{stats.total}</div>
        </button>
        <button
          type="button"
          onClick={() => setKpiFilter("active")}
          className={`rounded-lg px-4 py-2 min-w-[120px] text-left border ${
            kpiFilter === "active"
              ? "bg-green-100 border-green-500"
              : "bg-green-50 border-transparent"
          }`}
        >
           <div className="text-[10px] uppercase tracking-wider font-semibold text-green-600/80 mb-0.5">Active</div>
           <div className="text-2xl font-bold text-green-700">{stats.active}</div>
        </button>
        <button
          type="button"
          onClick={() => setKpiFilter("inactive")}
          className={`rounded-lg px-4 py-2 min-w-[120px] text-left border ${
            kpiFilter === "inactive"
              ? "bg-gray-200 border-gray-500"
              : "bg-gray-100/50 border-transparent"
          }`}
        >
           <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Inactive</div>
           <div className="text-2xl font-bold text-gray-500">{stats.inactive}</div>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, id, phone, status"
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
            <button onClick={() => handleSort("driverName")} className="hover:text-black">Name</button>
            <span className="text-blue-600">{sortBy === "driverName" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1 flex items-center gap-1">
            <button onClick={() => handleSort("driverId")} className="hover:text-black">Driver ID</button>
            <span className="text-blue-600">{sortBy === "driverId" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1">ID Number</div>
          <div className="col-span-1">Phone</div>
          <div className="col-span-1 flex items-center gap-1">
            <button onClick={() => handleSort("status")} className="hover:text-black">Status</button>
            <span className="text-blue-600">{sortBy === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="divide-y divide-gray-200">
          {/* New row */}
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
            <input className="col-span-2 border rounded px-2 py-1" placeholder="Name" value={newDriver.driverName} onChange={(e) => setNewDriver({ ...newDriver, driverName: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="Driver ID" value={newDriver.driverId} onChange={(e) => setNewDriver({ ...newDriver, driverId: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="ID Number" value={newDriver.idNumber} onChange={(e) => setNewDriver({ ...newDriver, idNumber: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="Phone" value={newDriver.phone} onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })} />
            <select className="col-span-1 border rounded px-2 py-1" value={newDriver.status} onChange={(e) => setNewDriver({ ...newDriver, status: e.target.value })}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
            <div className="col-span-1 text-right">
              <button onClick={handleCreate} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Add</button>
            </div>
          </div>

          {filteredDrivers.map((d: any) => {
            const isEditing = editingId === (d._id as string);
            return (
              <div key={d._id} className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
                {isEditing ? (
                  <>
                    <input className="col-span-2 border rounded px-2 py-1" value={editingState.driverName} onChange={(e) => setEditingState({ ...editingState, driverName: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.driverId} onChange={(e) => setEditingState({ ...editingState, driverId: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.idNumber} onChange={(e) => setEditingState({ ...editingState, idNumber: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.phone} onChange={(e) => setEditingState({ ...editingState, phone: e.target.value })} />
                    <select className="col-span-1 border rounded px-2 py-1" value={editingState.status} onChange={(e) => setEditingState({ ...editingState, status: e.target.value })}>
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                    <div className="col-span-1 text-right space-x-2">
                      <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">Save</button>
                      <button onClick={cancelEdit} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2 font-medium text-gray-900">{d.driverName}</div>
                    <div className="col-span-1">{d.driverId}</div>
                    <div className="col-span-1">{d.idNumber}</div>
                    <div className="col-span-1">{d.phone}</div>
                    <div className="col-span-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${d.status === "inactive" ? "bg-gray-100 text-gray-700" : "bg-green-100 text-green-800"}`}>
                        {d.status || "active"}
                      </span>
                    </div>
                    <div className="col-span-1 text-right space-x-3">
                      <button onClick={() => startEdit(d)} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Edit</button>
                      <button onClick={() => toggleStatus(d)} className="text-xs font-medium text-yellow-600 hover:text-yellow-800 hover:underline">{d.status === "inactive" ? "Activate" : "Deactivate"}</button>
                      <button onClick={() => removeDriver(d._id as string)} className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline">Delete</button>
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
