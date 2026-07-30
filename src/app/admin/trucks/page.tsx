"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useKpiFilter } from "@/src/lib/useKpiFilter";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { useToast } from "@/src/components/common/Toast";
import { Pagination } from "@/src/components/common/Pagination";
import { Plus, Pencil, Trash2, Power, PowerOff, Search, X } from "lucide-react";

type SortDir = "asc" | "desc";

function OwnerBadge({ sub, subStatus }: { sub?: { _id: string; companyName: string } | null; subStatus?: string }) {
  if (sub) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{backgroundColor:"var(--color-accent-purple)", color:"#fff"}}>
          {sub.companyName}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold`}
          style={{
            backgroundColor: subStatus === "inactive" ? "var(--card-border)" : "var(--color-primary)",
            color: "#fff",
          }}>
          {subStatus === "inactive" ? "Sub Inactive" : "Sub Active"}
        </span>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{backgroundColor:"var(--card-border)", color:"var(--nav-text-color)"}}>
      Fleet
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold`}
      style={{
        backgroundColor: status === "inactive" ? "var(--card-border)" : "var(--color-accent-emerald)",
        color: "#fff",
      }}>
      {status === "inactive" ? "Inactive" : "Active"}
    </span>
  );
}

export default function AdminTrucksPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"truckFleetNo" | "registration" | "make" | "model">("truckFleetNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [kpiFilter, setKpiFilter] = useKpiFilter();

  const trucksQuery = useQuery(api.fleet.getTrucks, { search, sortBy, sortDir, includeInactive });
  const statsQuery = useQuery(api.fleet.getTruckStats);
  const subcontractorsQuery = useQuery(api.subcontractors.list, {});
  const createTruck = useMutation(api.fleet.createTruck);
  const updateTruck = useMutation(api.fleet.updateTruck);
  const deleteTruck = useMutation(api.fleet.deleteTruck);
  const updateTruckStatus = useMutation(api.fleet.updateTruckStatus);

  const subcontractors = subcontractorsQuery || [];

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTruck, setNewTruck] = useState({
    truckFleetNo: "",
    registration: "",
    make: "",
    model: "",
    status: "active",
    subcontractorId: "",
    subStatus: "active",
  });
  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const trucks = trucksQuery || [];
  const filteredTrucks =
    kpiFilter === "total"
      ? trucks
      : trucks.filter((t: any) =>
          kpiFilter === "active" ? t.status !== "inactive" : t.status === "inactive"
        );
  const stats = statsQuery || { total: 0, active: 0, inactive: 0 };

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredTrucks.length / pageSize));
  const pagedTrucks = filteredTrucks.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, sortBy, sortDir, includeInactive, kpiFilter]);

  if (trucksQuery === undefined || statsQuery === undefined) return <SkeletonPage />;

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const toggleStatus = async (t: any) => {
    try {
      const newStatus = t.status === "inactive" ? "active" : "inactive";
      await updateTruckStatus({ id: t._id as Id<"trucks">, status: newStatus });
      addToast(`Truck ${newStatus === "inactive" ? "deactivated" : "activated"}`, "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const handleCreate = async () => {
    try {
      if (!newTruck.truckFleetNo || !newTruck.registration || !newTruck.make || !newTruck.model) {
        addToast("All fields are required", "error");
        return;
      }
      await createTruck({
        ...newTruck,
        subcontractorId: newTruck.subcontractorId ? (newTruck.subcontractorId as Id<"subcontractors">) : undefined,
        subStatus: newTruck.subcontractorId ? newTruck.subStatus : undefined,
      });
      setNewTruck({ truckFleetNo: "", registration: "", make: "", model: "", status: "active", subcontractorId: "", subStatus: "active" });
      setShowAddForm(false);
      addToast("Truck created", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
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
    try {
      await updateTruck({ id: editingId as Id<"trucks">, patch: {
        truckFleetNo: editingState.truckFleetNo,
        registration: editingState.registration,
        make: editingState.make,
        model: editingState.model,
        subcontractorId: editingState.subcontractorId || null,
        subStatus: editingState.subStatus || undefined,
      } });
      addToast("Truck updated", "success");
      cancelEdit();
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const confirmRemoveTruck = async () => {
    if (!deletingId) return;
    try {
      await deleteTruck({ id: deletingId as Id<"trucks"> });
      addToast("Truck deleted", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const sortOptions: { key: typeof sortBy; label: string }[] = [
    { key: "truckFleetNo", label: "Fleet No" },
    { key: "registration", label: "Registration" },
    { key: "make", label: "Make" },
    { key: "model", label: "Model" },
  ];

  return (
    <div className="w-full h-full p-6 space-y-6 overflow-y-auto" style={{color:"var(--foreground)"}}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Trucks</h1>
          <p className="text-xs mt-0.5" style={{color:"var(--nav-text-color)"}}>Manage truck master data</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm"
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? "Cancel" : "Add Truck"}
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        {(["total", "active", "inactive"] as const).map((filter) => {
          const isActive = kpiFilter === filter;
          return (
            <button key={filter} onClick={() => setKpiFilter(kpiFilter === filter ? "total" : filter)}
              className={`glass-card rounded-xl px-5 py-3 min-w-[110px] text-left transition-all cursor-pointer ${isActive ? "ring-2 ring-[#06B6D4]/50" : ""}`}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{color:"var(--nav-text-color)"}}>{filter === "total" ? "Total" : filter === "active" ? "Active" : "Inactive"}</div>
              <div className={`text-2xl font-black ${filter === "active" ? "text-[var(--color-accent-emerald)]" : ""}`} style={{color: filter !== "active" ? "var(--foreground)" : undefined}}>{stats[filter]}</div>
            </button>
          );
        })}
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:"var(--nav-text-color)"}} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fleet no, registration..."
            className="w-full pl-10 pr-3 py-1.5 rounded-lg text-xs settings-input" />
        </div>
        <select
          value={sortBy}
          onChange={(e) => handleSort(e.target.value as typeof sortBy)}
          className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
          style={{
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            color: "var(--foreground)",
            backdropFilter: "blur(8px)",
          }}
        >
          {sortOptions.map((o) => (
            <option key={o.key} value={o.key}>{o.label} {sortBy === o.key ? (sortDir === "asc" ? "↑" : "↓") : ""}</option>
          ))}
        </select>
        <button
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          className="px-2 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            color: "var(--nav-text-color)",
            backdropFilter: "blur(8px)",
          }}
        >
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{color:"var(--nav-text-color)"}}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded"
            style={{borderColor:"var(--card-border)"}}
          />
          Include inactive
        </label>
      </div>

      {/* Add New Card */}
      {showAddForm && (
        <div className="glass-card-premium p-5 space-y-4 border-dashed">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--nav-text-color)"}}>New Truck</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Fleet No" value={newTruck.truckFleetNo} onChange={(e) => setNewTruck({ ...newTruck, truckFleetNo: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Registration" value={newTruck.registration} onChange={(e) => setNewTruck({ ...newTruck, registration: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Make" value={newTruck.make} onChange={(e) => setNewTruck({ ...newTruck, make: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Model" value={newTruck.model} onChange={(e) => setNewTruck({ ...newTruck, model: e.target.value })} />
            <select value={newTruck.subcontractorId} onChange={(e) => setNewTruck({ ...newTruck, subcontractorId: e.target.value })}
              className="rounded-lg px-2 py-2 text-xs outline-none"
              style={{
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                color: "var(--foreground)",
              }}>
              <option value="">Fleet (own)</option>
              {subcontractors.map((s: any) => (<option key={s._id} value={s._id}>{s.companyName}</option>))}
            </select>
            {newTruck.subcontractorId && (
              <select value={newTruck.subStatus} onChange={(e) => setNewTruck({ ...newTruck, subStatus: e.target.value })}
                className="rounded-lg px-2 py-2 text-xs outline-none"
                style={{
                  border: "1px solid var(--card-border)",
                  background: "var(--card-bg)",
                  color: "var(--foreground)",
                }}>
                <option value="active">Sub Active</option>
                <option value="inactive">Sub Inactive</option>
              </select>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs font-medium transition-colors" style={{color:"var(--nav-text-color)"}}>Cancel</button>
            <button onClick={handleCreate} className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm">Add Truck</button>
          </div>
        </div>
      )}

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {pagedTrucks.map((t: any) => {
          const sub = subcontractors.find((s: any) => s._id === t.subcontractorId);
          const isEditing = editingId === (t._id as string);

          if (isEditing) {
            return (
              <div key={t._id} className="glass-card-premium p-5 space-y-3" style={{borderColor:"#06B6D4"}}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"#06B6D4"}}>Editing</h3>
                <input
                  className="w-full rounded-lg px-3 py-2 text-xs settings-input"
                  value={editingState.truckFleetNo} onChange={(e) => setEditingState({ ...editingState, truckFleetNo: e.target.value })} placeholder="Fleet No" />
                <input
                  className="w-full settings-input rounded-lg px-3 py-2 text-xs"
                  value={editingState.registration} onChange={(e) => setEditingState({ ...editingState, registration: e.target.value })} placeholder="Registration" />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.make} onChange={(e) => setEditingState({ ...editingState, make: e.target.value })} placeholder="Make" />
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.model} onChange={(e) => setEditingState({ ...editingState, model: e.target.value })} placeholder="Model" />
                </div>
                <select value={editingState.subcontractorId || ""} onChange={(e) => setEditingState({ ...editingState, subcontractorId: e.target.value || null })}
                  className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                  style={{
                    border: "1px solid var(--card-border)",
                    background: "var(--card-bg)",
                    color: "var(--foreground)",
                  }}>
                  <option value="">Fleet (own)</option>
                  {subcontractors.map((s: any) => (<option key={s._id} value={s._id}>{s.companyName}</option>))}
                </select>
                {editingState.subcontractorId && (
                  <select value={editingState.subStatus || "active"} onChange={(e) => setEditingState({ ...editingState, subStatus: e.target.value })}
                    className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                    style={{
                      border: "1px solid var(--card-border)",
                      background: "var(--card-bg)",
                      color: "var(--foreground)",
                    }}>
                    <option value="active">Sub Active</option>
                    <option value="inactive">Sub Inactive</option>
                  </select>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm">Save</button>
                  <button onClick={cancelEdit} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      border: "1px solid var(--card-border)",
                      color: "var(--nav-text-color)",
                    }}>Cancel</button>
                </div>
              </div>
            );
          }

          return (
            <div key={t._id} className="group glass-card rounded-xl p-5 relative hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
              {/* Top row: fleet no + actions */}
              <div className="flex items-start justify-between mb-3">
                <div className="text-lg font-bold tracking-tight" style={{color:"var(--foreground)"}}>
                  {t.truckFleetNo}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleStatus(t)} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title={t.status === "inactive" ? "Activate" : "Deactivate"}>
                    {t.status === "inactive" ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setDeletingId(t._id as string)} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2" style={{color:"var(--nav-text-color)"}}>
                  <span className="font-medium min-w-[80px]" style={{color:"var(--nav-text-color)"}}>Registration</span>
                  <span style={{color:"var(--foreground)"}}>{t.registration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium min-w-[80px] text-xs" style={{color:"var(--nav-text-color)"}}>Make / Model</span>
                  <span style={{color:"var(--foreground)"}}>{t.make} {t.model}</span>
                </div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-3" style={{borderTop:"1px solid var(--card-border)"}}>
                <OwnerBadge sub={sub} subStatus={t.subStatus} />
                <StatusBadge status={t.status} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {pagedTrucks.length === 0 && (
        <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
          <div className="text-4xl mb-3 opacity-30">🚛</div>
          <p className="text-sm font-medium" style={{color:"var(--nav-text-color)"}}>No trucks found</p>
          <p className="text-xs mt-1" style={{color:"var(--nav-text-color)"}}>Try adjusting your search or filters</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Truck"
        message="Delete this truck? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmRemoveTruck}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
