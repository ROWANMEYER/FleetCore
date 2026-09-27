"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { pricingUnits, validDay } from "@/convex/rateSheetFields";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { ModalShell } from "@/src/components/common/ModalShell";
import { monthlyRates } from "@/src/lib/fuel/monthlyRates";
import { formatCurrency, formatRateMonth } from "@/src/pdf/formatters";
import { buildRateSheetData } from "@/src/pdf/rateSheetBuilder";
import { generateRateSheetPDF } from "@/src/pdf/rateSheetTemplate";
import type jsPDF from "jspdf";

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
 * Why the added date is not usable yet, or null when it is. Only a sheet that has never been saved cares: once a date is locked the field is read only, so there is nothing left to check.
 */
export function addedDateProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Set the date these rates were added.";
  return validDay(value) ? null : "Enter a valid date.";
}
/** The stored date as a person would read it, falling back to what is actually stored if it is somehow unreadable. */
export function formatAddedDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : iso;
}
/**
 * Everything the server compares when deciding whether a save changed anything, and nothing else. Lane ids are deliberately excluded: the server mints them itself, so including them would make a freshly saved sheet look edited.
 */
function formKey(form: { effectiveDate: string; notes: string; oldDiesel: string; newDiesel: string; lanes: { loadingPoint: string; destination: string; pricingUnit: string; rate: string }[] }) {
  return JSON.stringify([form.effectiveDate, form.notes, round2(form.oldDiesel), round2(form.newDiesel),
    form.lanes.map(l => [l.loadingPoint.trim(), l.destination.trim(), l.pricingUnit, round2(l.rate)])]);
}
export { formKey };

