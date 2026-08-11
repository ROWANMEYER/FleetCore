"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function AdminTrailersPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"trailerFleetNoStr" | "type">("trailerFleetNoStr");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [kpiFilter, setKpiFilter] = useKpiFilter();

  const trailersQuery = useQuery(api.fleet.getTrailers, {});
  const statsQuery = useQuery(api.fleet.getTrailerStats);
  const subcontractorsQuery = useQuery(api.subcontractors.list, {});
  const createTrailer = useMutation(api.fleet.createTrailer);
  const updateTrailerComponent = useMutation(api.fleet.updateTrailerComponent);
  const deleteTrailerComponent = useMutation(api.fleet.deleteTrailerComponent);
  const updateTrailerStatus = useMutation(api.fleet.updateTrailerStatus);

  const subcontractors = subcontractorsQuery || [];

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTrailer, setNewTrailer] = useState({
    trailerFleetNo: "",
    trailerFleetNoStr: "",
    length: "",
    registration: "",
    type: "",
    subcontractorId: "",
    subStatus: "active",
  });

  const { addToast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<any | null>(null);
  const [deletingTrailer, setDeletingTrailer] = useState<{ id: string; length: string; registration: string } | null>(null);

  const trailersRaw = trailersQuery || [];

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
      return fleetNo.includes(q) || type.includes(q) || length.includes(q) || registration.includes(q);
    });
    filtered.sort((a: any, b: any) => {
      const av = String(a?.[sortBy] ?? "");
      const bv = String(b?.[sortBy] ?? "");
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [trailersRaw, includeInactive, search, sortBy, sortDir]);

  const filteredTrailers =
    kpiFilter === "total"
      ? trailers
      : trailers.filter((t: any) =>
          kpiFilter === "active" ? t.status !== "inactive" : t.status === "inactive"
        );

  const stats = statsQuery || { total: 0, active: 0, inactive: 0 };

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Group the ENTIRE filtered list so we get an accurate total count for pagination
  const allGroups = useMemo(() => {
    const groups = new Map<string, { _id: string; trailerFleetNo: number; trailerFleetNoStr: string; type: string; status?: string; subStatus?: string; subcontractorId?: string; currentExpiry?: string; components: any[] }>();
    for (const item of filteredTrailers) {
      const key = item._id;
      if (!groups.has(key)) {
        groups.set(key, {
          _id: item._id,
          trailerFleetNo: item.trailerFleetNo,
          trailerFleetNoStr: item.trailerFleetNoStr,
          type: item.type,
          status: item.status,
          subStatus: item.subStatus,
          subcontractorId: item.subcontractorId,
          currentExpiry: item.currentExpiry,
          components: [],
        });
      }
      groups.get(key)!.components.push(item);
    }
    return Array.from(groups.values());
  }, [filteredTrailers]);

  const totalPages = Math.max(1, Math.ceil(allGroups.length / pageSize));
  const pagedGroups = allGroups.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, sortBy, sortDir, includeInactive, kpiFilter]);

  if (trailersQuery === undefined || statsQuery === undefined) return <SkeletonPage />;

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const handleCreate = async () => {
    try {
      if (!newTrailer.trailerFleetNo || !newTrailer.type) {
        addToast("Fleet number (numeric) and type are required", "error");
        return;
      }
      await createTrailer({
        trailerFleetNo: Number(newTrailer.trailerFleetNo),
        trailerFleetNoStr: newTrailer.trailerFleetNoStr || String(newTrailer.trailerFleetNo),
        trailers: [{ length: newTrailer.length || "", registration: newTrailer.registration || "" }],
        type: newTrailer.type,
        subcontractorId: newTrailer.subcontractorId ? (newTrailer.subcontractorId as Id<"subcontractors">) : undefined,
        subStatus: newTrailer.subcontractorId ? newTrailer.subStatus : undefined,
      });
      setNewTrailer({ trailerFleetNo: "", trailerFleetNoStr: "", length: "", registration: "", type: "", subcontractorId: "", subStatus: "active" });
      setShowAddForm(false);
      addToast("Trailer created/added", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const startEdit = (t: any) => {
    setEditingId(t._id + "_" + t.originalRegistration);
    setEditingState({
      _id: t._id,
      originalLength: t.originalLength,
      originalRegistration: t.originalRegistration,
      trailerFleetNo: t.trailerFleetNo,
      trailerFleetNoStr: t.trailerFleetNoStr,
      length: t.length,
      registration: t.registration,
      type: t.type,
      subcontractorId: t.subcontractorId || null,
      subStatus: t.subStatus || "active",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingState(null);
  };

  const saveEdit = async () => {
    if (!editingState) return;
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
        subcontractorId: editingState.subcontractorId || null,
        subStatus: editingState.subStatus || undefined,
      });
      addToast("Trailer updated", "success");
      cancelEdit();
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const toggleStatus = async (t: any) => {
    try {
      const newStatus = t.status === "inactive" ? "active" : "inactive";
      await updateTrailerStatus({ id: t._id as Id<"trailers">, status: newStatus });
      addToast(`Trailer ${newStatus === "inactive" ? "deactivated" : "activated"}`, "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const confirmRemoveTrailer = async () => {
    if (!deletingTrailer) return;
    try {
      await deleteTrailerComponent({
        id: deletingTrailer.id as Id<"trailers">,
        length: deletingTrailer.length,
        registration: deletingTrailer.registration
      });
      addToast("Trailer deleted", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    } finally {
      setDeletingTrailer(null);
    }
  };

  const sortOptions: { key: typeof sortBy; label: string }[] = [
    { key: "trailerFleetNoStr", label: "Fleet No" },
    { key: "type", label: "Type" },
  ];

  return (
    <div className="w-full h-full p-4 sm:p-6 space-y-6 overflow-y-auto" style={{color:"var(--foreground)"}}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Trailers</h1>
          <p className="text-xs mt-0.5" style={{color:"var(--nav-text-color)"}}>Manage trailer master data</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm"
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? "Cancel" : "Add Trailer"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-sm">
        {(["total", "active", "inactive"] as const).map((filter) => {
          const isActive = kpiFilter === filter;
          return (
            <button key={filter} onClick={() => setKpiFilter(kpiFilter === filter ? "total" : filter)}
              className={`glass-card rounded-xl px-3 py-2 text-left transition-all cursor-pointer ${isActive ? "ring-2 ring-[#06B6D4]/50" : ""}`}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5 truncate" style={{color:"var(--nav-text-color)"}}>{filter === "total" ? "Total" : filter === "active" ? "Active" : "Inactive"}</div>
              <div className={`text-xl font-black ${filter === "active" ? "text-emerald-500" : ""}`} style={{color: filter !== "active" ? "var(--foreground)" : undefined}}>{stats[filter]}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:"var(--nav-text-color)"}} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fleet no, type, registration..."
            className="w-full pl-10 pr-3 py-1.5 rounded-lg text-xs settings-input" />
        </div>
        <select value={sortBy} onChange={(e) => handleSort(e.target.value as typeof sortBy)}
          className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
          style={{
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            color: "var(--foreground)",
            backdropFilter: "blur(8px)",
          }}>
          {sortOptions.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
        </select>
        <button onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          className="px-2 py-1.5 rounded-lg text-xs transition-colors"
          style={{
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            color: "var(--nav-text-color)",
            backdropFilter: "blur(8px)",
          }}>
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{color:"var(--nav-text-color)"}}>
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded" style={{borderColor:"var(--card-border)"}} />
          Include inactive
        </label>
      </div>

      {showAddForm && (
        <div className="glass-card-premium p-5 space-y-4 border-dashed">
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--nav-text-color)"}}>New Trailer</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Fleet No (str)" value={newTrailer.trailerFleetNoStr} onChange={(e) => setNewTrailer({ ...newTrailer, trailerFleetNoStr: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Fleet No (num)" value={newTrailer.trailerFleetNo} onChange={(e) => setNewTrailer({ ...newTrailer, trailerFleetNo: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Length" value={newTrailer.length} onChange={(e) => setNewTrailer({ ...newTrailer, length: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Registration" value={newTrailer.registration} onChange={(e) => setNewTrailer({ ...newTrailer, registration: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Type" value={newTrailer.type} onChange={(e) => setNewTrailer({ ...newTrailer, type: e.target.value })} />
            <select value={newTrailer.subcontractorId} onChange={(e) => setNewTrailer({ ...newTrailer, subcontractorId: e.target.value })}
              className="rounded-lg px-2 py-2 text-xs outline-none"
              style={{
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                color: "var(--foreground)",
              }}>
              <option value="">Fleet (own)</option>
              {subcontractors.map((s: any) => (<option key={s._id} value={s._id}>{s.companyName}</option>))}
            </select>
            {newTrailer.subcontractorId && (
              <select value={newTrailer.subStatus} onChange={(e) => setNewTrailer({ ...newTrailer, subStatus: e.target.value })}
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
            <button onClick={handleCreate} className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm">Add Trailer</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {pagedGroups.map((group: any) => {
          const sub = subcontractors.find((s: any) => s._id === group.subcontractorId);
          const isEditingGroup = editingId && group.components.some((c: any) => (group._id + "_" + c.originalRegistration) === editingId);

          // If editing one component in this group, show the editing card
          if (isEditingGroup) {
            return (
              <div key={group._id + "_editing"} className="glass-card-premium p-5 space-y-3" style={{borderColor:"#06B6D4"}}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"#06B6D4"}}>Editing: {group.trailerFleetNoStr}</h3>
                <input
                  className="w-full rounded-lg px-3 py-2 text-xs settings-input"
                  value={editingState.trailerFleetNoStr ?? ""} onChange={(e) => setEditingState({ ...editingState, trailerFleetNoStr: e.target.value })} placeholder="Fleet No" />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.length ?? ""} onChange={(e) => setEditingState({ ...editingState, length: e.target.value })} placeholder="Length" />
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.registration ?? ""} onChange={(e) => setEditingState({ ...editingState, registration: e.target.value })} placeholder="Registration" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.type ?? ""} onChange={(e) => setEditingState({ ...editingState, type: e.target.value })} placeholder="Type" />
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.trailerFleetNo ?? ""} onChange={(e) => setEditingState({ ...editingState, trailerFleetNo: e.target.value })} placeholder="Fleet No (num)" />
                </div>
                <select value={editingState.subcontractorId || ""} onChange={(e) => setEditingState({ ...editingState, subcontractorId: e.target.value || null })}
                  className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                  style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }}>
                  <option value="">Fleet (own)</option>
                  {subcontractors.map((s: any) => (<option key={s._id} value={s._id}>{s.companyName}</option>))}
                </select>
                {editingState.subcontractorId && (
                  <select value={editingState.subStatus || "active"} onChange={(e) => setEditingState({ ...editingState, subStatus: e.target.value })}
                    className="w-full rounded-lg px-2 py-2 text-xs outline-none"
                    style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }}>
                    <option value="active">Sub Active</option>
                    <option value="inactive">Sub Inactive</option>
                  </select>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm">Save</button>
                  <button onClick={cancelEdit} className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ border: "1px solid var(--card-border)", color: "var(--nav-text-color)" }}>Cancel</button>
                </div>
              </div>
            );
          }

          return (
            <div key={group._id} className="group glass-card rounded-xl p-5 relative hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
              {/* Header: fleet number + status toggle */}
              <div className="flex items-start justify-between mb-3">
                <div className="text-lg font-bold tracking-tight" style={{color:"var(--foreground)"}}>
                  {group.trailerFleetNoStr ?? String(group.trailerFleetNo)}
                </div>
                <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => toggleStatus(group)} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title={group.status === "inactive" ? "Activate" : "Deactivate"}>
                    {group.status === "inactive" ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Components: one line per trailer (6m, 12m) */}
              <div className="space-y-2 text-xs">
                {group.components.map((comp: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--card-bg)] transition-colors" style={{borderBottom: idx < group.components.length - 1 ? "1px solid var(--card-border)" : "none"}}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-semibold min-w-[32px]" style={{color:"var(--nav-text-color)"}}>{comp.length || "—"}</span>
                      <span style={{color:"var(--foreground)"}}>{comp.registration || "—"}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(comp)} className="p-1 rounded hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title="Edit">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeletingTrailer({ id: group._id as string, length: comp.originalLength, registration: comp.originalRegistration })} className="p-1 rounded hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Type + badges */}
              <div className="flex items-center gap-2 mt-3 text-xs" style={{color:"var(--nav-text-color)"}}>
                <span className="font-medium">Type:</span>
                <span style={{color:"var(--foreground)"}}>{group.type}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-3" style={{borderTop:"1px solid var(--card-border)"}}>
                <OwnerBadge sub={sub} subStatus={group.subStatus} />
                <StatusBadge status={group.status} />
              </div>
            </div>
          );
        })}
      </div>

      {pagedGroups.length === 0 && (
        <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
          <div className="text-4xl mb-3 opacity-30">🛞</div>
          <p className="text-sm font-medium" style={{color:"var(--nav-text-color)"}}>No trailers found</p>
          <p className="text-xs mt-1" style={{color:"var(--nav-text-color)"}}>Try adjusting your search or filters</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmDialog
        open={deletingTrailer !== null}
        title="Delete Trailer"
        message="Delete this physical trailer? If it's the last one, the fleet number will be removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmRemoveTrailer}
        onCancel={() => setDeletingTrailer(null)}
      />
    </div>
  );
}
