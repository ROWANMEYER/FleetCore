"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { CeramicReportRow } from "@/src/lib/ceramic-tiles/reportExport";
import { ceramicStopsCharge, emptyCeramicBilling } from "@/src/lib/ceramic-tiles/monthlyReport";
import { ceramicDeliveryStops, ceramicMainBilling } from "@/src/lib/ceramic-tiles/reportEditing";
import { ModalShell } from "@/src/components/common/ModalShell";

const field = "mt-1 min-h-11 w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm";
const text = (n: number | null | undefined) => n === null || n === undefined ? "" : String(n);

export function CeramicBillingEditor({ row, token, onClose, mode = "main" }: {
  row: CeramicReportRow; token: string; onClose: () => void; mode?: "main" | "local";
}) {
  const original = row.billing ?? emptyCeramicBilling();
  const [rate, setRate] = useState(text(original.ratePerTon));
  const [stopCharge, setStopCharge] = useState(text(ceramicStopsCharge(original)));
  const [stopChargeChanged, setStopChargeChanged] = useState(false);
  const [load, setLoad] = useState(original.load);
  const [locals, setLocals] = useState(() => row.locals.map(leg => {
    const saved = original.locals.find(local => local.key === leg.key);
    return { key: leg.key, name: leg.name, from: saved?.from ?? "", to: saved?.to ?? "", price: text(saved?.price) };
  }));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const save = useMutation(api.ceramicTiles.saveReportBilling);
  const deliveryStops = ceramicDeliveryStops(row.toLocations);
  const money = (value: string) => {
    if (!value.trim()) return null;
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Enter valid amounts or leave missing amounts blank.");
    return n;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      const billing = mode === "main"
        ? ceramicMainBilling(original, { ratePerTon: money(rate), stopCharge: money(stopCharge), stopChargeChanged, load }, row.locals.map(leg => leg.key))
        : { ...original, locals: locals.map(({ key, from, to, price }) => ({ key, from, to, price: money(price) })) };
      await save({ token, region: row.region, shipmentId: row.shipmentId, expectedVersion: row.version,
        expectedBillingUpdatedAt: row.billingUpdatedAt ?? 0, billing });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save amounts."); }
    finally { setSaving(false); }
  };
  return <ModalShell open onClose={() => { if (!saving) onClose(); }} className="max-w-2xl" portal autoFocus>
    <form onSubmit={event => void submit(event)} className="max-h-[85dvh] overflow-y-auto p-5 text-[var(--foreground)]">
      <h2 className="text-lg font-semibold">{mode === "main" ? "Amounts" : "Local amounts"} for {row.shipmentNumber}</h2>
      {mode === "main" ? <>
        <p className="mt-1 text-xs text-[var(--nav-text-color)]">Freight = rate per ton × 34. Blank means not entered. Stop charging rules are awaiting confirmation.</p>
        <details className="mt-4 rounded-lg border border-[var(--card-border)] p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Delivery stops from PDF: {deliveryStops.length}</summary>
          <p className="mt-2 text-xs text-[var(--nav-text-color)]">Collections are excluded. Multiple orders at the same delivery location count once.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">{deliveryStops.map(stop => <li key={stop}>{stop}</li>)}</ol>
        </details>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">Rate per ton (R)<input inputMode="decimal" className={field} value={rate} disabled={saving} onChange={e => setRate(e.target.value)} /></label>
          <label className="text-sm">Stops charge (R)<input inputMode="decimal" className={field} value={stopCharge} disabled={saving} onChange={e => { setStopCharge(e.target.value); setStopChargeChanged(true); }} /></label>
        </div>
        <label className="mt-3 block text-sm">Load<input className={field} maxLength={200} value={load} disabled={saving} onChange={e => setLoad(e.target.value)} /></label>
      </> : <section className="mt-5 space-y-3" aria-label="Local load amounts">
        {locals.map((local, index) => <fieldset key={local.key} className="rounded-lg border border-[var(--card-border)] p-3">
          <legend className="px-1 text-xs font-semibold">{local.name}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{([['from', 'Van'], ['to', 'Na'], ['price', 'Prys (R)']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}
            <input className={field} value={local[key]} maxLength={key === 'price' ? 30 : 200} inputMode={key === 'price' ? 'decimal' : 'text'} disabled={saving}
              onChange={e => setLocals(values => values.map((value, i) => i === index ? { ...value, [key]: e.target.value } : value))} />
          </label>)}</div>
        </fieldset>)}
      </section>}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{error}</p>}
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="min-h-11 rounded-lg border border-[var(--card-border)] px-4 text-sm" disabled={saving} onClick={onClose}>Cancel</button>
        <button type="submit" className="min-h-11 rounded-lg bg-[#0891B2] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={saving}>{saving ? 'Saving…' : 'Save amounts'}</button>
      </div>
    </form>
  </ModalShell>;
}
