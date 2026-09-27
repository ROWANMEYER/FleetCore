"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { SheetEditor } from "@/src/components/customer-rates/SheetEditor";

/**
 * Every active customer, whether or not they have a sheet yet. Customers without one are listed alongside the rest and start a sheet on the spot, so nobody is hidden for want of existing data.
 */
const button = "rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm hover:bg-[var(--card-bg)] disabled:opacity-40";
const input = "settings-input";

export function CustomerSheets({ open, onOpen }: { open: Id<"customers"> | null; onOpen: (id: Id<"customers"> | null) => void }) {
  const { token, user } = useAuth();
  const customers = useQuery(api.customers.list, user?.role === "admin" ? {} : "skip");
  const sheets = useQuery(api.rateSheets.list, token ? { token } : "skip");
  const create = useMutation(api.rateSheets.create);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const current = useQuery(api.rateSheets.get, token && open ? { token, customerId: open } : "skip");
  if (user?.role !== "admin") return <p>Admin access is required to manage customer rates.</p>;
  if (customers === undefined) return <p>Loading customers…</p>;
  const sheetByCustomer = new Map((sheets ?? []).map(s => [s.customerId, s]));
  const term = search.trim().toLowerCase();
  const rows = customers.filter(c => c.isActive && (!term || c.name.toLowerCase().includes(term) || (c.accountNumber ?? "").toLowerCase().includes(term)));
  const editing = open ? customers.find(c => c._id === open) : null;

  async function start(customerId: Id<"customers">) {
    if (!token) return;
    setBusy(customerId); setError("");
    try { await create({ token, customerId, defaultPricingUnit: "full" }); onOpen(customerId); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start a rate sheet."); }
    finally { setBusy(""); }
  }
  return <div className="space-y-6">
    {editing && <button className={button} onClick={() => { onOpen(null); setError(""); }}>&larr; All customers</button>}
    {open && current === undefined && <p>Loading rates…</p>}
    {open && current && <SheetEditor key={current._id} token={token!} sheet={current} />}
    {open && current === null && <section className="glass-card rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">{editing?.name ?? "This customer"}</h2>
      <p>No rate sheet yet. Starting one lets you add lanes and rates straight away.</p>
      {error && <p role="alert" className="text-red-500">{error}</p>}
      <button className="rounded-lg px-4 py-2 bg-cyan-600 text-white disabled:opacity-50" disabled={!!busy} onClick={() => start(open)}>{busy ? "Starting…" : "Start a rate sheet"}</button>
    </section>}
    {!open && <>
      <label className="block max-w-xl">Search customers
        <input className={`${input} w-full mt-2`} placeholder="Name or account number" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-red-500">{error}</p>}
      <p className="text-sm text-[var(--nav-text-color)]">{rows.length} of {customers.filter(c => c.isActive).length} active customers.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead><tr><th className="p-2">Customer</th><th className="p-2">Account</th><th className="p-2">Lanes</th><th className="p-2">Effective</th><th className="p-2">Diesel</th><th className="p-2">Updated</th><th /></tr></thead>
          <tbody>{rows.map(c => {
            const sheet = sheetByCustomer.get(c._id);
            return <tr key={c._id} className="border-b border-[var(--card-border)]">
              <td className="p-2">{c.name}</td>
              <td className="p-2 text-[var(--nav-text-color)]">{c.accountNumber ?? "-"}</td>
              <td className="p-2">{sheet ? sheet.laneCount : "-"}</td>
              <td className="p-2">{sheet?.effectiveDate ?? "-"}</td>
              <td className="p-2">{sheet ? `${sheet.oldDieselPrice.toFixed(2)} → ${sheet.newDieselPrice.toFixed(2)}` : "-"}</td>
              <td className="p-2 text-[var(--nav-text-color)]">{sheet ? new Date(sheet.updatedAt).toISOString().slice(0, 10) : "-"}</td>
              <td className="p-2">{sheet ? <button className={button} onClick={() => onOpen(c._id)}>Open</button> : <button className={button} disabled={!!busy} onClick={() => start(c._id)}>{busy === c._id ? "Starting…" : "Add rates"}</button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!rows.length && <p className="text-sm text-[var(--nav-text-color)]">No customer matches that search.</p>}
    </>}
  </div>;
}
