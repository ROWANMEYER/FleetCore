"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useKpiFilter } from "@/src/lib/useKpiFilter";
import { DriverAvatar } from "@/src/components/admin/DriverAvatar";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { useToast } from "@/src/components/common/Toast";
import { Pagination } from "@/src/components/common/Pagination";
import { FlipCard } from "@/src/components/common/FlipCard";
import { FlipHint } from "@/src/components/admin/FlipHint";
import { getBirthdayFromSAID } from "@/src/lib/birthdays";
import { Plus, Pencil, Trash2, Power, PowerOff, Search, X, FlipVertical2 } from "lucide-react";

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

type ExpiryTone = "expired" | "soon" | "ok" | "none";

function formatDate(value?: string | number): string {
  if (value === undefined || value === null || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function expiryTone(value?: string): ExpiryTone {
  if (!value) return "none";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "ok";
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "ok";
}

function formatBirthday(idNumber?: string): string {
  const b = getBirthdayFromSAID(idNumber);
  if (!b) return "—";
  const label = new Date(b.year, b.month - 1, b.day).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${label} (${new Date().getFullYear() - b.year})`;
}

function ExpiryRow({ label, value, tone }: { label: string; value?: string; tone: ExpiryTone }) {
  const valueColor =
    tone === "expired" ? "#f87171" : tone === "soon" ? "#fbbf24" : tone === "ok" ? "var(--foreground)" : "var(--nav-text-color)";
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-medium" style={{ color: "var(--nav-text-color)" }}>{label}</span>
      <span className="flex items-center gap-1.5">
        {tone === "expired" && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-red-400 bg-red-500/10 border border-red-500/30 rounded px-1 py-0.5">Expired</span>
        )}
        {tone === "soon" && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1 py-0.5">Due soon</span>
        )}
        <span style={{ color: valueColor }}>{formatDate(value)}</span>
      </span>
    </div>
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

export default function AdminDriversPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"driverName" | "driverId" | "status">("driverName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [kpiFilter, setKpiFilter] = useKpiFilter();

  const driversQuery = useQuery(api.fleet.getDrivers, { search, sortBy, sortDir, includeInactive });
  const statsQuery = useQuery(api.fleet.getDriverStats);
  const subcontractorsQuery = useQuery(api.subcontractors.list, {});
  const createDriver = useMutation(api.fleet.createDriver);
  const updateDriver = useMutation(api.fleet.updateDriver);
  const updateDriverStatus = useMutation(api.fleet.updateDriverStatus);
  const deleteDriver = useMutation(api.fleet.deleteDriver);

  const subcontractors = subcontractorsQuery || [];

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDriver, setNewDriver] = useState({
    driverId: "",
    driverName: "",
    idNumber: "",
    phone: "",
    status: "active",
    subcontractorId: "",
    subStatus: "active",
  });

  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const drivers = driversQuery || [];
  const filteredDrivers =
    kpiFilter === "total"
      ? drivers
      : drivers.filter((d: any) =>
          kpiFilter === "active" ? d.status !== "inactive" : d.status === "inactive"
        );
  const stats = statsQuery || { total: 0, active: 0, inactive: 0 };

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / pageSize));
  const pagedItems = filteredDrivers.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, sortBy, sortDir, includeInactive, kpiFilter]);

  if (driversQuery === undefined || statsQuery === undefined) return <SkeletonPage />;

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
      if (!newDriver.driverId || !newDriver.driverName || !newDriver.idNumber || !newDriver.phone) {
        addToast("All fields are required", "error");
        return;
      }
      await createDriver({
        ...newDriver,
        subcontractorId: newDriver.subcontractorId ? (newDriver.subcontractorId as Id<"subcontractors">) : undefined,
        subStatus: newDriver.subcontractorId ? newDriver.subStatus : undefined,
      });
      setNewDriver({ driverId: "", driverName: "", idNumber: "", phone: "", status: "active", subcontractorId: "", subStatus: "active" });
      setShowAddForm(false);
      addToast("Driver created", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
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
    try {
      await updateDriver({ id: editingId as Id<"drivers">, patch: {
        driverId: editingState.driverId,
        driverName: editingState.driverName,
        idNumber: editingState.idNumber,
        phone: editingState.phone,
        status: editingState.status,
        subcontractorId: editingState.subcontractorId || null,
        subStatus: editingState.subStatus || undefined,
      } });
      addToast("Driver updated", "success");
      cancelEdit();
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const toggleStatus = async (d: any) => {
    try {
      const newStatus = d.status === "inactive" ? "active" : "inactive";
      await updateDriverStatus({ id: d._id as Id<"drivers">, status: newStatus });
      addToast(`Driver ${newStatus === "inactive" ? "deactivated" : "activated"}`, "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const confirmRemoveDriver = async () => {
    if (!deletingId) return;
    try {
      await deleteDriver({ id: deletingId as Id<"drivers"> });
      addToast("Driver deleted", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const sortOptions: { key: typeof sortBy; label: string }[] = [
    { key: "driverName", label: "Name" },
    { key: "driverId", label: "Driver ID" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="w-full h-full p-4 sm:p-6 space-y-6 overflow-y-auto" style={{color:"var(--foreground)"}}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Drivers</h1>
          <p className="text-xs mt-0.5" style={{color:"var(--nav-text-color)"}}>Manage driver master data</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm"
        >
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAddForm ? "Cancel" : "Add Driver"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 max-w-sm">
        {(["total", "active", "inactive"] as const).map((filter) => {
          const isActive = kpiFilter === filter;
          return (
            <button key={filter} onClick={() => setKpiFilter(kpiFilter === filter ? "total" : filter)}
              className={`glass-card rounded-xl px-3 py-2 text-left transition-all cursor-pointer ${isActive ? "ring-2 ring-[#06B6D4]/50" : ""}`}>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5 truncate" style={{color:"var(--nav-text-color)"}}>{filter === "total" ? "Total" : filter === "active" ? "Active" : "Inactive"}</div>
              <div className={`text-xl font-black ${filter === "active" ? "text-[var(--color-accent-emerald)]" : ""}`} style={{color: filter !== "active" ? "var(--foreground)" : undefined}}>{stats[filter]}</div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:"var(--nav-text-color)"}} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, id, phone..."              className="w-full pl-10 pr-3 py-1.5 rounded-lg text-xs outline-none transition-all focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-[#06B6D4]"
            style={{
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              color: "var(--foreground)",
              backdropFilter: "blur(8px)",
            }} />
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
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--nav-text-color)"}}>New Driver</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Driver Name" value={newDriver.driverName} onChange={(e) => setNewDriver({ ...newDriver, driverName: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Driver ID" value={newDriver.driverId} onChange={(e) => setNewDriver({ ...newDriver, driverId: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="ID Number" value={newDriver.idNumber} onChange={(e) => setNewDriver({ ...newDriver, idNumber: e.target.value })} />
            <input
              className="rounded-lg px-3 py-2 text-xs settings-input"
              placeholder="Phone" value={newDriver.phone} onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })} />
            <select value={newDriver.subcontractorId} onChange={(e) => setNewDriver({ ...newDriver, subcontractorId: e.target.value })}
              className="rounded-lg px-2 py-2 text-xs outline-none"
              style={{
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                color: "var(--foreground)",
              }}>
              <option value="">Fleet (own)</option>
              {subcontractors.map((s: any) => (<option key={s._id} value={s._id}>{s.companyName}</option>))}
            </select>
            {newDriver.subcontractorId && (
              <select value={newDriver.subStatus} onChange={(e) => setNewDriver({ ...newDriver, subStatus: e.target.value })}
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
            <button onClick={handleCreate} className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm">Add Driver</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {pagedItems.map((d: any) => {
          const sub = subcontractors.find((s: any) => s._id === d.subcontractorId);
          const isEditing = editingId === (d._id as string);

          if (isEditing) {
            return (
              <div key={d._id} className="glass-card-premium p-5 space-y-3" style={{borderColor:"#06B6D4"}}>
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"#06B6D4"}}>Editing</h3>
                {/* Photo: uploads immediately via the same pipeline as the
                    card camera. photoUrl comes from the live query (d), so a
                    fresh upload shows up here without saving first. */}
                <div className="flex items-center gap-3">
                  <DriverAvatar
                    variant="avatar"
                    driverId={d._id}
                    name={editingState.driverName}
                    photoUrl={d.photoUrl}
                    photoOriginalUrl={d.photoOriginalUrl}
                  />
                  <div className="text-[10px] leading-snug" style={{color:"var(--nav-text-color)"}}>
                    <div className="text-xs font-semibold" style={{color:"var(--foreground)"}}>Driver photo</div>
                    Tap the camera to change it, or the trash to remove — saved immediately.
                  </div>
                </div>
                <input
                  className="w-full rounded-lg px-3 py-2 text-xs settings-input"
                  value={editingState.driverName} onChange={(e) => setEditingState({ ...editingState, driverName: e.target.value })} placeholder="Name" />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.driverId} onChange={(e) => setEditingState({ ...editingState, driverId: e.target.value })} placeholder="Driver ID" />
                  <input
                    className="rounded-lg px-3 py-2 text-xs settings-input"
                    value={editingState.idNumber} onChange={(e) => setEditingState({ ...editingState, idNumber: e.target.value })} placeholder="ID Number" />
                </div>
                <input
                  className="w-full rounded-lg px-3 py-2 text-xs settings-input"
                  value={editingState.phone} onChange={(e) => setEditingState({ ...editingState, phone: e.target.value })} placeholder="Phone" />
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

          const isFlipped = flippedId === (d._id as string);

          return (
            <FlipCard
              key={d._id}
              flipped={isFlipped}
              onToggle={() => setFlippedId(isFlipped ? null : (d._id as string))}
              className="h-full"
              front={
                <div data-face="front" className="group glass-card rounded-xl h-full flex flex-col overflow-hidden hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
                  {/* Big driver photo — the main focus of the card */}
                  <div className="relative flex-1 min-h-[150px] overflow-hidden">
                    <FlipHint />
                    <DriverAvatar
                      variant="banner"
                      driverId={d._id}
                      name={d.driverName}
                      photoUrl={d.photoUrl}
                      photoOriginalUrl={d.photoOriginalUrl}
                      caption={`#${d.driverId} · ${d.idNumber || "no ID"}`}
                    />
                  </div>

                  {/* Bottom row: name + badges + actions */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-[var(--card-border)] mt-auto">
                    <div className="min-w-0">
                      <div className="text-sm font-bold tracking-tight truncate" style={{color:"var(--foreground)"}}>
                        {d.driverName}
                      </div>
                      <div className="text-[10px] truncate mt-0.5" style={{color:"var(--nav-text-color)"}}>{d.phone}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <OwnerBadge sub={sub} subStatus={d.subStatus} />
                        <StatusBadge status={d.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(d); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                        style={{color:"var(--nav-text-color)"}} title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleStatus(d); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                        style={{color:"var(--nav-text-color)"}} title={d.status === "inactive" ? "Activate" : "Deactivate"}
                      >
                        {d.status === "inactive" ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(d._id as string); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                        style={{color:"var(--nav-text-color)"}} title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              }
              back={
                <div data-face="back" className="glass-card rounded-xl p-5 h-full flex flex-col overflow-hidden" style={{borderColor:"#06B6D4"}}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold uppercase tracking-wider" style={{color:"#06B6D4"}}>Licence &amp; Permit</div>
                    <FlipVertical2 className="w-3.5 h-3.5" style={{color:"var(--nav-text-color)"}} />
                  </div>
                  <div className="space-y-2.5 text-xs flex-1">
                    <ExpiryRow label="Licence Expiry" value={d.licenseExpiryDate} tone={expiryTone(d.licenseExpiryDate)} />
                    <ExpiryRow label="PDP Expiry" value={d.pdpExpiryDate} tone={expiryTone(d.pdpExpiryDate)} />
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium" style={{color:"var(--nav-text-color)"}}>Birthday</span>
                      <span style={{color:"var(--foreground)"}}>{formatBirthday(d.idNumber)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium" style={{color:"var(--nav-text-color)"}}>Member Since</span>
                      <span style={{color:"var(--foreground)"}}>{formatDate(d.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-3 pt-2.5 text-[10px]" style={{borderTop:"1px solid var(--card-border)", color:"var(--nav-text-color)"}}>
                    <FlipVertical2 className="w-3 h-3" /> Tap to flip back
                  </div>
                </div>
              }
            />
          );
        })}
      </div>

      {pagedItems.length === 0 && (
        <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
          <div className="text-4xl mb-3 opacity-30">👤</div>
          <p className="text-sm font-medium" style={{color:"var(--nav-text-color)"}}>No drivers found</p>
          <p className="text-xs mt-1" style={{color:"var(--nav-text-color)"}}>Try adjusting your search or filters</p>
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Driver"
        message="Delete this driver? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmRemoveDriver}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
