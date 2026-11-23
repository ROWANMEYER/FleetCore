"use client";

import type { Region } from "@/src/lib/regions";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, CheckCircle2, FileClock, MapPin, MoreHorizontal, Table2, Trash2, Truck } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { ceramicLocalLegs, ceramicMainLoad, ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { ceramicDeliveryStops } from "@/src/lib/ceramic-tiles/reportEditing";
import { ceramicWorkflowLabel, ceramicWorkflowStage, type CeramicWorkflowStage } from "@/src/lib/ceramic-tiles/workflow";
import type { CeramicFleet } from "./useCeramicInstructions";
import { CeramicDriverInstructions } from "./DriverInstructionsPanel";
import { CeramicWhatsAppHandoff } from "./CeramicWhatsAppHandoff";

export type CeramicAssignDraft = { driverId: string; truckId: string; routeDate: string };
export type CeramicWorkspaceInteraction = { dirty: boolean; saving: boolean };
const panel = "rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm";
const field = "mt-1 min-h-11 w-full rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[#0891B2]";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-sunken)] disabled:opacity-40";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0891B2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#007f99] disabled:opacity-40";
const number = (n: number | null) => n === null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: 3 });
const reportHref = "/operations/ceramic-tiles/reports";
const defaultDraft = (row: Doc<"ceramicShipments">): CeramicAssignDraft => ({ driverId: row.driverId ?? "", truckId: row.truckId ?? "", routeDate: row.routeDate ?? ceramicPlanningDate() });
const stages = ["Review PDF", "Assign load", "Instructions", "Send to driver"];
const stageIndex = { assignment: 1, instructions: 2, ready: 3 };
function stops(row: Doc<"ceramicShipments">) { return ceramicDeliveryStops(ceramicMainLoad(row.snapshot, row._id).toLocations); }

