"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { pricingUnits } from "@/convex/rateSheetFields";
import { formatCurrency } from "@/src/pdf/formatters";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";

/**
 * One customer, one table, one Save. Lanes have no separate row and rates are never a draft, so every row here is the live rate.
 *
 * `key` identifies the row on screen and is local only; `id` is the server's lane id, empty until the lane is first saved, when the server mints one. The two are kept apart so two brand new lanes cannot collide before they are saved.
 */
type Sheet = NonNullable<FunctionReturnType<typeof api.rateSheets.get>>;
type DraftLane = { key: string; id: string; loadingPoint: string; destination: string; pricingUnit: string; rate: string };
export type { DraftLane };
const button = "rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm hover:bg-[var(--card-bg)] disabled:opacity-40";
const input = "settings-input";
let rowCounter = 0;
const nextRowKey = () => `row-${++rowCounter}`;
/** Why a lane cannot be saved, or null when it is fine. Mirrors the server rule so an unfinished row is caught here instead of failing the whole save. */
export function laneProblem(lane: DraftLane): string | null {
  if (!lane.loadingPoint.trim() || !lane.destination.trim()) return "needs a loading point and a destination";
  // An empty rate field is a mistake, not a rate of zero: Number("") is 0, so without this a cleared field would quietly save as R 0.
  if (!lane.rate.trim() || !Number.isFinite(Number(lane.rate)) || Number(lane.rate) < 0) return "needs a rate of zero or more";
  return null;
}
/** Rounds the way the server does, so "1500.00" and 1500 are the same value to both sides. */
const round2 = (raw: string) => { const n = Number(raw.trim()); return Number.isFinite(n) ? Math.round(n * 100) / 100 : raw.trim(); };
/**
 * Everything the server compares when deciding whether a save changed anything, and nothing else. Lane ids are deliberately excluded: the server mints them itself, so including them would make a freshly saved sheet look edited.
 */
function formKey(form: { effectiveDate: string; notes: string; oldDiesel: string; newDiesel: string; lanes: { loadingPoint: string; destination: string; pricingUnit: string; rate: string }[] }) {
  return JSON.stringify([form.effectiveDate, form.notes, round2(form.oldDiesel), round2(form.newDiesel),
    form.lanes.map(l => [l.loadingPoint.trim(), l.destination.trim(), l.pricingUnit, round2(l.rate)])]);
}
export { formKey };

