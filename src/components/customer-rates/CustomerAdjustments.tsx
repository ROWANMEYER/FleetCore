"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { customerRateOnDate, currentCustomerAdjustments, type CustomerAdjustment } from "@/src/lib/fuel/customerAdjustments";
import { formatCurrency } from "@/src/pdf/formatters";
const input = "settings-input";
const button = "rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-40";
export function CustomerAdjustments({ sheet, token, notices, defaultDate, revision, disabled, onSaved, onBusyChange }: {
  sheet: Doc<"rateSheets">; token: string; notices: CustomerAdjustment[]; defaultDate: string; revision: number; disabled: boolean;
  onSaved: (revision: number) => void; onBusyChange: (busy: boolean) => void;
}) {
  const current = currentCustomerAdjustments(notices.filter(n => n.sheetId === sheet._id));
  const initial = current.find(n => n.effectiveDate === defaultDate);
  const [date, setDate] = useState(defaultDate), [percentage, setPercentage] = useState(initial?.percentage == null ? "" : String(initial.percentage));
  const [reference, setReference] = useState(initial?.reference ?? ""), [exact, setExact] = useState<Record<string,string>>(() => Object.fromEntries(initial?.rates.map(r => [r.laneId,String(r.rate)]) ?? []));
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const save = useMutation(api.rateSheets.saveCustomerAdjustment);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const rates = Object.entries(exact).filter(([,value]) => value.trim()).map(([laneId,value]) => ({ laneId, rate: Number(value.replace(",",".")) }));
  const value = percentage.trim() ? Number(percentage.replace(",",".")) : null;
  const valid = (value === null || Number.isFinite(value) && value >= -100 && value <= 1000) && rates.every(r => Number.isFinite(r.rate) && r.rate >= 0 && r.rate <= 1e9);
  const proposed: CustomerAdjustment = { _id: "preview", sheetId: sheet._id, effectiveDate: date, percentage: value, rates, reference, recordedAt: Number.MAX_SAFE_INTEGER };
  const replacement = current.find(n => n.effectiveDate === date);
  const sorted = (values: {laneId:string;rate:number}[]) => [...values].sort((a,b) => a.laneId.localeCompare(b.laneId));
  const unchanged = !!replacement && replacement.percentage === value && replacement.reference === reference.trim() && JSON.stringify(sorted(replacement.rates)) === JSON.stringify(sorted(rates));
  const dirty = !unchanged && (!!percentage.trim() || !!reference.trim() || rates.length > 0);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const changeDate = (day: string) => { const previous = current.find(n => n.effectiveDate === day); setDate(day); setPercentage(previous?.percentage == null ? "" : String(previous.percentage)); setReference(previous?.reference ?? ""); setExact(Object.fromEntries(previous?.rates.map(r => [r.laneId,String(r.rate)]) ?? [])); setError(""); setSaved(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || disabled || unchanged) return; setError(""); setSaved("");
    if (!valid || value === null && !rates.length) { setError("Enter a valid percentage, individual rates, or both. Use 0% for an unchanged notice."); return; }
    setBusy(true);
    try { const result = await save({ token, customerId: sheet.customerId, expectedRevision: revision, effectiveDate: date, percentage: value, rates, reference }); onSaved(result.revision); setSaved("Customer update saved. Other customers and existing confirmed bills were preserved."); }
    catch (cause) { const e = cause as { data?: unknown; message?: string }; setError(typeof e.data === "string" ? e.data : e.message ?? "Could not save the customer update."); }
    finally { setBusy(false); }
  };
  return <section className="glass-card rounded-xl p-5 space-y-3" aria-label="Customer-supplied rate adjustments">
    <h2 className="font-semibold">Customer-supplied rate updates</h2>
    <p className="text-sm text-[var(--nav-text-color)]">Enter a percentage for all eligible lanes, exact prices for selected lanes, or both. Exact prices take precedence. Blank exact prices retain the percentage-adjusted or previous rate. These tariffs do not follow company fuel changes.</p>
    {disabled && <p role="status" className="text-sm text-amber-500">Save the agreement and starting-tariff edits above before adding a customer update.</p>}
    <form onSubmit={event => void submit(event)}><fieldset disabled={disabled || busy} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Adjustment effective date<input aria-label="Customer adjustment effective date" type="date" required value={date} onChange={event => changeDate(event.target.value)} className={`${input} mt-1 w-full`} /></label><label className="text-sm">Rate change (%)<input aria-label="Customer rate change percentage" inputMode="decimal" placeholder="e.g. 5.58 or -1.90" value={percentage} onChange={event => {setPercentage(event.target.value);setSaved("");}} className={`${input} mt-1 w-full`} /></label><label className="text-sm">Customer notice reference<input aria-label="Customer notice reference" required maxLength={500} value={reference} onChange={event => {setReference(event.target.value);setSaved("");}} placeholder="Email date / rate-sheet reference" className={`${input} mt-1 w-full`} /></label></div>
      {replacement && <p className="text-sm text-amber-500">A notice already exists for this date. Saving creates a corrected notice that replaces the entire earlier notice for that day; both remain in history.</p>}
      <div className="max-h-[50vh] overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Lane</th><th className="p-2">Previous rate</th><th className="p-2">Exact customer rate</th><th className="p-2">New rate</th></tr></thead><tbody>{sheet.lanes.map(lane => {
        const earlier = notices.filter(n => n.sheetId === sheet._id && n.effectiveDate < date);
        const before = customerRateOnDate(lane.rate,lane.date || sheet.effectiveDate || "",date,lane.id,earlier);
        const after = valid ? customerRateOnDate(lane.rate,lane.date || sheet.effectiveDate || "",date,lane.id,[...earlier,proposed]) : null;
        return <tr key={lane.id} className="border-t border-[var(--card-border)]"><td className="p-2">{lane.loadingPoint}<span className="block font-semibold">{lane.destination}</span></td><td className="p-2 whitespace-nowrap">{before == null ? "Not effective yet" : formatCurrency(before)}</td><td className="p-2"><input aria-label={`Exact customer rate for ${lane.loadingPoint} to ${lane.destination}`} inputMode="decimal" placeholder="Keep calculated rate" value={exact[lane.id] ?? ""} onChange={event => { setExact(old => ({ ...old, [lane.id]: event.target.value })); setSaved(""); }} className={`${input} w-40`} /></td><td className="p-2 whitespace-nowrap font-semibold">{after == null ? "Needs review" : formatCurrency(after)}</td></tr>;
      })}</tbody></table></div>
      {!valid && <p role="alert" className="text-red-500">Check the percentage and exact prices.</p>}
      {error && <p role="alert" className="text-red-500">{error}</p>}{saved && <p role="status" className="text-green-500">{saved}</p>}
      <button type="submit" className={`${button} bg-cyan-600 text-white`} disabled={unchanged || !valid || !reference.trim() || value === null && !rates.length}>{busy ? "Saving…" : replacement ? "Save corrected customer update" : "Save customer update"}</button>
    </fieldset></form>
    <details><summary className="cursor-pointer text-sm font-semibold">Customer update history ({notices.filter(n => n.sheetId === sheet._id).length})</summary><div className="mt-2 space-y-2">{[...notices].filter(n => n.sheetId === sheet._id).reverse().map(notice => <p key={notice._id} className="text-xs">{notice.effectiveDate} · {notice.percentage == null ? "Individual prices" : `${notice.percentage}%`}{notice.rates.length ? ` · ${notice.rates.length} exact price(s)` : ""} · {notice.reference}{current.find(n => n.effectiveDate === notice.effectiveDate)?._id !== notice._id ? " · Superseded" : ""}</p>)}</div></details>
  </section>;
}