export function GuidedShipmentWorkspace({ rows, fleet, token, region, selectedNumber, onSelect, drafts, onDraftChange, savingId, onAssign, onHistory, onDelete, interaction, onInteractionChange, disabled }: {
  rows: Doc<"ceramicShipments">[] | undefined; fleet: CeramicFleet | undefined; token: string;
  region: Region; selectedNumber: string; onSelect: (number: string) => void;
  drafts: Record<string, CeramicAssignDraft>; onDraftChange: (id: string, draft: CeramicAssignDraft) => void;
  savingId: string | null; onAssign: (row: Doc<"ceramicShipments">) => Promise<boolean>;
  onHistory: (id: Doc<"ceramicShipments">["_id"]) => void; onDelete: (row: Doc<"ceramicShipments">) => void;
  disabled: boolean; interaction: CeramicWorkspaceInteraction; onInteractionChange: (state: CeramicWorkspaceInteraction) => void;
}) {
  const [filter, setFilter] = useState<"action" | "ready" | "all" | null>(null);
  const records = rows ?? [];
  const pending = records.filter(row => ceramicWorkflowStage(row) !== "ready");
  const activeFilter = filter ?? (pending.length ? "action" : "ready");
  const visible = activeFilter === "all" ? records : records.filter(row => (ceramicWorkflowStage(row) === "ready") === (activeFilter === "ready"));
  const selected = records.find(row => row.shipmentNumber === selectedNumber) ?? pending[0] ?? records[0];
  const busy = disabled || interaction.saving || savingId !== null;
  const select = (number: string) => {
    if (busy || number === selected?.shipmentNumber) return;
    if (interaction.dirty && !window.confirm("Leave this shipment? Unsaved driver-instruction changes will be lost.")) return;
    onSelect(number);
  };
  const changeFilter = (value: "action" | "ready" | "all") => {
    if (busy) return;
    const candidates = value === "all" ? records : records.filter(row => (ceramicWorkflowStage(row) === "ready") === (value === "ready"));
    if (selected && !candidates.some(row => row._id === selected._id) && candidates[0]) {
      if (interaction.dirty && !window.confirm("Leave this shipment? Unsaved driver-instruction changes will be lost.")) return;
      onSelect(candidates[0].shipmentNumber);
    }
    setFilter(value);
  };
  const next = pending.find(row => row._id !== selected?._id);
  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(235px,0.75fr)_minmax(0,1.65fr)]">
    <aside className={`${panel} min-w-0 overflow-hidden`} aria-label="Shipment work queue">
      <div className="flex items-center justify-between gap-2 p-4"><h2 className="text-sm font-semibold">Shipment queue</h2><span className="text-xs text-[var(--nav-text-color)]">{rows ? `${records.length} shipments` : "Loading…"}</span></div>
      <nav aria-label="Filter shipment queue" className="flex gap-1 border-b border-[var(--card-border)] px-3 pb-3">
        {([['action', 'Prepare', pending.length], ['ready', 'To send', records.length - pending.length], ['all', 'All', records.length]] as const).map(([value, label, count]) => <button type="button" key={value} aria-pressed={activeFilter === value} disabled={busy} onClick={() => changeFilter(value)} className={`min-h-10 flex-1 rounded-lg px-2 text-xs font-semibold ${activeFilter === value ? "bg-[var(--accent-soft-bg)] text-[#0891B2]" : "text-[var(--nav-text-color)] hover:bg-[var(--surface-sunken)]"}`}>{label} <span className="ml-1 tabular-nums">{count}</span></button>)}
      </nav>
      {!rows ? <p role="status" className="p-4 text-sm text-[var(--nav-text-color)]">Loading shipments…</p> : visible.length === 0 ? <p className="p-4 text-sm text-[var(--nav-text-color)]">{records.length ? "No shipments in this queue. Choose another filter." : "Upload a shipment PDF to get started."}</p> : <div>{visible.map(row => {
        const selectedRow = selected?._id === row._id, stage = ceramicWorkflowStage(row);
        return <button type="button" key={row._id} aria-pressed={selectedRow} disabled={busy} onClick={() => select(row.shipmentNumber)} className={`block w-full border-b border-[var(--card-border)] p-4 text-left disabled:opacity-60 ${selectedRow ? "border-l-4 border-l-[#0891B2] bg-[var(--accent-soft-bg)] pl-3" : "border-l-4 border-l-transparent hover:bg-[var(--surface-sunken)]"}`}>
          <span className="flex flex-wrap items-center justify-between gap-2"><strong className="inline-flex items-center gap-1.5 text-sm font-semibold"><Truck size={14} className="text-[#0891B2]" />{row.shipmentNumber}</strong><span className={`rounded-md px-2 py-1 text-[11px] ${stage === "ready" ? "bg-[var(--success-surface)] text-[var(--success-text)]" : "bg-[var(--surface-sunken)] text-[var(--nav-text-color)]"}`}>{ceramicWorkflowLabel(row)}</span></span>
          <span className="mt-2 block text-xs text-[var(--nav-text-color)]">{stops(row).length} delivery stops · {number(row.snapshot.totalWeightKg)} kg</span>
          <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#0891B2]">{stage === "assignment" ? "Next: Assign driver & truck" : stage === "instructions" ? "Next: Driver instructions" : "Next: Open WhatsApp"}<ArrowRight size={13} /></span>
        </button>;
      })}</div>}
      <div className="p-4"><Link href={reportHref} className="inline-flex min-h-9 items-center gap-2 text-xs font-semibold text-[#0891B2]"><Table2 size={15} />Monthly &amp; local reports</Link></div>
    </aside>
    {selected ? <ShipmentTask key={`${region}:${selected._id}`} row={selected} fleet={fleet} token={token} region={region} draft={drafts[selected._id] ?? defaultDraft(selected)} onDraftChange={draft => onDraftChange(selected._id, draft)} saving={savingId === selected._id} blocked={disabled} onAssign={() => { onSelect(selected.shipmentNumber); setFilter("action"); return onAssign(selected); }} onSaveStart={() => onSelect(selected.shipmentNumber)} onPrepared={() => { onSelect(selected.shipmentNumber); setFilter("ready"); }} onHistory={() => onHistory(selected._id)} onDelete={() => onDelete(selected)} onNext={next ? () => { if (!busy) { select(next.shipmentNumber); setFilter("action"); } } : undefined} onInteractionChange={onInteractionChange} /> : <section className={`${panel} p-8 text-sm text-[var(--nav-text-color)]`} aria-label="Shipment workspace">{rows ? "Your next shipment step will appear here after import." : "Loading shipment workspace…"}</section>}
  </div>;
}

