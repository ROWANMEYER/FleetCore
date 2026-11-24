"use client";

import type { Region } from "@/src/lib/regions";
import Image from "next/image";
import styles from "./CeramicMobile.module.css";
import { CeramicShipmentQueue } from "./CeramicShipmentQueue";
import { CeramicDispatchSteps } from "./CeramicDispatchSteps";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileClock, MapPin, MoreHorizontal, Package, Trash2, Truck } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { ceramicLocalLegs, ceramicMainLoad, ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { ceramicAssignmentComplete, ceramicPalletLabel, type MobileShipmentFilter } from "@/src/lib/ceramic-tiles/mobileDispatch";
import { ceramicDeliveryStops } from "@/src/lib/ceramic-tiles/reportEditing";
import { ceramicWorkflowStage, type CeramicWorkflowStage } from "@/src/lib/ceramic-tiles/workflow";
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
const defaultDraft = (row: Doc<"ceramicShipments">): CeramicAssignDraft => ({ driverId: row.driverId ?? "", truckId: row.truckId ?? "", routeDate: row.routeDate ?? ceramicPlanningDate() });
const stageIndex = { assignment: 0, instructions: 1, ready: 2 } as const;

export function GuidedShipmentWorkspace({ canManageRecords = true, rows, fleet, token, region, selectedNumber, onSelect, drafts, onDraftChange, savingId, onAssign, onHistory, onDelete, interaction, onInteractionChange, disabled }: {
  rows: Doc<"ceramicShipments">[] | undefined; fleet: CeramicFleet | undefined; token: string;
  region: Region; selectedNumber: string; onSelect: (number: string) => void;
  drafts: Record<string, CeramicAssignDraft>; onDraftChange: (id: string, draft: CeramicAssignDraft) => void;
  savingId: string | null; onAssign: (row: Doc<"ceramicShipments">) => Promise<boolean>;
  canManageRecords?: boolean;
  onHistory: (id: Doc<"ceramicShipments">["_id"]) => void; onDelete: (row: Doc<"ceramicShipments">) => void;
  disabled: boolean; interaction: CeramicWorkspaceInteraction; onInteractionChange: (state: CeramicWorkspaceInteraction) => void;
}) {
  const [filter, setFilter] = useState<MobileShipmentFilter>("unassigned");
  const [search, setSearch] = useState("");
  const records = rows ?? [];
  // Opening a card is explicit on both surfaces. Filtering never opens a different load.
  const selected = records.find(row => row.shipmentNumber === selectedNumber);
  const pending = records.filter(row => ceramicWorkflowStage(row) !== "ready");
  const busy = disabled || interaction.saving || savingId !== null;
  const select = (number: string) => {
    if (busy || number === selectedNumber) return;
    if (interaction.dirty && !window.confirm("Leave this shipment? Unsaved shipment changes will be lost.")) return;
    onSelect(number);
  };
  const next = pending.find(row => row._id !== selected?._id);
  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.65fr)]">
    <aside className="min-w-0" aria-label="Shipment work queue">
      <CeramicShipmentQueue rows={rows} fleet={fleet} filter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} onSelect={row => select(row.shipmentNumber)} selectedId={selected?._id} canViewReports={canManageRecords} disabled={busy} />
    </aside>
    {selected ? <ShipmentTask canManageRecords={canManageRecords} key={`${region}:${selected._id}`} row={selected} fleet={fleet} token={token} region={region} draft={drafts[selected._id] ?? defaultDraft(selected)} onDraftChange={draft => onDraftChange(selected._id, draft)} saving={savingId === selected._id} blocked={disabled} onAssign={async () => {
      onSelect(selected.shipmentNumber);
      const saved = await onAssign(selected);
      if (saved) { setFilter("assigned"); setSearch(""); }
      return saved;
    }} onSaveStart={() => onSelect(selected.shipmentNumber)} onPrepared={() => { onSelect(selected.shipmentNumber); setFilter("assigned"); setSearch(""); }} onBack={() => select("")} onHistory={() => onHistory(selected._id)} onDelete={() => onDelete(selected)} onNext={next ? () => {
      if (!busy) { select(next.shipmentNumber); setFilter(ceramicAssignmentComplete(next) ? "assigned" : "unassigned"); setSearch(""); }
    } : undefined} onInteractionChange={onInteractionChange} /> : <section className={`${styles.empty} py-14`} aria-label="Shipment workspace"><Package size={36} /><h2>Choose a shipment</h2><p>Open a shipment card to assign the truck and driver, arrange stops, then send the driver instructions.</p></section>}
  </div>;
}