export function SheetEditor({ token, sheet, customerName, onDeleted }: { token: string; sheet: Sheet; customerName: string; onDeleted: () => void }) {
  const save = useMutation(api.rateSheets.saveLanes);
  const setDefaultUnit = useMutation(api.rateSheets.setDefaultUnit);
  const deleteSheet = useMutation(api.rateSheets.deleteSheet);
  const [lanes, setLanes] = useState<DraftLane[]>(() => sheet.lanes.map(l => ({ key: l.id, id: l.id, loadingPoint: l.loadingPoint, destination: l.destination, pricingUnit: l.pricingUnit ?? "", rate: String(l.rate) })));
  const [effectiveDate, setEffectiveDate] = useState(sheet.effectiveDate);
  const [notes, setNotes] = useState(sheet.notes);
  const [oldDiesel, setOldDiesel] = useState(String(sheet.oldDieselPrice));
  const [newDiesel, setNewDiesel] = useState(String(sheet.newDieselPrice));
  const [defaultUnit, setDefaultUnitValue] = useState(sheet.defaultPricingUnit);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteReady = deleteWord.trim() === customerName.trim();
  // The last state the server accepted, so a save with no real edit is recognised here and never sent.
  const [savedKey, setSavedKey] = useState(() => formKey({ effectiveDate: sheet.effectiveDate, notes: sheet.notes, oldDiesel: String(sheet.oldDieselPrice), newDiesel: String(sheet.newDieselPrice),
    lanes: sheet.lanes.map(l => ({ loadingPoint: l.loadingPoint, destination: l.destination, pricingUnit: l.pricingUnit ?? "", rate: String(l.rate) })) }));
  const unitOptions = pricingUnits;
  const edit = (key: string, patch: Partial<DraftLane>) => { setNotice(""); setLanes(rows => rows.map(r => r.key === key ? { ...r, ...patch } : r)); };
  const movement = (Number(newDiesel) || 0) - (Number(oldDiesel) || 0);
  const problems = lanes.map((lane, index) => ({ index, problem: laneProblem(lane) })).filter(p => p.problem);
  const clean = formKey({ effectiveDate, notes, oldDiesel, newDiesel, lanes }) === savedKey;

  async function saveSheet() {
    // Checked here so one unfinished row cannot take the rest of the table down with it.
    if (problems.length) { setSaved(""); setNotice(""); setError(`${problems.length} lane${problems.length === 1 ? "" : "s"} still to finish: ${problems.map(p => `row ${p.index + 1} ${p.problem}`).join("; ")}. Finish or remove ${problems.length === 1 ? "it" : "them"}, then save.`); return; }
    if (clean) { setError(""); setSaved(""); setNotice("No changes to save."); return; }
    setBusy(true); setError(""); setSaved(""); setNotice("");
    try {
      const request = { token, customerId: sheet.customerId, effectiveDate, notes, oldDieselPrice: Number(oldDiesel), newDieselPrice: Number(newDiesel),
        lanes: lanes.map((l, index) => ({ id: l.id, loadingPoint: l.loadingPoint, destination: l.destination, ...(l.pricingUnit ? { pricingUnit: l.pricingUnit } : {}), rate: Number(l.rate), sortOrder: index })) };
      const saved = await save(request);
      // The server mints the ids for newly added lanes and returns them in the order saved, so each row picks up its real id and later saves keep it.
      setLanes(rows => rows.map((row, index) => saved.lanes[index] ? { ...row, id: saved.lanes[index].id } : row));
      setSavedKey(formKey({ effectiveDate, notes, oldDiesel, newDiesel, lanes }));
      setSaved("Saved. These rates are live.");
    } catch (e) {
      // The server is the authority on "nothing changed". If it says so, that is not a failure worth shouting about.
      if (e instanceof Error && e.message.startsWith("Nothing changed")) { setError(""); setSaved(""); setNotice("No changes to save."); return; }
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <section className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label>Default unit<select className={`${input} block w-32`} value={defaultUnit} onChange={async e => { const next = e.target.value as typeof defaultUnit; setDefaultUnitValue(next); setError(""); try { await setDefaultUnit({ token, customerId: sheet.customerId, defaultPricingUnit: next }); } catch (err) { setError(err instanceof Error ? err.message : "Could not change the default unit."); } }}>{unitOptions.map(u => <option key={u} value={u}>{u}</option>)}</select></label>
        <label>Effective date<input type="date" className={`${input} block`} value={effectiveDate} onChange={e => { setNotice(""); setEffectiveDate(e.target.value); }} /></label>
        <label>Rates based on diesel, old<input type="number" min="0.01" step="0.01" className={`${input} block w-36`} value={oldDiesel} onChange={e => { setNotice(""); setOldDiesel(e.target.value); }} /></label>
        <label>New<input type="number" min="0.01" step="0.01" className={`${input} block w-36`} value={newDiesel} onChange={e => { setNotice(""); setNewDiesel(e.target.value); }} /></label>
        {movement !== 0 && <p className={`text-sm ${movement > 0 ? "text-red-500" : "text-emerald-400"}`}>Diesel {movement > 0 ? "up" : "down"} {formatCurrency(Math.abs(movement))}</p>}
        {(Number(oldDiesel) === 0 || Number(newDiesel) === 0) && <p role="alert" className="text-red-500 text-sm">Enter the diesel prices these rates are based on. Zero means the price is unknown, and no fuel adjustment can be calculated from it.</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead><tr><th className="p-2">Loading point</th><th className="p-2">Destination</th><th className="p-2">Unit</th><th className="p-2">Rate</th><th /></tr></thead>
          <tbody>{lanes.map((lane, index) => {
            const problem = laneProblem(lane);
            return <tr key={lane.key} className={problem ? "bg-red-500/10" : undefined}>
            <td className="p-1"><input aria-label={`Row ${index + 1} loading point`} aria-invalid={!!problem} className={`${input} w-full`} value={lane.loadingPoint} onChange={e => edit(lane.key, { loadingPoint: e.target.value })} /></td>
            <td className="p-1"><input aria-label={`Row ${index + 1} destination`} aria-invalid={!!problem} className={`${input} w-full`} value={lane.destination} onChange={e => edit(lane.key, { destination: e.target.value })} /></td>
            <td className="p-1"><select className={`${input} w-24`} value={lane.pricingUnit} onChange={e => edit(lane.key, { pricingUnit: e.target.value })}><option value="">Default</option>{unitOptions.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
            <td className="p-1"><input type="number" min="0" step="0.01" className={`${input} w-32`} value={lane.rate} onChange={e => edit(lane.key, { rate: e.target.value })} /></td>
            <td className="p-1 flex gap-1">
              <button className={button} disabled={index === 0} onClick={() => setLanes(rows => { const next = [...rows]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} aria-label="Move up">↑</button>
              <button className={button} disabled={index === lanes.length - 1} onClick={() => setLanes(rows => { const next = [...rows]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })} aria-label="Move down">↓</button>
              <button className={button} onClick={() => setLanes(rows => rows.filter(r => r.key !== lane.key))}>Remove</button>
            </td>
          </tr>})}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={button} onClick={() => setLanes(rows => [...rows, { key: nextRowKey(), id: "", loadingPoint: "", destination: "", pricingUnit: "", rate: "0" }])}>Add lane</button>
        <button className="rounded-lg px-4 py-2 bg-cyan-600 text-white disabled:opacity-50" disabled={busy || clean} onClick={saveSheet}>{busy ? "Saving…" : "Save rates"}</button>
        {saved && <p className="text-emerald-400 text-sm">{saved}</p>}
        {notice && <p className="text-sm text-[var(--nav-text-color)]">{notice}</p>}
        {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
      </div>
    </section>
    <section className="glass-card rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">Notes on this sheet</h2>
      <textarea className={`${input} w-full h-24`} value={notes} onChange={e => { setNotice(""); setNotes(e.target.value); }} placeholder="Anything the customer should read on the PDF." />
      <p className="text-xs text-[var(--nav-text-color)]">Notes save with the rates. Edit a rate and press Save rates to publish both.</p>
    </section>
    <section className="glass-card rounded-xl p-5 space-y-3 border border-red-500/30">
      <h2 className="font-semibold text-red-500">Remove these rates</h2>
      <p className="text-sm text-[var(--nav-text-color)]">Deletes the whole rate sheet for {customerName}: every lane, rate, note and the diesel figures. The customer itself is not touched and a new sheet can be started afterwards. This cannot be undone.</p>
      <button className="rounded-lg px-4 py-2 text-sm border border-red-500/50 text-red-500 hover:bg-red-500/10 disabled:opacity-40" onClick={() => { setDeleteWord(""); setError(""); setConfirmDelete(true); }}>Delete rate sheet…</button>
    </section>
    <ConfirmDialog
      open={confirmDelete}
      title={`Delete the rate sheet for ${customerName}?`}
      message={`Every lane and rate goes with it, and this cannot be undone.\n\nType "${customerName}" to confirm.`}
      confirmLabel="Delete rate sheet"
      variant="danger"
      loading={deleting}
      onConfirm={async () => {
        // The confirm button can briefly render enabled while state settles; the typed name is the real gate, here and on the server.
        if (!deleteReady) { setError(`Type "${customerName}" exactly to delete this rate sheet.`); return; }
        setDeleting(true); setError("");
        try {
          await deleteSheet({ token, customerId: sheet.customerId, confirmName: deleteWord });
          setConfirmDelete(false);
          onDeleted();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not delete the rate sheet.");
          setConfirmDelete(false);
        } finally { setDeleting(false); }
      }}
      onCancel={() => { if (!deleting) setConfirmDelete(false); }}
    />
    {confirmDelete && <div className="max-w-md mx-auto mt-2">
      <input aria-label="Type the customer name to confirm" className={`${input} w-full`} placeholder={customerName} value={deleteWord} onChange={e => setDeleteWord(e.target.value)} disabled={deleting} />
      {!deleteReady && <p className="text-xs text-[var(--nav-text-color)] mt-1">Type the customer&apos;s name exactly to enable the delete button.</p>}
      {error && <p role="alert" className="text-red-500 text-sm mt-1">{error}</p>}
    </div>}
  </div>;
}