function ShipmentTask({ row, fleet, token, region, draft, onDraftChange, saving, blocked, onAssign, onSaveStart, onPrepared, onHistory, onDelete, onNext, onInteractionChange }: {
  row: Doc<"ceramicShipments">; fleet: CeramicFleet | undefined; token: string; region: Region;
  draft: CeramicAssignDraft; onDraftChange: (draft: CeramicAssignDraft) => void; saving: boolean; blocked: boolean;
  onAssign: () => Promise<boolean>; onSaveStart: () => void; onPrepared: () => void; onHistory: () => void; onDelete: () => void; onNext?: () => void;
  onInteractionChange: (state: CeramicWorkspaceInteraction) => void;
}) {
  const [step, setStep] = useState<CeramicWorkflowStage>(() => ceramicWorkflowStage(row));
  const [savedAssignment, setSavedAssignment] = useState(false);
  const [instructionState, setInstructionState] = useState<CeramicWorkspaceInteraction>({ dirty: false, saving: false });
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = blocked || saving || instructionState.saving;
  const liveStage = ceramicWorkflowStage(row);
  // A remote reassignment requires review before opening the saved WhatsApp handoff.
  const activeStep = step === "ready" && liveStage !== "ready" ? liveStage : step;
  const needsAssignment = liveStage === "assignment";
  const localLegs = ceramicLocalLegs(row.snapshot);
  const mainLoad = ceramicMainLoad(row.snapshot, row._id);
  const deliveryStops = ceramicDeliveryStops(mainLoad.toLocations);
  useEffect(() => { onInteractionChange({ dirty: instructionState.dirty, saving: busy }); }, [instructionState.dirty, busy, onInteractionChange]);
  useEffect(() => () => onInteractionChange({ dirty: false, saving: false }), [onInteractionChange]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [activeStep]);
  const changeStep = (next: CeramicWorkflowStage) => {
    if (busy) return;
    if (instructionState.dirty && !window.confirm("Leave these instructions? Unsaved changes will be lost.")) return;
    if (next !== "instructions") setInstructionState({ dirty: false, saving: false });
    setStep(next);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !fleet) return;
    if (await onAssign()) { setSavedAssignment(true); setStep("instructions"); }
  };
  const index = stageIndex[activeStep];
  return <section className={`${panel} min-w-0 p-4 lg:p-5`} aria-label="Current shipment step">
    <div className="flex items-start justify-between gap-3">
      <div><h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">{row.shipmentNumber}</h2><p className="mt-1 text-xs text-[var(--nav-text-color)]">Version {row.version} · PDF {row.snapshot.plannedLoadingDate ?? "—"} to {row.snapshot.plannedDeliveryDate ?? "—"}</p></div>
      <details className="relative"><summary aria-label={`More actions for ${row.shipmentNumber}`} className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-xs text-[var(--nav-text-color)]"><MoreHorizontal size={17} />More</summary><div className="absolute right-0 top-full z-20 grid w-48 gap-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-lg">
        <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onHistory(); }} className={secondary}><FileClock size={14} />PDF &amp; history</button>
        <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); changeStep('assignment'); }} className={secondary}>Edit assignment</button>
        <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(); }} className={`${secondary} text-[var(--danger-text)]`}><Trash2 size={14} />Delete shipment</button>
      </div></details>
    </div>
    <ol aria-label="Shipment progress" className="my-6 grid grid-cols-4 gap-2">{stages.map((label, i) => <li key={label} aria-current={i === index ? "step" : undefined} className={`min-w-0 text-[11px] ${i === index ? "font-semibold text-[#0891B2]" : "text-[var(--nav-text-color)]"}`}><span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full border ${i === index ? "border-[#0891B2] bg-[#0891B2] text-white" : "border-[var(--card-border)]"}`}>{i < index ? <Check size={14} /> : i + 1}</span>{i === 0 ? <button type="button" disabled={busy} onClick={onHistory} className="text-left underline decoration-dotted underline-offset-2">{label}</button> : label}</li>)}</ol>
    {savedAssignment && activeStep === "instructions" && <div role="status" className="mb-5 flex gap-2 rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-xs text-[var(--success-text)]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Assignment saved</p><p className="mt-1">Daily Planner: main load updated · Monthly report updated · {localLegs.length} local {localLegs.length === 1 ? "leg" : "legs"} in the local report.</p></div></div>}
    {activeStep === "assignment" ? <>
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--card-border)] py-3 text-xs text-[var(--nav-text-color)]"><span className="inline-flex items-center gap-1.5"><MapPin size={14} />{deliveryStops.length} delivery stops</span><span>{number(row.snapshot.totalWeightKg)} kg</span><span>{number(row.snapshot.totalPallets)} pallets</span><span>{localLegs.length} local legs</span></div>
      <h3 className="text-base font-semibold">{row.plannerVersion !== undefined && row.plannerVersion !== row.version ? "Review the revised load" : "Assign the load"}</h3><p className="mt-1 text-sm text-[var(--nav-text-color)]">Choose the driver, truck and day for the main Planner load.</p>
      <form onSubmit={event => void submit(event)} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Driver<select required aria-label={`Driver for ${row.shipmentNumber}`} className={field} disabled={busy || !fleet} value={draft.driverId} onChange={e => onDraftChange({ ...draft, driverId: e.target.value })}><option value="">Choose a driver</option>{fleet?.drivers.map(driver => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label><label className="text-sm">Truck<select required aria-label={`Truck for ${row.shipmentNumber}`} className={field} disabled={busy || !fleet} value={draft.truckId} onChange={e => onDraftChange({ ...draft, truckId: e.target.value })}><option value="">Choose a truck</option>{fleet?.trucks.map(truck => <option value={truck.id} key={truck.id}>{truck.fleetNumber}{truck.registration ? ` · ${truck.registration}` : ""}</option>)}</select></label><label className="text-sm sm:col-span-2">Planning date<input type="date" required aria-label={`Planning date for ${row.shipmentNumber}`} className={field} disabled={busy} value={draft.routeDate} onChange={e => onDraftChange({ ...draft, routeDate: e.target.value })} /></label></div>
        <details className="text-xs"><summary className="cursor-pointer py-2 font-semibold text-[#0891B2]">Review collection &amp; delivery locations</summary><p className="mt-2 text-[var(--nav-text-color)]">Collect: {mainLoad.fromLocations.join("; ")}</p><ol className="mt-2 list-decimal space-y-1 pl-5">{deliveryStops.map(stop => <li key={stop}>{stop}</li>)}</ol></details>
        <p className="text-xs text-[var(--nav-text-color)]">Saving updates Daily Planner and both reports. Local legs stay out of Daily Planner.</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4"><span className="text-xs text-[var(--nav-text-color)]">Next: Driver instructions</span><button type="submit" disabled={busy || !fleet} className={primary}>{saving ? "Saving…" : "Save & continue"}<ArrowRight size={16} /></button></div>
      </form>
    </> : activeStep === "instructions" ? !fleet ? <p role="status" className="text-sm">Loading driver and truck details…</p> : <>{needsAssignment && <div role="alert" className="mb-4 space-y-3 rounded-lg border border-[var(--warning-border)] p-3 text-sm text-[var(--warning-text)]"><p>The assignment needs review before these instructions can be saved or shared. Your open notes are kept below.</p><button type="button" onClick={() => changeStep("assignment")} className={secondary}>Review assignment</button></div>}<CeramicDriverInstructions assignmentPending={needsAssignment} shipment={row} token={token} region={region} drivers={fleet.drivers} trucks={fleet.trucks} onClose={() => changeStep(liveStage === "ready" ? "ready" : "assignment")} requireVersionReview embedded closeLabel={liveStage === "ready" ? "Back to WhatsApp" : "Back to assignment"} onSaveStart={onSaveStart} onStateChange={setInstructionState} onSaved={() => { setInstructionState({ dirty: false, saving: false }); setSavedAssignment(false); setStep("ready"); onPrepared(); }} /></> : <>
      {!fleet ? <p role="status" className="text-sm">Loading the assigned driver and truck…</p> : <CeramicWhatsAppHandoff key={`${row._id}:${row.driverInstructions?.updatedAt ?? 0}`} shipment={row} fleet={fleet} onEditAssignment={() => changeStep("assignment")} onEditInstructions={() => changeStep("instructions")} onNext={onNext} />}

    </>}
  </section>;
}
