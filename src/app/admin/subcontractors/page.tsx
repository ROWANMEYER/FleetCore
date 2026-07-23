"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { useToast } from "@/src/components/common/Toast";
import { Pagination } from "@/src/components/common/Pagination";

export default function AdminSubcontractorsPage() {
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);

  const subsQuery = useQuery(api.subcontractors.getAll, { search: search || undefined, includeInactive });
  const statsQuery = useQuery(api.subcontractors.getStats);
  const createSub = useMutation(api.subcontractors.create);
  const updateSub = useMutation(api.subcontractors.update);
  const updateStatus = useMutation(api.subcontractors.updateStatus);
  const deleteSub = useMutation(api.subcontractors.remove);

  const [newSub, setNewSub] = useState({ name: "", phone: "", email: "" });
  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const subs = subsQuery || [];
  const stats = statsQuery || { total: 0, active: 0, inactive: 0 };

  const [page, setPage] = useState(1);
  const pageSize = 15;
  const totalPages = Math.max(1, Math.ceil(subs.length / pageSize));
  const pagedSubs = subs.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, includeInactive]);

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
      if (!newSub.name.trim()) {
        addToast("Name is required", "error");
        return;
      }
      await createSub({ name: newSub.name.trim(), phone: newSub.phone || undefined, email: newSub.email || undefined });
      setNewSub({ name: "", phone: "", email: "" });
      addToast("Subcontractor created", "success");
    } catch (e: any) {
      addToast(e.message || String(e), "error");
    }
  };

  const startEdit = (s: any) => {
    setEditingId(s._id as string);
    setEditingState({ name: s.name, phone: s.phone || "", email: s.email || "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingState(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editingState) return;
    try {
      await updateSub({ id: editingId as Id<"subcontractors">, name: editingState.name, phone: editingState.phone || undefined, email: editingState.email || undefined });
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

  return (
    <div className="w-full h-full p-6 space-y-6 overflow-y-auto text-gray-900 dark:text-slate-100">
      <div>
        <h1 className="text-xl font-bold">Admin — Subcontractors</h1>
        <p className="text-xs text-gray-500 dark:text-slate-400">Manage subcontractor companies and their details.</p>
      </div>

      <div className="flex gap-4">
        <div className="bg-slate-50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">Total</div>
          <div className="text-2xl font-bold text-slate-600 dark:text-slate-100">{stats.total}</div>
        </div>
        <div className="bg-green-50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-green-600/80 mb-0.5">Active</div>
          <div className="text-2xl font-bold text-green-700">{stats.active}</div>
        </div>
        <div className="bg-gray-100/50 dark:bg-slate-950/40 border border-transparent dark:border-slate-800 rounded-lg px-4 py-2 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Inactive</div>
          <div className="text-2xl font-bold text-gray-500 dark:text-slate-200">{stats.inactive}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="border border-gray-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-80 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
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

      <div className="bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2 bg-gray-50 dark:bg-slate-950/40 px-3 py-2 border-b border-gray-200 dark:border-slate-800 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider items-center">
          <div className="col-span-1">Name</div>
          <div className="col-span-1">Phone</div>
          <div className="col-span-1">Email</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-slate-800">
          {/* New row */}
          <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
            <input
              className="col-span-1 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
              placeholder="Name"
              value={newSub.name}
              onChange={(e) => setNewSub({ ...newSub, name: e.target.value })}
            />
            <input
              className="col-span-1 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
              placeholder="Phone"
              value={newSub.phone}
              onChange={(e) => setNewSub({ ...newSub, phone: e.target.value })}
            />
            <input
              className="col-span-1 border border-gray-300 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
              placeholder="Email"
              value={newSub.email}
              onChange={(e) => setNewSub({ ...newSub, email: e.target.value })}
            />
            <div className="col-span-1" />
            <div className="col-span-1 text-right">
              <button onClick={handleCreate} className="text-xs font-medium text-gray-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:underline">Add</button>
            </div>
          </div>

          {pagedSubs.map((s: any) => {
            const isEditing = editingId === (s._id as string);
            return (
              <div key={s._id} className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2 px-3 py-2 text-xs items-center">
                {isEditing ? (
                  <>
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.name} onChange={(e) => setEditingState({ ...editingState, name: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.phone} onChange={(e) => setEditingState({ ...editingState, phone: e.target.value })} />
                    <input className="col-span-1 border rounded px-2 py-1" value={editingState.email} onChange={(e) => setEditingState({ ...editingState, email: e.target.value })} />
                    <div className="col-span-1" />
                    <div className="col-span-1 text-right space-x-2">
                      <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">Save</button>
                      <button onClick={cancelEdit} className="text-xs font-medium text-gray-600 hover:text-black hover:underline">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-1 font-medium text-gray-900 dark:text-gray-100">{s.name}</div>
                    <div className="col-span-1 text-gray-600 dark:text-slate-300">{s.phone || "—"}</div>
                    <div className="col-span-1 text-gray-600 dark:text-slate-300">{s.email || "—"}</div>
                    <div className="col-span-1">
                      <span
                        className={
                          s.status === "inactive"
                            ? "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500"
                            : "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700"
                        }
                      >
                        {s.status === "inactive" ? "Inactive" : "Active"}
                      </span>
                    </div>
                    <div className="col-span-1 text-right space-x-3">
                      <button onClick={() => startEdit(s)} className="text-xs font-medium text-gray-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:underline">Edit</button>
                      <button
                        onClick={() => toggleStatus(s)}
                        className="text-xs font-medium text-gray-600 dark:text-slate-300 hover:text-black dark:hover:text-white hover:underline"
                      >
                        {s.status === "inactive" ? "Activate" : "Deactivate"}
                      </button>
                      <button onClick={() => setDeletingId(s._id as string)} className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline">Delete</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
