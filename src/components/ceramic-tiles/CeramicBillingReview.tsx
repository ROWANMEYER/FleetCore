"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ceramicErrorMessage } from "@/src/lib/ceramic-tiles/assignmentAccess";
import { formatCurrency } from "@/src/pdf/formatters";
const field = "mt-1 min-h-11 w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--foreground)]";
const amount = (n: number | null) => n === null ? "Needs review" : formatCurrency(n);
export function CeramicBillingReview({ shipmentId, onReadyChange, onSaved, onInteractionChange }: { shipmentId: Id<"ceramicShipments">; onReadyChange?: (ready: boolean) => void; onSaved?: () => void; onInteractionChange?: (state: { dirty: boolean; saving: boolean }) => void }) {
  const { token } = useAuth();
  const [tons, setTons] = useState<string | null>(null), [tariffKey, setTariffKey] = useState<string | undefined>();
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const number = Number((tons ?? "").replace(",", ".")), validTons = tons === null || !!tons.trim() && Number.isFinite(number) && number > 0 && number <= 1000;
  const preview = useQuery(api.ceramicBilling.preview, token ? { token, shipmentId, ...(tons !== null && tons.trim() && validTons ? { chargeableTons: number } : {}), ...(tariffKey ? { tariffKey } : {}) } : "skip");
  const save = useMutation(api.ceramicBilling.confirm);
  const saved = preview?.saved;
  const townRulesAvailable = typeof preview?.calculation.pickupTownCount !== "undefined" && preview.destinationChecks !== undefined;
  const edited = !!saved && (tons !== null && number !== saved.chargeableTons || tariffKey !== undefined && tariffKey !== saved.tariffKey);
  const ready = !token || !!preview?.readOnly || !!preview && townRulesAvailable && !preview.ruleIssues.length && validTons && !edited && !!saved && saved.status !== "legacy" && saved.sourceVersion === preview.version && saved.routeDate === preview.routeDate;
  const dirty = edited || !saved && (tons !== null || tariffKey !== undefined);
  useEffect(() => { onInteractionChange?.({ dirty, saving }); }, [dirty, saving, onInteractionChange]);
  useEffect(() => () => onInteractionChange?.({ dirty: false, saving: false }), [onInteractionChange]);
  const calculationSaved = !!preview && preview.saved?.fingerprint === preview.fingerprint;
  useEffect(() => { onReadyChange?.(ready && !saving); }, [ready, saving, onReadyChange]);
  const confirm = async (markForReview: boolean) => {
    if (!token || !preview || !townRulesAvailable || preview.readOnly || !validTons || saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const result = await save({ token, shipmentId, expectedVersion: preview.version, expectedAssignmentUpdatedAt: preview.assignmentUpdatedAt, expectedBillingUpdatedAt: preview.billingUpdatedAt, expectedFingerprint: preview.fingerprint, chargeableTons: preview.calculation.chargeableTons, ...(preview.selected ? { tariffKey: preview.selected.key } : {}), markForReview });
      setSuccess(result.complete ? "Billing saved. Main freight and extra stops updated in Daily Planner; local transport saved to reports only." : "Billing flagged for review. Driver instructions may proceed; Planner amounts were preserved.");
      onSaved?.();
    } catch (cause) { setError(ceramicErrorMessage(cause, "Could not save billing. Review the current values and try again.")); }
    finally { setSaving(false); }
  };
  if (preview?.readOnly) return <section aria-label="Read-only internal Ceramic billing" className="space-y-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-[var(--foreground)] sm:p-4">
    <h3 className="text-base font-semibold">Internal billing</h3><p className="text-sm text-[var(--nav-text-color)]">This historical, removed, completed, locked or invoiced Planner load is read-only. Its saved prices are retained. Driver instructions remain available.</p>
    {saved ? <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-sm"><dt>Saved tariff / chargeable tons</dt><dd className="text-right">{amount(saved.ratePerTon)} / t | {saved.chargeableTons} t</dd><dt>Saved main billing</dt><dd className="text-right">{amount(saved.mainTotal)}</dd><dt>Saved local transport</dt><dd className="text-right">{amount(saved.localTotal)}</dd></dl> : <p className="text-sm text-[var(--warning-text)]">No saved billing amounts are recorded for this load. They have not been inferred or replaced.</p>}
  </section>;
  return <section aria-label="Internal Ceramic billing review" className="space-y-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-[var(--foreground)] sm:p-4">
    <div><h3 className="text-base font-semibold">Internal billing</h3><p className="mt-1 text-xs text-[var(--nav-text-color)]">For billing and reports only. Prices are excluded from the driver message.</p></div>
    {!token ? <p className="text-sm text-[var(--nav-text-color)]">Sign in to review and confirm internal billing.</p> : !preview || !townRulesAvailable ? <p role="status" className="text-sm">Loading applicable rates and charges...</p> : <>
      {preview.readOnly && <p role="status" className="text-sm text-[var(--nav-text-color)]">Billing is read-only for this historical, removed, completed, locked or invoiced Planner load. Saved prices are retained and driver instructions remain available.</p>}
      {preview.saved && <p className="rounded-lg bg-[var(--surface-sunken)] p-2 text-xs text-[var(--nav-text-color)]">Saved: {preview.saved.tariffLabel} | {preview.saved.chargeableTons} t | Main {amount(preview.saved.mainTotal)} | Locals {amount(preview.saved.localTotal)}. {preview.saved.status === "needs_review" ? "Billing needs review." : "Confirming replaces these saved amounts with the calculation below."}</p>}
      {preview.ruleIssues.length > 0 && <ul role="status" className="list-disc space-y-1 pl-4 text-xs text-[var(--warning-text)]">{preview.ruleIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <p className="text-xs text-[var(--nav-text-color)]">Planning date: {preview.routeDate}. {preview.calculation.pickupTownCount === null ? "Pickup town needs review." : preview.calculation.pickupTownCount === 1 ? `SP: collection in ${preview.calculation.pickupTowns[0]}.` : `Standard: collection in ${preview.calculation.pickupTowns.join(" + ")}.`} {preview.calculation.pickups} warehouse pickup(s); additional pickup charges count warehouses.</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Applicable tariff<select className={field} disabled={saving || preview.readOnly || !preview.choices.length} value={preview.selected?.key ?? ""} onChange={event => { setTariffKey(event.target.value); setSuccess(""); }}>
        {!preview.choices.length && <option value="">Rate needs review</option>}
        {preview.choices.map(choice => <option key={choice.key} value={choice.key} disabled={choice.ratePerTon < (preview.choices[0]?.ratePerTon ?? 0)}>{choice.destination} | {formatCurrency(choice.ratePerTon)} / t{choice.ratePerTon === preview.choices[0]?.ratePerTon ? " (highest)" : ""}</option>)}
      </select></label><label className="text-sm">Chargeable tons<input className={field} inputMode="decimal" value={tons ?? String(preview.calculation.chargeableTons)} onChange={event => { setTons(event.target.value); setSuccess(""); }} disabled={saving || preview.readOnly} /></label></div>
      {preview.selected && <p className="text-xs text-[var(--nav-text-color)]">{preview.selected.loadingPoint} | Effective {preview.selected.effectiveDate}. Matches: {preview.selected.matchedDestinations.join("; ")}. Highest applicable rate is used for the whole main load.</p>}
      {preview.destinationChecks && <div className="space-y-2 border-t border-[var(--card-border)] pt-3" aria-label="Delivery town tariff checks"><h4 className="text-sm font-semibold">Delivery town checks</h4><p className="text-xs text-[var(--nav-text-color)]">Every delivery needs an agreed tariff in this loading group and Standard/SP choice. Missing matches require billing review; dispatch may continue after flagging.</p>{preview.destinationChecks.map((check, index) => <div key={index} className="rounded-lg bg-[var(--surface-sunken)] p-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{check.destination}</span><span className={check.matched ? "text-[var(--success-text)]" : "text-[var(--warning-text)]"}>{check.matched ? "Matched" : "Needs review"}</span></div><p className="mt-1">Town: {check.towns.join(" / ") || "Not recognised"}</p><p className="mt-1">{check.matched ? `Agreed tariffs: ${check.tariffs.join("; ")}` : "No applicable tariff. Confirm this town's agreed coverage in Customer Rates."}</p></div>)}</div>}
      <details className="text-xs"><summary className="cursor-pointer font-semibold text-[#0891B2]">Why this rate?</summary><p className="mt-2 text-[var(--nav-text-color)]">Rates effective on {preview.routeDate} are filtered by the pickup group and {preview.calculation.pickupTownCount === 1 ? "single-town SP" : "Standard"} eligibility. The highest matching price applies to the entire main load. Other stops must still have tariff coverage.</p><ul className="mt-2 space-y-1">{preview.choices.map(choice => <li key={choice.key}>{choice.destination}: {formatCurrency(choice.ratePerTon)} / t · {choice.matchedDestinations.join("; ")}{choice.key === preview.selected?.key ? " · Selected highest rate" : ""}</li>)}</ul></details>
      {!validTons && <p role="alert" className="text-sm text-[var(--danger-text)]">Enter chargeable tons above zero and at most 1,000.</p>}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
        <dt>Main freight ({preview.calculation.chargeableTons} t)</dt><dd className="text-right tabular-nums">{amount(preview.calculation.freight)}</dd>
        <dt>Pickups: {preview.calculation.pickups} total, {preview.calculation.extraPickups} additional</dt><dd className="text-right tabular-nums">{amount(preview.calculation.pickupCharge)}</dd>
        <dt>Drops: {preview.calculation.deliveries} total, {preview.calculation.extraDrops} additional</dt><dd className="text-right tabular-nums">{amount(preview.calculation.dropCharge)}</dd>
        <dt className="font-semibold">{preview.calculation.issues.length ? "Main billing estimate (needs review)" : "Daily Planner main revenue"}</dt><dd className="text-right font-semibold tabular-nums">{amount(preview.calculation.mainTotal)}</dd>
      </dl>
      {preview.calculation.locals.length > 0 && <div className="space-y-2 border-t border-[var(--card-border)] pt-3"><h4 className="text-sm font-semibold">Local transport - reports only</h4>{preview.calculation.locals.map(local => <div key={local.key} className="flex flex-wrap justify-between gap-2 text-sm"><div className="min-w-0"><p className="break-words">{local.name}</p><p className="text-xs text-[var(--nav-text-color)]">GEORGE to GEORGE | {local.weightKg / 1000} t | {local.pallets ?? "Unknown"} pallets</p></div><span className="tabular-nums">{amount(local.price)}</span></div>)}</div>}
      <p className="flex justify-between gap-3 border-t border-[var(--card-border)] pt-3 text-sm font-semibold"><span>{preview.calculation.issues.length ? "Estimated report billing" : "Combined report billing"}</span><span className="tabular-nums">{amount(preview.calculation.combinedTotal)}</span></p>
      {preview.calculation.issues.length > 0 && <ul role="status" className="list-disc space-y-1 pl-4 text-xs text-[var(--warning-text)]">{preview.calculation.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}
      {success && <p role="status" className="text-sm text-[var(--success-text)]">{success}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[var(--nav-text-color)]">{ready ? "Current billing review saved." : "Confirm billing or flag it for review before sending."}</span><button type="button" disabled={saving || preview.readOnly || !validTons || calculationSaved} onClick={() => void confirm(preview.calculation.issues.length > 0)} className="min-h-11 rounded-lg bg-[#0891B2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{preview.readOnly ? "Billing read-only" : saving ? "Saving..." : preview.calculation.issues.length ? "Flag billing for review" : "Confirm & save billing"}</button></div>
    </>}
  </section>;
}
