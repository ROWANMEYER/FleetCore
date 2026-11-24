"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { DEFAULT_CERAMIC_BILLING } from "@/src/lib/ceramic-tiles/billing";
import { ceramicErrorMessage } from "@/src/lib/ceramic-tiles/assignmentAccess";
const labels = { defaultTons: "Default chargeable tons", extraStopPrice: "Additional pickup / drop (R)", localSmallPrice: "Local small load (R)", localLargePrice: "Local large load (R)", localMaxWeightKg: "Local small-load limit (kg)", localMaxPallets: "Local small-load limit (pallets)", billingStartDay: "Billing period start day" };
export function CeramicBillingSettings() {
  const { user, token } = useAuth(); const [open, setOpen] = useState(false), [day, setDay] = useState(ceramicPlanningDate());
  const data = useQuery(api.ceramicBilling.settings, token && user?.role === "admin" && open ? { token, effectiveDate: day } : "skip");
  if (user?.role !== "admin") return null;
  return <details className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3" onToggle={event => setOpen(event.currentTarget.open)}><summary className="min-h-9 cursor-pointer text-sm font-semibold">Ceramic billing settings</summary>
    <label className="mt-3 block text-sm">Effective from<input type="date" value={day} onChange={event => { if (event.target.value) setDay(event.target.value); }} className="ml-3 min-h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2" /></label>
    {token && data ? <SettingsForm key={`${day}:${data.config.version}`} token={token} day={day} config={data.config} customers={data.customers} /> : open && <p role="status" className="mt-3 text-sm">Loading settings...</p>}
  </details>;
}
function SettingsForm({ token, day, config, customers }: { token: string; day: string; config: typeof DEFAULT_CERAMIC_BILLING & { version: string; customerId?: Id<"customers"> }; customers: { id: Id<"customers">; name: string }[] }) {
  const [values, setValues] = useState(() => Object.fromEntries(Object.keys(labels).map(key => [key, String(config[key as keyof typeof labels])])));
  const [customer, setCustomer] = useState(config.customerId ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const save = useMutation(api.ceramicBilling.saveSettings);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(""); setSuccess(""); setBusy(true); try { const numbers = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() ? Number(value.replace(",", ".")) : NaN])) as typeof DEFAULT_CERAMIC_BILLING; if (Object.values(numbers).some(n => !Number.isFinite(n))) throw new Error("Complete every amount and limit."); await save({ token, effectiveDate: day, expectedVersion: config.version, customerId: customer as Id<"customers">, ...numbers }); setSuccess("Effective-dated billing settings saved. Confirmed shipment amounts were preserved."); } catch (cause) { setError(ceramicErrorMessage(cause, "Could not save billing settings.")); } finally { setBusy(false); } };
  const field = "mt-1 min-h-10 w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] px-3 text-sm";
  return <form onSubmit={event => void submit(event)} className="mt-3 space-y-3"><p className="text-xs text-[var(--nav-text-color)]">New rules apply by planning date. Confirmed shipments retain their saved prices. Local small-load pricing requires both limits to be met.</p><label className="block text-sm">Ceramic customer rate sheet<select required className={field} value={customer} onChange={event => setCustomer(event.target.value as Id<"customers">)} disabled={busy}><option value="">Choose rate sheet</option>{customers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.entries(labels) as [keyof typeof labels, string][]).map(([key, label]) => <label key={key} className="text-sm">{label}<input required className={field} inputMode="decimal" value={values[key]} disabled={busy} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>{error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}{success && <p role="status" className="text-sm text-[var(--success-text)]">{success}</p>}<button type="submit" disabled={busy || !customer} className="min-h-10 rounded-lg bg-[#0891B2] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save effective-dated settings"}</button></form>;
}