function ShipmentTask({ canManageRecords = true, row, fleet, token, region, draft, onDraftChange, saving, blocked, onAssign, onSaveStart, onPrepared, onBack, onHistory, onDelete, onNext, onInteractionChange }: {
  row: Doc<"ceramicShipments">; fleet: CeramicFleet | undefined; token: string; region: Region;
  draft: CeramicAssignDraft; onDraftChange: (draft: CeramicAssignDraft) => void; saving: boolean; blocked: boolean;
  canManageRecords?: boolean;
  onAssign: () => Promise<boolean>; onSaveStart: () => void; onPrepared: () => void; onBack: () => void; onHistory: () => void; onDelete: () => void; onNext?: () => void;
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
  return <section className={`${panel} min-w-0 rounded-[22px] p-4 lg:p-5`} aria-label="Current shipment step">
    <button type="button" disabled={busy} onClick={onBack} className={`${styles.secondary} mb-4`}><ArrowLeft size={17} />Shipments</button>
    <div className="flex items-start justify-between gap-3">
      <div><h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">{row.shipmentNumber}</h2><p className="mt-1 text-xs text-[var(--nav-text-color)]">Version {row.version} · PDF {row.snapshot.plannedLoadingDate ?? "—"} to {row.snapshot.plannedDeliveryDate ?? "—"}</p></div>
      <details className="relative"><summary aria-label={`More actions for ${row.shipmentNumber}`} className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-xs text-[var(--nav-text-color)]"><MoreHorizontal size={17} />More</summary><div className="absolute right-0 top-full z-20 grid w-48 gap-1 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-lg">
        <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onHistory(); }} className={secondary}><FileClock size={14} />PDF &amp; history</button>
        <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); changeStep('assignment'); }} className={secondary}>Edit assignment</button>
      </div></details>
    </div>
    {canManageRecords && <button type="button" disabled={busy} onClick={onDelete} className={`${secondary} mt-3 text-[var(--danger-text)]`}><Trash2 size={14} />Delete shipment</button>}
    <div className={styles.metrics}><span className={styles.metric}><Image src="/images/ceramic-mobile/v1/icons/pallets.svg" alt="" width={23} height={23} />{ceramicPalletLabel(row.snapshot)}</span><span className={styles.metric}><Truck size={23} />{deliveryStops.length} deliveries</span><span className={styles.metric}><MapPin size={20} />TRANSVAAL</span></div>
    <div className={`${styles.journey} mb-6`}>
      <Image className={styles.journeyTruck} src="/images/ceramic-mobile/v1/dispatch-truck.png" alt="" width={1774} height={887} sizes="100px" />
      <CeramicDispatchSteps step={index} disabled={i => busy || i === 1 && needsAssignment || i === 2 && liveStage !== "ready"} onStepChange={i => changeStep(i === 0 ? "assignment" : i === 1 ? "instructions" : "ready")} />
    </div>
    {savedAssignment && activeStep === "instructions" && <div role="status" className="mb-5 flex gap-2 rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-xs text-[var(--success-text)]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Assignment saved</p><p className="mt-1">Daily Planner: main load updated · Monthly report updated · {localLegs.length} local {localLegs.length === 1 ? "leg" : "legs"} in the local report.</p></div></div>}
    {activeStep === "assignment" ? <>
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-[var(--card-border)] py-3 text-xs text-[var(--nav-text-color)]"><span className="inline-flex items-center gap-1.5"><MapPin size={14} />{deliveryStops.length} delivery stops</span><span>{number(row.snapshot.totalWeightKg)} kg</span><span>{number(row.snapshot.totalPallets)} pallets</span><span>{localLegs.length} local legs</span></div>
      <h3 className="text-base font-semibold">{row.plannerVersion !== undefined && row.plannerVersion !== row.version ? "Review the revised load" : "Assign truck and driver"}</h3><p className="mt-1 text-sm text-[var(--nav-text-color)]">Choose who is taking this shipment and confirm the planning date.</p>
      <form onSubmit={event => void submit(event)} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Driver<select required aria-label={`Driver for ${row.shipmentNumber}`} className={field} disabled={busy || !fleet} value={draft.driverId} onChange={e => onDraftChange({ ...draft, driverId: e.target.value })}><option value="">Choose a driver</option>{fleet?.drivers.map(driver => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label><label className="text-sm">Truck<select required aria-label={`Truck for ${row.shipmentNumber}`} className={field} disabled={busy || !fleet} value={draft.truckId} onChange={e => onDraftChange({ ...draft, truckId: e.target.value })}><option value="">Choose a truck</option>{fleet?.trucks.map(truck => <option value={truck.id} key={truck.id}>{truck.fleetNumber}{truck.registration ? ` · ${truck.registration}` : ""}</option>)}</select></label><label className="text-sm sm:col-span-2">Planning date<input type="date" required aria-label={`Planning date for ${row.shipmentNumber}`} className={field} disabled={busy} value={draft.routeDate} onChange={e => onDraftChange({ ...draft, routeDate: e.target.value })} /></label></div>
        <details className="text-xs"><summary className="cursor-pointer py-2 font-semibold text-[#0891B2]">Review collection &amp; delivery locations</summary><p className="mt-2 text-[var(--nav-text-color)]">Collect: {mainLoad.fromLocations.join("; ")}</p><ol className="mt-2 list-decimal space-y-1 pl-5">{deliveryStops.map(stop => <li key={stop}>{stop}</li>)}</ol></details>
        <p className="text-xs text-[var(--nav-text-color)]">Saving updates Daily Planner and both reports. Local legs stay out of Daily Planner.</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] pt-4"><span className="text-xs text-[var(--nav-text-color)]">Next: Arrange stops</span><button type="submit" disabled={busy || !fleet} className={primary}>{saving ? "Saving…" : "Next: Arrange stops"}<ArrowRight size={16} /></button></div>
      </form>
    </> : activeStep === "instructions" ? !fleet ? <p role="status" className="text-sm">Loading driver and truck details…</p> : <>{needsAssignment && <div role="alert" className="mb-4 space-y-3 rounded-lg border border-[var(--warning-border)] p-3 text-sm text-[var(--warning-text)]"><p>The assignment needs review before these instructions can be saved or shared. Your open notes are kept below.</p><button type="button" onClick={() => changeStep("assignment")} className={secondary}>Review assignment</button></div>}<CeramicDriverInstructions assignmentPending={needsAssignment} shipment={row} token={token} region={region} drivers={fleet.drivers} trucks={fleet.trucks} onClose={() => changeStep(liveStage === "ready" ? "ready" : "assignment")} requireVersionReview embedded closeLabel={liveStage === "ready" ? "Back to WhatsApp" : "Back to assignment"} onSaveStart={onSaveStart} onStateChange={setInstructionState} onSaved={() => { setInstructionState({ dirty: false, saving: false }); setSavedAssignment(false); setStep("ready"); onPrepared(); }} /></> : <>
      {!fleet ? <p role="status" className="text-sm">Loading the assigned driver and truck…</p> : <CeramicWhatsAppHandoff key={`${row._id}:${row.driverInstructions?.updatedAt ?? 0}`} shipment={row} fleet={fleet} onEditAssignment={() => changeStep("assignment")} onEditInstructions={() => changeStep("instructions")} onInteractionChange={setInstructionState} onNext={onNext} />}

    </>}
  </section>;
}