export function SheetEditor({ token, sheet, customer, customerName, onDeleted }: { token: string; sheet: Sheet; customer?: { _id?: string; name?: string; accountNumber?: string; contactPerson?: string; phone?: string; email?: string; address?: string; vatNumber?: string }; customerName: string; onDeleted: () => void }) {
  const save = useMutation(api.rateSheets.saveLanes);
  const deleteSheet = useMutation(api.rateSheets.deleteSheet);
  const [lanes, setLanes] = useState<DraftLane[]>(() => sheet.lanes.map(l => ({ key: l.id, id: l.id, loadingPoint: l.loadingPoint, destination: l.destination, pricingUnit: l.pricingUnit ?? "", rate: String(l.rate) })));
  const [notes, setNotes] = useState(sheet.notes);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  // The name is the key: an empty customerName must not be satisfied by an empty field, or the gate would be open before the user typed anything.
  const deleteReady = customerName.trim().length > 0 && deleteWord.trim() === customerName.trim();
  /**
   * The date the rates count from. It is set by hand and every save re-sends it, so changing it and saving moves the whole sheet — there is no separate lock step.
   */
  const [addedDate, setAddedDate] = useState(sheet.effectiveDate ?? "");
  const dateProblem = addedDateProblem(addedDate);
  // A saved date is shown big and only opened for editing on demand; a sheet with no date yet goes straight to the field.
  const [adjustingDate, setAdjustingDate] = useState(false);
  const dateSaved = sheet.effectiveDate && !adjustingDate;
  const openDateEditor = () => { setNotice(""); setError(""); setAddedDate(sheet.effectiveDate ?? ""); setAdjustingDate(true); };
  const closeDateEditor = () => { setNotice(""); setError(""); setAddedDate(sheet.effectiveDate ?? ""); setAdjustingDate(false); };
  // Fuel is subscribed independently: saving a new fuel month updates every
  // customer's calculated rates without overwriting their starting figures.
  const fuel = useQuery(api.fuelPrices.list, token ? { token } : "skip");
  const oldDiesel = sheet.oldDieselPrice;
  const newDiesel = sheet.newDieselPrice;
  const carried = { effectiveDate: addedDate, oldDiesel: String(oldDiesel), newDiesel: String(newDiesel) };
  const timeline = monthlyRates(lanes.map(l => l.rate.trim() ? Number(l.rate) : NaN), addedDate, fuel ?? []);
  /**
   * The PDF prints what is on screen, not what is stored: the reader can lay out a change, look at the printable sheet, and only then save it.
   */
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // The doc itself is kept so Print can re-emit it with an auto-print stamp; the iframe copy stays clean.
  const pdfDocRef = useRef<jsPDF | null>(null);
  const generatePdf = () => {
    const doc = generateRateSheetPDF(buildRateSheetData(
      {
        effectiveDate: addedDate || undefined,
        notes,
        oldDieselPrice: oldDiesel,
        newDieselPrice: newDiesel,
        defaultPricingUnit: sheet.defaultPricingUnit,
        lanes: lanes.map((l, index) => ({
          loadingPoint: l.loadingPoint,
          destination: l.destination,
          pricingUnit: l.pricingUnit || undefined,
          rate: Number(l.rate) || 0,
          date: sheet.lanes.find(s => s.id === l.id)?.date ?? undefined,
          sortOrder: index,
        })),
      },
      customer ?? { name: customerName },
      fuel ?? [],
    ));
    pdfDocRef.current = doc;
    setPdfUrl(doc.output("bloburl") as unknown as string);
  };
  /**
   * Printing goes through the browser's own dialog: the doc is re-emitted with an auto-print stamp and opened fresh, which every browser honours — unlike calling print() on an iframe showing a PDF, which Chrome's viewer swallows.
   */
  const printPdf = () => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    doc.autoPrint();
    window.open(doc.output("bloburl") as unknown as string, "_blank");
  };
  // The last state the server accepted, so a save with no real edit is recognised here and never sent.
  const [savedKey, setSavedKey] = useState(() => formKey({ ...carried, notes: sheet.notes,
    lanes: sheet.lanes.map(l => ({ loadingPoint: l.loadingPoint, destination: l.destination, pricingUnit: l.pricingUnit ?? "", rate: String(l.rate) })) }));
  const unitOptions = pricingUnits;
  const edit = (key: string, patch: Partial<DraftLane>) => { setNotice(""); setLanes(rows => rows.map(r => r.key === key ? { ...r, ...patch } : r)); };
  const problems = lanes.map((lane, index) => ({ index, problem: laneProblem(lane) })).filter(p => p.problem);
  const clean = formKey({ ...carried, notes, lanes }) === savedKey;

  async function saveSheet() {
    // Checked here so one unfinished row cannot take the rest of the table down with it.
    if (problems.length) { setSaved(""); setNotice(""); setError(`${problems.length} lane${problems.length === 1 ? "" : "s"} still to finish: ${problems.map(p => `row ${p.index + 1} ${p.problem}`).join("; ")}. Finish or remove ${problems.length === 1 ? "it" : "them"}, then save.`); return; }
    if (dateProblem) { setSaved(""); setNotice(""); setError(dateProblem); return; }
    if (clean) { setError(""); setSaved(""); setNotice("No changes to save."); return; }
    setBusy(true); setError(""); setSaved(""); setNotice("");
    try {
      const request = { token, customerId: sheet.customerId, effectiveDate: addedDate, notes, oldDieselPrice: oldDiesel, newDieselPrice: newDiesel,
        lanes: lanes.map((l, index) => ({ id: l.id, loadingPoint: l.loadingPoint, destination: l.destination, ...(l.pricingUnit ? { pricingUnit: l.pricingUnit } : {}), rate: Number(l.rate), sortOrder: index })) };
      const saved = await save(request);
      // The server mints the ids for newly added lanes and returns them in the order saved, so each row picks up its real id and later saves keep it.
      setLanes(rows => rows.map((row, index) => saved.lanes[index] ? { ...row, id: saved.lanes[index].id } : row));
      // The date the server settled on, which trims and validates what was typed. Taking it rather than assuming keeps the field honest about what is stored.
      if (saved.effectiveDate) setAddedDate(saved.effectiveDate);
      // Back to the big display: the date is settled until the reader asks to move it again.
      setAdjustingDate(false);
      setSavedKey(formKey({ ...carried, notes, lanes }));
      setSaved("Saved. These rates are live.");
    } catch (e) {
      // The server is the authority on "nothing changed". If it says so, that is not a failure worth shouting about.
      if (e instanceof Error && e.message.startsWith("Nothing changed")) { setError(""); setSaved(""); setNotice("No changes to save."); return; }
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <section className="glass-card rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">Automatic monthly rates</h2>
      <p className="text-sm text-[var(--nav-text-color)]">Enter the starting rates for the date below. Each later fuel change applies its composition effect automatically. Months before the starting month stay blank.</p>
      <p className="font-semibold">{timeline.months.map(formatRateMonth).join(" / ")}</p>
      {fuel === undefined ? <p>Loading fuel prices…</p> : timeline.problem ? <p role="alert" className="text-amber-500">{timeline.problem}</p> : <p className="text-sm text-[var(--nav-text-color)]">Calculated through {formatAddedDate(fuel.at(-1)!.effectiveDate)}. Save a new price in Fuel Compositions to update all customer monthly rates.</p>}
    </section>
    <section className="glass-card rounded-xl p-5 space-y-2">
      <h2 className="font-semibold">Date added</h2>
      {dateSaved
        ? <>
          <p className="text-2xl sm:text-3xl font-black tabular-nums leading-none">{formatAddedDate(sheet.effectiveDate!)}</p>
          <p className="text-xs text-[var(--nav-text-color)]">The starting rates already include fuel changes up to this day.</p>
          <div><button className={button} onClick={openDateEditor}>Adjust date</button></div>
        </>
        : <label className="block text-sm">
          <span className="font-medium">Date these rates were added</span>
          <input
            type="date"
            className={`${input} w-full mt-1`}
            value={addedDate}
            onChange={e => { setNotice(""); setAddedDate(e.target.value); }}
            aria-invalid={!!dateProblem}
            aria-describedby={dateProblem ? "added-date-error" : "added-date-hint"}
          />
          {dateProblem
            ? <span id="added-date-error" className="mt-1 block text-xs text-red-500">{dateProblem}</span>
            : <span id="added-date-hint" className="mt-1 block text-xs text-[var(--nav-text-color)]">Choose the date the starting rates apply from. Later fuel changes are calculated from this date.</span>}
          {sheet.effectiveDate
            ? <div className="mt-2"><button className={button} onClick={closeDateEditor} disabled={busy}>Cancel</button></div>
            : null}
        </label>}
    </section>
    <section className="glass-card rounded-xl p-5 space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead><tr><th className="p-2">Loading point</th><th className="p-2">Destination</th><th className="p-2">Unit</th><th className="p-2">Starting rate</th>{timeline.months.map((month, index) => <th key={index} className="p-2 whitespace-nowrap">{formatRateMonth(month)}</th>)}<th /></tr></thead>
          <tbody>{lanes.map((lane, index) => {
            const problem = laneProblem(lane);
            return <tr key={lane.key} className={problem ? "bg-red-500/10" : undefined}>
            <td className="p-1"><input aria-label={`Row ${index + 1} loading point`} aria-invalid={!!problem} className={`${input} w-full`} value={lane.loadingPoint} onChange={e => edit(lane.key, { loadingPoint: e.target.value })} /></td>
            <td className="p-1"><input aria-label={`Row ${index + 1} destination`} aria-invalid={!!problem} className={`${input} w-full`} value={lane.destination} onChange={e => edit(lane.key, { destination: e.target.value })} /></td>
            <td className="p-1"><select className={`${input} w-24`} value={lane.pricingUnit} onChange={e => edit(lane.key, { pricingUnit: e.target.value })}><option value="">Default</option>{unitOptions.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
            <td className="p-1"><input type="number" min="0" step="0.01" className={`${input} w-32`} value={lane.rate} onChange={e => edit(lane.key, { rate: e.target.value })} /></td>
            {timeline.rates[index].map((rate, column) => <td key={column} className="p-2 whitespace-nowrap tabular-nums">{rate === null ? "" : formatCurrency(rate)}</td>)}
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
        <button className={button} disabled={problems.length > 0 || !!dateProblem || fuel === undefined || !!timeline.problem || lanes.length === 0} onClick={generatePdf} title={timeline.problem ?? (problems.length ? "Finish every lane first" : "Open the printable rate sheet")}>View PDF</button>
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
      <p className="text-sm text-[var(--nav-text-color)]">Deletes the whole rate sheet for {customerName}: every lane, rate and the notes. The customer itself is not touched and a new sheet can be started afterwards. This cannot be undone.</p>
      <button className="rounded-lg px-4 py-2 text-sm border border-red-500/50 text-red-500 hover:bg-red-500/10 disabled:opacity-40" onClick={() => { setDeleteWord(""); setError(""); setConfirmDelete(true); }}>Delete rate sheet…</button>
    </section>
    <ConfirmDialog
      open={confirmDelete}
      title={`Delete the rate sheet for ${customerName}?`}
      message={`Every lane and rate goes with it, and this cannot be undone.\n\nType "${customerName}" to confirm.`}
      confirmLabel="Delete rate sheet"
      variant="danger"
      loading={deleting}
      confirmDisabled={!deleteReady}
      autoFocus
      onConfirm={async () => {
        // The typed name is the real gate, here and on the server; the disabled button is only the visible half of it.
        if (!deleteReady) { setError(`Type "${customerName}" exactly to delete this rate sheet.`); return; }
        setDeleting(true); setError("");
        try {
          await deleteSheet({ token, customerId: sheet.customerId, confirmName: deleteWord });
          setConfirmDelete(false);
          onDeleted();
        } catch (err) {
          // The dialog stays open so the reason sits next to the field the user still has to fix.
          setError(err instanceof Error ? err.message : "Could not delete the rate sheet.");
        } finally { setDeleting(false); }
      }}
      onCancel={() => { if (!deleting) { setConfirmDelete(false); setError(""); } }}
    >
      {/* Inside the dialog, not after it: the backdrop is fixed over the page, so a field rendered outside is invisible and unreachable. */}
      <input aria-label={`Type ${customerName} to confirm`} className={`${input} w-full`} placeholder={customerName} value={deleteWord} onChange={e => setDeleteWord(e.target.value)} disabled={deleting} />
      <p className="text-xs text-[var(--nav-text-color)] mt-1">{deleteReady ? "This matches the customer's name. The delete button is now live." : "Type the customer's name exactly to enable the delete button."}</p>
      {error && <p role="alert" className="text-red-500 text-sm mt-1">{error}</p>}
    </ConfirmDialog>
    <ModalShell open={!!pdfUrl} onClose={() => setPdfUrl(null)} portal className="max-w-4xl w-full">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Rate sheet for {customerName}</h3>
          <div className="flex gap-2">
            <button className={button} onClick={printPdf}>Print</button>
            <a className={button} href={pdfUrl ?? "#"} download={`rate-sheet-${customerName.toLowerCase().replace(/\\s+/g, "-")}.pdf`}>Download</a>
            <button className={button} onClick={() => setPdfUrl(null)}>Close</button>
          </div>
        </div>
        {pdfUrl && <iframe src={pdfUrl} title={`Rate sheet PDF for ${customerName}`} className="w-full h-[70vh] rounded-lg border border-[var(--card-border)]" />}
      </div>
    </ModalShell>
  </div>;
}
