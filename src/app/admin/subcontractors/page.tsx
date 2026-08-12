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
import { FlipCard } from "@/src/components/common/FlipCard";
import { FlipHint } from "@/src/components/admin/FlipHint";
import { Plus, Pencil, Trash2, Power, PowerOff, Search, X, Truck, ChevronDown, ChevronRight, DollarSign, TrendingUp, Users, Route, FlipVertical2 } from "lucide-react";

// ZAR formatter
const fmtCurrency = (n: number) =>
 new Intl.NumberFormat("en-ZA", {
 style: "currency",
 currency: "ZAR",
 maximumFractionDigits: 0,
 }).format(n);

const fmtNum = (n: number) =>
 new Intl.NumberFormat("en-ZA").format(Math.round(n));

const formatDate = (value?: string | number) => {
 if (value === undefined || value === null || value === "") return "—";
 const d = new Date(value);
 if (Number.isNaN(d.getTime())) return String(value);
 return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

const monthStart = () => {
 const d = new Date();
 const year = d.getFullYear();
 const month = d.getMonth();
 return new Date(Date.UTC(year, month, 1)).toISOString().split("T")[0];
};

const monthEnd = () => {
 const d = new Date();
 const year = d.getFullYear();
 const month = d.getMonth();
 return new Date(Date.UTC(year, month + 1, 0)).toISOString().split("T")[0];
};

export default function AdminSubcontractorsPage() {  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [kpiFilter, setKpiFilter] = useKpiFilter();
 
 // Financial summary date range (defaults to current month)
 const [finStartDate, setFinStartDate] = useState(monthStart());
 const [finEndDate, setFinEndDate] = useState(monthEnd());

 const subsQuery = useQuery(api.subcontractors.getAll, { search: search || undefined, includeInactive });
 const statsQuery = useQuery(api.subcontractors.getStats);
 const finSummaryQuery = useQuery(api.subcontractors.getFinancialSummary, {
 startDate: finStartDate,
 endDate: finEndDate,
 });
 const createSub = useMutation(api.subcontractors.create);
 const updateSub = useMutation(api.subcontractors.update);
 const updateStatus = useMutation(api.subcontractors.updateStatus);
 const deleteSub = useMutation(api.subcontractors.remove);

 const [newSub, setNewSub] = useState({ companyName: "", phone: "", email: "" });
 const { addToast } = useToast();
 const [editingId, setEditingId] = useState<string | null>(null);
 const [editingState, setEditingState] = useState<any | null>(null);
 const [deletingId, setDeletingId] = useState<string | null>(null);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [flippedId, setFlippedId] = useState<string | null>(null);
  const subs = subsQuery || [];
  const filteredSubs =
    kpiFilter === "total"
      ? subs
      : subs.filter((s: any) =>
          kpiFilter === "active" ? s.status !== "inactive" : s.status === "inactive"
        );
  const stats = statsQuery || { total: 0, active: 0, inactive: 0 };

  const [page, setPage] = useState(1);
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(filteredSubs.length / pageSize));
  const pagedSubs = filteredSubs.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, includeInactive, kpiFilter]);

 if (subsQuery === undefined || statsQuery === undefined) return <SkeletonPage />;

 const toggleStatus = async (s: any) => {
 try {
 const newStatus = s.status === "inactive" ? "active" : "inactive";
 await updateStatus({ id: s._id as Id<"subcontractors">, status: newStatus });
 addToast(`Subcontractor ${newStatus === "inactive" ? "deactivated" : "activated"}`, "success");
 } catch (e: any) {
 addToast(e.message || String(e), "error");
 }
 };

 const handleCreate = async () => {
 try {
 if (!newSub.companyName.trim()) {
 addToast("Company name is required", "error");
 return;
 }
 await createSub({ companyName: newSub.companyName.trim(), phone: newSub.phone || undefined, email: newSub.email || undefined });
 setNewSub({ companyName: "", phone: "", email: "" });
 setShowAddForm(false);
 addToast("Subcontractor created", "success");
 } catch (e: any) {
 addToast(e.message || String(e), "error");
 }
 };

 const startEdit = (s: any) => {
 setEditingId(s._id as string);
 setEditingState({ companyName: s.companyName, phone: s.phone || "", email: s.email || "" });
 };

 const cancelEdit = () => {
 setEditingId(null);
 setEditingState(null);
 };

 const saveEdit = async () => {
 if (!editingId || !editingState) return;
 try {
 await updateSub({ id: editingId as Id<"subcontractors">, companyName: editingState.companyName, phone: editingState.phone || undefined, email: editingState.email || undefined });
 addToast("Subcontractor updated", "success");
 cancelEdit();
 } catch (e: any) {
 addToast(e.message || String(e), "error");
 }
 };

 const confirmRemove = async () => {
 if (!deletingId) return;
 try {
 await deleteSub({ id: deletingId as Id<"subcontractors"> });
 addToast("Subcontractor deleted", "success");
 } catch (e: any) {
 addToast(e.message || String(e), "error");
 } finally {
 setDeletingId(null);
 }
 };

 const toggleExpanded = (id: string) => {
 setExpandedId(expandedId === id ? null : id);
 };

 return (
 <div className="w-full h-full p-4 sm:p-6 space-y-6 overflow-y-auto" style={{color:"var(--foreground)"}}>
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Subcontractors</h1>
 <p className="text-xs mt-0.5" style={{color:"var(--nav-text-color)"}}>Manage subcontractor companies and their linked vehicles</p>
 </div>
 <button
 onClick={() => setShowAddForm(!showAddForm)}
 className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm"
 >
 {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
 {showAddForm ? "Cancel" : "Add Sub"}
 </button>
 </div>  {/* Stats */}
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

 {/* Financial Summary Section */}
 {finSummaryQuery && finSummaryQuery.subcontractors.length > 0 && (
 <div className="glass-card-premium overflow-hidden">
 <div className="flex items-center justify-between px-5 py-3" style={{borderBottom:"1px solid var(--card-border)"}}>
 <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
 <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
 Financial Summary (Subcontracted Routes)
 </h3>
 <div className="flex items-center gap-2">
 <input
 type="date"
 value={finStartDate}
 onChange={(e) => setFinStartDate(e.target.value)}
 className="border border-[var(--card-border)] rounded-lg px-2 py-1 text-[10px] bg-[var(--card-bg)] text-[var(--foreground)] outline-none w-28"
 />
 <span className="text-xs text-gray-400">→</span>
 <input
 type="date"
 value={finEndDate}
 onChange={(e) => setFinEndDate(e.target.value)}
 className="border border-[var(--card-border)] rounded-lg px-2 py-1 text-[10px] bg-[var(--card-bg)] text-[var(--foreground)] outline-none w-28"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-px" style={{backgroundColor:"var(--card-border)"}}>
 <div className="px-5 py-4 flex flex-col gap-1" style={{backgroundColor:"var(--card-bg)"}}>
 <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{color:"var(--nav-text-color)"}}>
 <Users className="w-3 h-3" /> Subs Used
 </span>
 <span className="text-xl font-black" style={{color:"var(--foreground)"}}>{finSummaryQuery.summary.totalSubcontractors}</span>
 </div>
 <div className="px-5 py-4 flex flex-col gap-1" style={{backgroundColor:"var(--card-bg)"}}>
 <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{color:"var(--nav-text-color)"}}>
 <Route className="w-3 h-3" /> Routes
 </span>
 <span className="text-xl font-black" style={{color:"var(--foreground)"}}>{fmtNum(finSummaryQuery.summary.totalRoutes)}</span>
 </div>
 <div className="px-5 py-4 flex flex-col gap-1" style={{backgroundColor:"var(--card-bg)"}}>
 <span className="text-[10px] font-semibold uppercase tracking-wider" style={{color:"var(--nav-text-color)"}}>Loads</span>
 <span className="text-xl font-black" style={{color:"var(--foreground)"}}>{fmtNum(finSummaryQuery.summary.totalLoads)}</span>
 </div>
 <div className="px-5 py-4 flex flex-col gap-1" style={{backgroundColor:"var(--card-bg)"}}>
 <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600/80">Customer Revenue</span>
 <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmtCurrency(finSummaryQuery.summary.totalCustomerRevenue)}</span>
 </div>
 <div className="px-5 py-4 flex flex-col gap-1" style={{backgroundColor:"var(--card-bg)"}}>
 <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600/80">Paid to Subs</span>
 <span className="text-xl font-black text-orange-600 dark:text-orange-400">{fmtCurrency(finSummaryQuery.summary.totalSubCost)}</span>
 </div>
 <div className="px-5 py-4 flex flex-col gap-1" style={{backgroundColor:"var(--card-bg)"}}>
 <span className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 text-blue-600/80">
 <TrendingUp className="w-3 h-3" /> Gross Margin
 </span>
 <div className="flex items-baseline gap-2">
 <span className="text-xl font-black text-blue-600 dark:text-blue-400">{fmtCurrency(finSummaryQuery.summary.totalMargin)}</span>
 <span className={`text-xs font-bold ${finSummaryQuery.summary.marginPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
 ({finSummaryQuery.summary.marginPercent >= 0 ? '+' : ''}{finSummaryQuery.summary.marginPercent.toFixed(1)}%)
 </span>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Search + Filters */}
 <div className="flex items-center gap-3 flex-wrap">
 <div className="relative flex-1 max-w-xs">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{color:"var(--nav-text-color)"}} />
 <input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search by company name"
 className="w-full pl-10 pr-3 py-1.5 rounded-lg text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 backdropFilter: "blur(8px)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 />
 </div>
 <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{color:"var(--nav-text-color)"}}>
 <input
 type="checkbox"
 checked={includeInactive}
 onChange={(e) => setIncludeInactive(e.target.checked)}
 className="rounded" style={{borderColor:"var(--card-border)"}}
 />
 Include inactive
 </label>
 </div>

 {/* Add New Form */}
 {showAddForm && (
 <div className="glass-card-premium p-5 space-y-4 border-dashed">
 <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"var(--nav-text-color)"}}>New Subcontractor</h3>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <input className="rounded-lg px-3 py-2 text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 placeholder="Company name" value={newSub.companyName} onChange={(e) => setNewSub({ ...newSub, companyName: e.target.value })} />
 <input className="rounded-lg px-3 py-2 text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 placeholder="Phone" value={newSub.phone} onChange={(e) => setNewSub({ ...newSub, phone: e.target.value })} />
 <input className="rounded-lg px-3 py-2 text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 placeholder="Email" value={newSub.email} onChange={(e) => setNewSub({ ...newSub, email: e.target.value })} />
 </div>
 <div className="flex justify-end gap-2 pt-1">
 <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs font-medium transition-colors" style={{color:"var(--nav-text-color)"}}>Cancel</button>
 <button onClick={handleCreate} className="px-4 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm">Add</button>
 </div>
 </div>
 )}

 {/* Card Grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
 {pagedSubs.map((s: any) => {
 const isEditing = editingId === (s._id as string);
 const isExpanded = expandedId === (s._id as string);

 if (isEditing) {
 return (
 <div key={s._id} className="glass-card-premium p-5 space-y-3" style={{borderColor:"#06B6D4"}}>
 <h3 className="text-xs font-semibold uppercase tracking-wider" style={{color:"#06B6D4"}}>Editing</h3>
 <input className="w-full rounded-lg px-3 py-2 text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 value={editingState.companyName} onChange={(e) => setEditingState({ ...editingState, companyName: e.target.value })} placeholder="Company name" />
 <input className="w-full rounded-lg px-3 py-2 text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 value={editingState.phone} onChange={(e) => setEditingState({ ...editingState, phone: e.target.value })} placeholder="Phone" />
 <input className="w-full rounded-lg px-3 py-2 text-xs outline-none transition-all"
 style={{
 border: "1px solid var(--card-border)",
 background: "var(--card-bg)",
 color: "var(--foreground)",
 }}
 onFocus={(e) => e.target.style.borderColor = "#06B6D4"}
 onBlur={(e) => e.target.style.borderColor = "var(--card-border)"}
 value={editingState.email} onChange={(e) => setEditingState({ ...editingState, email: e.target.value })} placeholder="Email" />
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

 const isFlipped = flippedId === (s._id as string);

 return (
 <FlipCard
 key={s._id}
 flipped={isFlipped}
 onToggle={() => setFlippedId(isFlipped ? null : (s._id as string))}
 className="h-full"
 front={
 <div data-face="front" className="group glass-card rounded-xl p-5 h-full relative hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
 {/* Top row */}
 <div className="flex items-start justify-between gap-2 mb-3">
 <div className="text-lg font-bold tracking-tight min-w-0 truncate" style={{color:"var(--foreground)"}}>
 {s.companyName}
 </div>
 <div className="flex items-center gap-2 shrink-0">
 <FlipHint variant="inline" />
 <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
 <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title="Edit">
 <Pencil className="w-3.5 h-3.5" />
 </button>
 <button onClick={(e) => { e.stopPropagation(); toggleStatus(s); }} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title={s.status === "inactive" ? "Activate" : "Deactivate"}>
 {s.status === "inactive" ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
 </button>
 <button onClick={(e) => { e.stopPropagation(); setDeletingId(s._id as string); }} className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors" style={{color:"var(--nav-text-color)"}} title="Delete">
 <Trash2 className="w-3.5 h-3.5" />
 </button>
 </div>
 </div>
 </div>

 {/* Details */}
 <div className="space-y-2 text-xs">
 <div className="flex items-center gap-2" style={{color:"var(--nav-text-color)"}}>
 <span className="font-medium min-w-[60px]" style={{color:"var(--nav-text-color)"}}>Phone</span>
 <span style={{color:"var(--foreground)"}}>{s.phone || "—"}</span>
 </div>
 <div className="flex items-center gap-2">
 <span className="font-medium min-w-[60px]" style={{color:"var(--nav-text-color)"}}>Email</span>
 <span style={{color:"var(--foreground)"}} className="truncate">{s.email || "—"}</span>
 </div>
 </div>

 {/* Badges row */}
 <div className="flex flex-wrap items-center gap-2 mt-4 pt-3" style={{borderTop:"1px solid var(--card-border)"}}>
 <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
 s.status === "inactive"
 ? "bg-[var(--card-bg)] text-gray-500 dark:text-slate-400"
 : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
 }`}>
 {s.status === "inactive" ? "Inactive" : "Active"}
 </span>
 <span className="inline-flex items-center gap-1 text-xs" style={{color:"var(--nav-text-color)"}}>
 <Truck className="w-3 h-3" /> {s.truckCount || 0}
 </span>
 <span className="inline-flex items-center gap-1 text-xs" style={{color:"var(--nav-text-color)"}}>
 <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
 <rect x="2" y="4" width="20" height="16" rx="2" />
 <path d="M8 8h8" />
 <path d="M8 12h6" />
 </svg>
 {s.trailerCount || 0}
 </span>
 </div>

 {/* Expanded vehicles */}
 {isExpanded && (
 <div className="mt-4 pt-3 space-y-3" style={{borderTop:"1px solid var(--card-border)"}}>
 <div>
 <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{color:"var(--nav-text-color)"}}>
 <Truck className="w-3 h-3" /> Trucks ({s.truckCount || 0})
 </h4>
 {s.truckFleetNos && s.truckFleetNos.length > 0 ? (
 <div className="flex flex-wrap gap-1">
 {s.truckFleetNos.map((fn: string, i: number) => (
 <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{fn}</span>
 ))}
 </div>
 ) : (
 <span className="text-xs italic" style={{color:"var(--nav-text-color)"}}>No trucks linked</span>
 )}
 </div>
 <div>
 <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{color:"var(--nav-text-color)"}}>
 <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
 <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M8 8h8" /><path d="M8 12h6" />
 </svg>
 Trailers ({s.trailerCount || 0})
 </h4>
 {s.trailerFleetNos && s.trailerFleetNos.length > 0 ? (
 <div className="flex flex-wrap gap-1">
 {s.trailerFleetNos.map((fn: string, i: number) => (
 <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">{fn}</span>
 ))}
 </div>
 ) : (
 <span className="text-xs italic" style={{color:"var(--nav-text-color)"}}>No trailers linked</span>
 )}
 </div>
 </div>
 )}

 {/* Expand toggle */}
 <button
 onClick={(e) => { e.stopPropagation(); toggleExpanded(s._id as string); }}
 className="mt-3 w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors rounded-lg"
 style={{color:"var(--nav-text-color)"}}
 >
 {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
 {isExpanded ? "Hide vehicles" : `Show vehicles (${(s.truckCount || 0) + (s.trailerCount || 0)})`}
 </button>
 </div>
 }
 back={
 <div data-face="back" className="glass-card rounded-xl p-5 h-full flex flex-col overflow-hidden" style={{borderColor:"#06B6D4"}}>
 <div className="flex items-center justify-between mb-3">
 <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{color:"#06B6D4"}}>
 <DollarSign className="w-3.5 h-3.5" /> Financial Summary
 </div>
 <FlipVertical2 className="w-3.5 h-3.5" style={{color:"var(--nav-text-color)"}} />
 </div>
 {(() => {
 const finData = finSummaryQuery?.subcontractors?.find(
 (f: any) => f.subcontractorId === s._id
 );
 if (!finData || finData.routeCount === 0) {
 return (
 <div className="flex-1 flex items-center justify-center text-xs italic" style={{color:"var(--nav-text-color)"}}>
 No subcontracted routes this period
 </div>
 );
 }
 const margin = finData.totalCustomerRevenue - finData.totalSubCost;
 const marginPct = finData.totalCustomerRevenue > 0
 ? (margin / finData.totalCustomerRevenue) * 100
 : 0;
 return (
 <div className="space-y-2.5 text-xs flex-1">
 <div className="flex items-center justify-between">
 <span style={{color:"var(--nav-text-color)"}}>Routes</span>
 <span className="font-semibold" style={{color:"var(--foreground)"}}>{finData.routeCount}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-emerald-600/80 font-medium">Customer Revenue</span>
 <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(finData.totalCustomerRevenue)}</span>
 </div>
 <div className="flex items-center justify-between">
 <span className="text-orange-600/80 font-medium">Sub Cost</span>
 <span className="font-semibold text-orange-600 dark:text-orange-400">{fmtCurrency(finData.totalSubCost)}</span>
 </div>
 <div className="flex items-center justify-between pt-1" style={{borderTop:"1px dashed var(--card-border)"}}>
 <span className="text-blue-600/80 font-medium">Margin</span>
 <span className={`font-bold ${margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
 {fmtCurrency(margin)} ({marginPct >= 0 ? '+' : ''}{marginPct.toFixed(1)}%)
 </span>
 </div>
 <div className="flex items-center justify-between">
 <span className="font-medium" style={{color:"var(--nav-text-color)"}}>Member Since</span>
 <span style={{color:"var(--foreground)"}}>{formatDate(s.createdAt)}</span>
 </div>
 </div>
 );
 })()}
 <div className="flex items-center justify-center gap-1 mt-3 pt-2.5 text-[10px]" style={{borderTop:"1px solid var(--card-border)", color:"var(--nav-text-color)"}}>
 <FlipVertical2 className="w-3 h-3" /> Tap to flip back
 </div>
 </div>
 }
 />
 );
 })}
 </div>

 {/* Empty state */}
 {pagedSubs.length === 0 && (
 <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
 <div className="text-4xl mb-3 opacity-30">🏢</div>
 <p className="text-sm font-medium" style={{color:"var(--nav-text-color)"}}>No subcontractors found</p>
 <p className="text-xs mt-1" style={{color:"var(--nav-text-color)"}}>Try adjusting your search or filters</p>
 </div>
 )}

 <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

 <ConfirmDialog
 open={deletingId !== null}
 title="Delete Subcontractor"
 message="Delete this subcontractor? This cannot be undone."
 confirmLabel="Delete"
 variant="danger"
 onConfirm={confirmRemove}
 onCancel={() => setDeletingId(null)}
 />
 </div>
 );
}
