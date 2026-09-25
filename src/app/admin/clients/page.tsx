"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { type Doc } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useKpiFilter, type KpiFilter } from "@/src/lib/useKpiFilter";
import { filterClients } from "@/src/lib/clients/searchClients";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { useToast } from "@/src/components/common/Toast";
import { Pagination } from "@/src/components/common/Pagination";
import ClientFormDialog from "@/src/components/admin/ClientFormDialog";
import { Handshake, Plus, Pencil, Power, Search, Shield } from "lucide-react";

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: isActive ? "var(--color-accent-emerald)" : "var(--card-border)",
        color: "#fff",
      }}
    >
      {isActive ? "ACTIVE" : "INACTIVE"}
    </span>
  );
}

function Dash({ value }: { value?: string }) {
  if (value && value.trim().length > 0) return <span>{value}</span>;
  return <span className="text-[var(--card-border)]">—</span>;
}

export default function AdminClientsPage() {
  const { token, user: me } = useAuth();
  const { addToast } = useToast();

  const customers = useQuery(api.customers.list, {});
  const deactivateCustomer = useMutation(api.customers.deactivateCustomer);

  const [search, setSearch] = useState("");
  const [kpiFilter, setKpiFilter] = useKpiFilter();
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"customers"> | null>(null);
  const [deactivating, setDeactivating] = useState<Doc<"customers"> | null>(null);
  const [busy, setBusy] = useState(false);

  const pageSize = 20;

  const rows = useMemo(() => customers ?? [], [customers]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((c) => c.isActive).length,
      inactive: rows.filter((c) => !c.isActive).length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const status: "all" | "active" | "inactive" = kpiFilter === "total" ? "all" : kpiFilter;
    return filterClients(rows, search, status);
  }, [rows, search, kpiFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [search, kpiFilter]);

  if (!me || me.role !== "admin") {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6">
          <div className="glass-card rounded-xl p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mb-4">
              <Shield size={24} className="text-[#06B6D4]" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Admins only
            </h2>
            <p className="text-sm text-[var(--nav-text-color)] mt-2">
              Client management is restricted to administrators.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (customers === undefined) return <SkeletonPage />;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Doc<"customers">) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const handleToggle = async (c: Doc<"customers">) => {
    if (!token || busy) return;
    if (c.isActive) {
      setDeactivating(c);
      return;
    }
    setBusy(true);
    try {
      await deactivateCustomer({ id: c._id, isActive: true, token });
      addToast(`Client ${c.name} activated. It is now available for Quick Capture again.`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async () => {
    if (!token || !deactivating) return;
    setBusy(true);
    try {
      await deactivateCustomer({ id: deactivating._id, isActive: false, token });
      addToast(`Client ${deactivating.name} deactivated.`, "success");
      setDeactivating(null);
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const kpiButtons: { key: KpiFilter; label: string; count: number }[] = [
    { key: "total", label: "Total", count: counts.total },
    { key: "active", label: "Active", count: counts.active },
    { key: "inactive", label: "Inactive", count: counts.inactive },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.3)]">
              <Handshake size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                Clients
              </h1>
              <p className="text-sm text-[var(--nav-text-color)] mt-0.5">
                Manage transport customers used across FleetCore
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 max-w-sm">
          {kpiButtons.map(({ key, label, count }) => {
            const isActive = kpiFilter === key;
            return (
              <button
                key={key}
                onClick={() => setKpiFilter(kpiFilter === key ? "total" : key)}
                className={`glass-card rounded-xl px-3 py-2 text-left transition-all cursor-pointer ${
                  isActive ? "ring-2 ring-[#06B6D4]/50" : ""
                }`}
              >
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5 truncate text-[var(--nav-text-color)]">
                  {label}
                </div>
                <div
                  className={`text-xl font-black ${
                    key === "active" ? "text-emerald-500" : ""
                  }`}
                  style={{ color: key !== "active" ? "var(--foreground)" : undefined }}
                >
                  {count}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--nav-text-color)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, account, contact, phone, email, VAT..."
              className="w-full pl-10 pr-3 py-1.5 rounded-lg text-xs settings-input"
            />
          </div>
          <select
            value={kpiFilter}
            onChange={(e) => setKpiFilter(e.target.value as KpiFilter)}
            className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
            style={{
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              color: "var(--foreground)",
              backdropFilter: "blur(8px)",
            }}
          >
            <option value="total">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
            <div className="text-4xl mb-3 opacity-30">🤝</div>
            <p className="text-sm font-medium text-[var(--nav-text-color)]">
              No clients found
            </p>
            <p className="text-xs mt-1 text-[var(--nav-text-color)]">
              Click Add Client to create the first one
            </p>
          </div>
        ) : (
          <>
            {paged.length === 0 ? (
              <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
                <div className="text-4xl mb-3 opacity-30">🔍</div>
                <p className="text-sm font-medium text-[var(--nav-text-color)]">
                  No clients match your search
                </p>
                <p className="text-xs mt-1 text-[var(--nav-text-color)]">
                  Try adjusting the search or status filter
                </p>
              </div>
            ) : (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--nav-text-color)] border-b border-[var(--card-border)]">
                        <th className="px-4 py-3 font-semibold">Client</th>
                        <th className="px-4 py-3 font-semibold">Account No.</th>
                        <th className="px-4 py-3 font-semibold">Contact</th>
                        <th className="px-4 py-3 font-semibold">Phone</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                      {paged.map((c) => (
                        <tr
                          key={c._id}
                          className="hover:bg-[var(--card-bg)]/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[var(--foreground)]">
                              {c.name}
                            </div>
                            {c.vatNumber && (
                              <div className="text-[11px] text-[var(--nav-text-color)] mt-0.5">
                                VAT {c.vatNumber}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[var(--nav-text-color)]">
                            <Dash value={c.accountNumber} />
                          </td>
                          <td className="px-4 py-3 text-[var(--foreground)]">
                            <Dash value={c.contactPerson} />
                          </td>
                          <td className="px-4 py-3 text-[var(--nav-text-color)]">
                            <Dash value={c.phone} />
                          </td>
                          <td className="px-4 py-3 text-[var(--nav-text-color)]">
                            <Dash value={c.email} />
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill isActive={c.isActive} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 shrink-0">
                              <button
                                onClick={() => openEdit(c)}
                                title="Edit client"
                                aria-label={`Edit ${c.name}`}
                                className="p-2 rounded-lg text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggle(c)}
                                disabled={busy}
                                title={c.isActive ? "Deactivate client" : "Activate client"}
                                aria-label={`${c.isActive ? "Deactivate" : "Activate"} ${c.name}`}
                                className="p-2 rounded-lg text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] hover:text-[#06B6D4] transition-colors disabled:opacity-40"
                              >
                                <Power className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {filtered.length > pageSize && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            )}
          </>
        )}

        <ClientFormDialog
          open={dialogOpen}
          editing={editing}
          onClose={() => setDialogOpen(false)}
        />

        <ConfirmDialog
          open={deactivating !== null}
          title="Deactivate Client"
          message={`Deactivate ${deactivating?.name}? The client will no longer be available for new Quick Capture matching, but existing historical records remain unchanged.`}
          confirmLabel="Deactivate"
          variant="danger"
          loading={busy}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivating(null)}
        />
      </div>
    </div>
  );
}