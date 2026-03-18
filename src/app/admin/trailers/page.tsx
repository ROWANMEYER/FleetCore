"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type SortDir = "asc" | "desc";

export default function AdminTrailersPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"trailerFleetNoStr" | "type">("trailerFleetNoStr");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [includeInactive, setIncludeInactive] = useState(true);

  const trailersRaw = useQuery(api.fleet.getTrailers, {}) || [];
  const trailers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = trailersRaw.filter((t: any) => {
      if (!includeInactive) {
        const status = String(t?.status ?? "").toLowerCase();
        if (status === "inactive") return false;
      }
      if (q === "") return true;
      const fleetNo = String(t?.trailerFleetNoStr ?? t?.trailerFleetNo ?? "").toLowerCase();
      const type = String(t?.type ?? "").toLowerCase();
      const length = String(t?.length ?? "").toLowerCase();
      const registration = String(t?.registration ?? "").toLowerCase();
      return (
        fleetNo.includes(q) ||
        type.includes(q) ||
        length.includes(q) ||
        registration.includes(q)
      );
    });

    filtered.sort((a: any, b: any) => {
      const av = String(a?.[sortBy] ?? "");
      const bv = String(b?.[sortBy] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [trailersRaw, includeInactive, search, sortBy, sortDir]);
  const stats = useQuery(api.fleet.getTrailerStats) || { total: 0, active: 0, inactive: 0 };

  const createTrailer = useMutation(api.fleet.createTrailer);
  const updateTrailerComponent = useMutation(api.fleet.updateTrailerComponent);
  const deleteTrailerComponent = useMutation(api.fleet.deleteTrailerComponent);

  const [newTrailer, setNewTrailer] = useState({
    trailerFleetNo: "",
    trailerFleetNoStr: "",
    length: "",
    registration: "",
    type: "",
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Edit state now includes original values to identify the component
  const [editingId, setEditingId] = useState<string | null>(null); // Parent ID
  const [editingState, setEditingState] = useState<any | null>(null);
  const updateTrailerStatus = useMutation(api.fleet.updateTrailerStatus);

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
      if (!newTrailer.trailerFleetNo || !newTrailer.type) {
        setErrorMsg("Fleet number (numeric) and type are required");
        return;
      }
      await createTrailer({
        trailerFleetNo: Number(newTrailer.trailerFleetNo),
        trailerFleetNoStr: newTrailer.trailerFleetNoStr || String(newTrailer.trailerFleetNo),
        trailers: [{ length: newTrailer.length || "", registration: newTrailer.registration || "" }],
        type: newTrailer.type,
      });
      setNewTrailer({ trailerFleetNo: "", trailerFleetNoStr: "", length: "", registration: "", type: "" });
      setSuccessMsg("Trailer created/added");
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const startEdit = (t: any) => {
    setEditingId(t._id + "_" + t.originalRegistration); // Unique UI Key
    setEditingState({
        _id: t._id,
        originalLength: t.originalLength,
        originalRegistration: t.originalRegistration,
        trailerFleetNo: t.trailerFleetNo,
        trailerFleetNoStr: t.trailerFleetNoStr,
        length: t.length,
        registration: t.registration,
        type: t.type
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingState(null);
  };

  const saveEdit = async () => {
    if (!editingState) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateTrailerComponent({
        id: editingState._id as Id<"trailers">,
        originalLength: editingState.originalLength,
        originalRegistration: editingState.originalRegistration,
        newLength: editingState.length,
        newRegistration: editingState.registration,
        newType: editingState.type,
        newTrailerFleetNo: Number(editingState.trailerFleetNo),
        newTrailerFleetNoStr: editingState.trailerFleetNoStr,
      });
      setSuccessMsg("Trailer updated");
      cancelEdit();
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const toggleStatus = async (t: any) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = t.status === "inactive" ? "active" : "inactive";
      await updateTrailerStatus({ id: t._id as Id<"trailers">, status: newStatus });
      setSuccessMsg(`Trailer ${newStatus === "inactive" ? "deactivated" : "activated"}`);
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const removeTrailer = async (id: string, length: string, registration: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const ok = confirm("Delete this physical trailer? If it's the last one, the fleet number will be removed.");
    if (!ok) return;
    try {
      await deleteTrailerComponent({ 
          id: id as Id<"trailers">,
          length,
          registration
      });
      setSuccessMsg("Trailer deleted");
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Admin — Trailers</h1>
        <p className="text-xs text-gray-500">Manage trailer master data. Each row represents a physical trailer.</p>
      </div>

      <div className="flex gap-4">
        <div className="bg-slate-50 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Total Trailers</div>
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
          placeholder="Search fleet no, type, length, registration"
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
        <div className="grid grid-cols-[repeat(8,minmax(0,1fr))] gap-2 bg-gray-50 px-3 py-2 border-b text-[10px] font-semibold text-gray-500 uppercase tracking-wider items-center">
          <div className="col-span-2 flex items-center gap-1">
            <button onClick={() => handleSort("trailerFleetNoStr")} className="hover:text-black">Fleet No</button>
            <span className="text-blue-600">{sortBy === "trailerFleetNoStr" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1">Length</div>
          <div className="col-span-1">Registration</div>
          <div className="col-span-1 flex items-center gap-1">
            <button onClick={() => handleSort("type")} className="hover:text-black">Type</button>
            <span className="text-blue-600">{sortBy === "type" ? (sortDir === "asc" ? "↑" : "↓") : ""}</span>
          </div>
          <div className="col-span-1">Fleet No (num)</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="divide-y divide-gray-200">
          {/* New row */}
          <div className="grid grid-cols-[repeat(8,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center bg-blue-50/50">
            <input className="col-span-2 border rounded px-2 py-1" placeholder="Fleet No (string)" value={newTrailer.trailerFleetNoStr} onChange={(e) => setNewTrailer({ ...newTrailer, trailerFleetNoStr: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="Length" value={newTrailer.length} onChange={(e) => setNewTrailer({ ...newTrailer, length: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="Registration" value={newTrailer.registration} onChange={(e) => setNewTrailer({ ...newTrailer, registration: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="Type" value={newTrailer.type} onChange={(e) => setNewTrailer({ ...newTrailer, type: e.target.value })} />
            <input className="col-span-1 border rounded px-2 py-1" placeholder="Fleet No (numeric)" value={newTrailer.trailerFleetNo} onChange={(e) => setNewTrailer({ ...newTrailer, trailerFleetNo: e.target.value })} />
            <div className="col-span-2 text-right">
              <button onClick={handleCreate} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">Add</button>
            </div>
          </div>

          {trailers.map((t: any, index: number) => {
            console.log("TRAILER ROW", t);
            const uniqueKey = t._id + "_" + t.originalRegistration;
            const isEditing = editingId === uniqueKey;
            
            return (
              <div key={uniqueKey} className="grid grid-cols-[repeat(8,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
                {isEditing ? (
                  <>
                    <input className="col-span-2 border rounded px-2 py-1" value={editingState.trailerFleetNoStr ?? ""} onChange={(e) => setEditingState({ ...editingState, trailerFleetNoStr: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.length ?? ""} onChange={(e) => setEditingState({ ...editingState, length: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.registration ?? ""} onChange={(e) => setEditingState({ ...editingState, registration: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.type ?? ""} onChange={(e) => setEditingState({ ...editingState, type: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.trailerFleetNo ?? ""} onChange={(e) => setEditingState({ ...editingState, trailerFleetNo: e.target.value })} />
                    <div className="col-span-2 text-right space-x-2">
                      <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">Save</button>
                      <button onClick={cancelEdit} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-2 font-medium text-gray-900">{t.trailerFleetNoStr ?? String(t.trailerFleetNo)}</div>
                    <div className="col-span-1">{t.length}</div>
                    <div className="col-span-1">{t.registration}</div>
                    <div className="col-span-1">{t.type}</div>
                    <div className="col-span-1">{t.trailerFleetNo}</div>
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
                      <button onClick={() => removeTrailer(t._id as string, t.originalLength, t.originalRegistration)} className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline">Delete</button>
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
