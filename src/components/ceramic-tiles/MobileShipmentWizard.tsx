"use client";

import Link from "next/link";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ClipboardCopy, MessageCircle, Truck, UserRound } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ceramicAssignmentComplete, ceramicPalletLabel, ceramicVersionNeedsReview, type CeramicDispatchShipment } from "@/src/lib/ceramic-tiles/mobileDispatch";
import { normaliseWhatsAppNumber } from "@/src/lib/ceramic-tiles/driverInstructions";
import { orderedCeramicStops } from "@/src/lib/ceramic-tiles/stopOrder";
import { whatsAppDraftHref, type WhatsAppRecipientMode } from "@/src/lib/ceramic-tiles/whatsAppRecipient";
import { CeramicStopOrderEditor } from "./StopOrderEditor";
import { WhatsAppRecipientFields } from "./WhatsAppRecipientPicker";
import { useCeramicInstructions, type CeramicFleet } from "./useCeramicInstructions";

type Step = 0 | 1 | 2;
const field = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-base text-[var(--foreground)]";
const primary = "inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0891B2] px-3 py-3 text-center text-sm font-bold text-white disabled:opacity-40";

export function MobileShipmentWizard({ shipment, fleet, onBack }: {
  shipment: CeramicDispatchShipment; fleet: CeramicFleet; onBack: () => void;
}) {
  const { token, user } = useAuth();
  const [routeDate, setRouteDate] = useState(shipment.routeDate ?? ceramicPlanningDate());
  const [step, setStep] = useState<Step>(0);
  const [stopTab, setStopTab] = useState<"loading" | "deliveries">("loading");
  const [driverId, setDriverId] = useState<string>(shipment.driverId ?? "");
  const [truckId, setTruckId] = useState<string>(shipment.truckId ?? "");
  const [editingAssignment, setEditingAssignment] = useState(!ceramicAssignmentComplete(shipment));
  const [assigning, setAssigning] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [reviewReached, setReviewReached] = useState(false);
  const [recipientMode, setRecipientMode] = useState<WhatsAppRecipientMode>(() => normaliseWhatsAppNumber(fleet.drivers.find(d => d.id === shipment.driverId)?.phone) ? "system" : "manual");
  const [manualNumber, setManualNumber] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const assign = useMutation(api.ceramicTilesMobile.assign);
  const instructions = useCeramicInstructions({ shipment, region: shipment.region, ...fleet, requireVersionReview: true, publicMobile: true });
  const chosenDriver = fleet.drivers.find(driver => driver.id === driverId);
  const chosenTruck = fleet.trucks.find(truck => truck.id === truckId);
  const assignmentDirty = driverId !== (shipment.driverId ?? "") || truckId !== (shipment.truckId ?? "") || routeDate !== shipment.routeDate || shipment.plannerVersion !== shipment.version;
  const assignmentReady = ceramicAssignmentComplete(shipment) && !assignmentDirty && !!instructions.assignedDriver && !!instructions.assignedTruck;
  const busy = assigning || instructions.saving;
  const stops = orderedCeramicStops(shipment.snapshot, instructions.currentStopOrder);
  const href = whatsAppDraftHref(instructions.message, recipientMode, instructions.assignedDriver?.phone, manualNumber);
  const canSend = assignmentReady && reviewReached && instructions.canOpenWhatsApp && !!href && !busy;
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); headingRef.current?.focus({ preventScroll: true }); }, [step]);

  const confirmAssignment = async () => {
    if (!chosenDriver || !chosenTruck || busy) return;
    setAssignmentError(""); setAssigning(true);
    try {
      if (assignmentDirty) await assign({ token: token ?? undefined, routeDate, shipmentId: shipment._id, driverId: driverId as Id<"drivers">, truckId: truckId as Id<"trucks">, expectedVersion: shipment.version });
      setEditingAssignment(false); setStep(1);
    } catch (cause) { setAssignmentError(cause instanceof Error ? cause.message : "Could not save assignment."); }
    finally { setAssigning(false); }
  };
  const reviewInstructions = async () => {
    if (!assignmentReady || busy) return;
    if (instructions.dirty && !await instructions.handleSave()) return;
    setReviewReached(true); setStep(2);
  };
  const goTo = (target: Step) => {
    if (busy) return;
    if (target === 2 && step === 1) { void reviewInstructions(); return; }
    if (target === 0 || target === 1 && assignmentReady || target === 2 && reviewReached && assignmentReady) setStep(target);
  };
  const leave = () => {
    if (busy) return;
    if ((assignmentDirty || instructions.hasEdits) && !window.confirm("Leave this shipment? Changes you have not saved with Next will be lost.")) return;
    onBack();
  };
  const saveReviewChanges = async () => { if (!busy && assignmentReady) await instructions.handleSave(); };

  return <div className="flex h-full min-h-0 flex-col">
    <header className="shrink-0 border-b border-[var(--card-border)] bg-[var(--background)] px-4 pb-2 pt-1">
      <div className="flex items-center justify-between gap-2"><button type="button" disabled={busy} onClick={leave} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0891B2] disabled:opacity-40"><ArrowLeft size={17} />Shipments</button><span className={`text-xs ${instructions.dirty || assignmentDirty ? "text-[var(--nav-text-color)]" : "text-[var(--success-text)]"}`}>{instructions.dirty || assignmentDirty ? "Draft" : "✓ Saved"}</span></div>
      <div className="flex items-baseline justify-between gap-2"><h1 className="min-w-0 break-words text-xl font-bold">{shipment.shipmentNumber}</h1><span className="shrink-0 text-xs text-[var(--nav-text-color)]">Version {shipment.version}</span></div>
      <p className="mt-1 text-xs text-[var(--nav-text-color)]">{ceramicPalletLabel(shipment.snapshot)} · {shipment.snapshot.destinations.length} deliveries</p>
      <nav aria-label="Dispatch steps" className="mt-2 grid grid-cols-[1.5fr_1fr_1fr] gap-1">
        {(["Truck & driver", "Stops", "Send"] as const).map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} disabled={busy || index === 1 && !assignmentReady || index === 2 && !assignmentReady || index === 2 && step === 0 && !reviewReached} onClick={() => goTo(index as Step)} className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold disabled:opacity-40 ${step === index ? "bg-cyan-500/10 text-[#0891B2]" : "text-[var(--nav-text-color)]"}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${step === index ? "bg-[#0891B2] text-white" : "border border-[var(--card-border)]"}`}>{index + 1}</span>{label}</button>)}
      </nav>
    </header>
    <div ref={bodyRef} role="region" aria-label="Dispatch step content" className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-24 pt-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{["Who is taking this load?", "Arrange the route", "Review & send"][step]}</h2>
      <p className="mb-4 mt-1 text-sm text-[var(--nav-text-color)]">{["Confirm the truck and driver, then continue.", "Set the loading and delivery order.", "Check the route and choose who receives it."][step]}</p>
      {ceramicVersionNeedsReview(shipment) && <p role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Shipment updated—review before sending. Check Version {shipment.version} quantities and stops.</p>}
      {step > 0 && !assignmentReady && <p role="alert" className="mb-4 text-sm text-[var(--danger-text)]">Confirm the truck and driver in step 1 before continuing.</p>}
      {(assignmentError || instructions.error) && <p role="alert" className="mb-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-3 text-sm text-[var(--danger-text)]">{assignmentError || instructions.error}</p>}
      {step === 0 && <section aria-label="Assign shipment" className="space-y-4">
        {!editingAssignment ? <div className="divide-y divide-[var(--card-border)] rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3">
          <div className="flex items-center gap-3 py-3"><Truck size={20} className="shrink-0 text-[#0891B2]" /><div className="min-w-0 flex-1"><p className="text-xs text-[var(--nav-text-color)]">Truck</p><p className="break-words text-sm font-semibold">{chosenTruck ? [chosenTruck.fleetNumber, chosenTruck.registration].filter(Boolean).join(" · ") : "Choose a truck"}</p></div><button type="button" disabled={busy} onClick={() => setEditingAssignment(true)} className="min-h-11 px-2 text-xs font-semibold text-[#0891B2]">Change truck</button></div>
          <div className="flex items-center gap-3 py-3"><UserRound size={20} className="shrink-0 text-[#0891B2]" /><div className="min-w-0 flex-1"><p className="text-xs text-[var(--nav-text-color)]">Driver</p><p className="break-words text-sm font-semibold">{chosenDriver?.name || "Choose a driver"}</p></div><button type="button" disabled={busy} onClick={() => setEditingAssignment(true)} className="min-h-11 px-2 text-xs font-semibold text-[#0891B2]">Change driver</button></div>
        </div> : <>
          <label className="block text-sm font-semibold">Truck<select aria-label="Shipment truck" className={field} value={truckId} disabled={busy} onChange={event => setTruckId(event.target.value)}><option value="">Choose a truck</option>{fleet.trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.fleetNumber}{truck.registration ? ` · ${truck.registration}` : ""}</option>)}</select></label>
          <label className="block text-sm font-semibold">Driver<select aria-label="Shipment driver" className={field} value={driverId} disabled={busy} onChange={event => { const id = event.target.value; setDriverId(id); setRecipientMode(normaliseWhatsAppNumber(fleet.drivers.find(d => d.id === id)?.phone) ? "system" : "manual"); setManualNumber(""); }}><option value="">Choose a driver</option>{fleet.drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
        </>}
        <label className="block text-sm font-semibold">Planning date<input aria-label="Shipment planning date" type="date" className={field} value={routeDate} disabled={busy} onChange={event => setRouteDate(event.target.value)} /></label>
        {!user && assignmentDirty && <p role="alert" className="text-sm"><Link href="/login?next=ceramic-tiles" className="font-semibold text-[#0891B2] underline">Sign in</Link> to save this assignment to Daily Planner and reports.</p>}
        <p className="text-xs text-[var(--nav-text-color)]">Only the main load goes to Planner. Matching local stops go to the monthly and local reports.</p>
        <p className="flex items-start gap-2 text-sm text-[var(--nav-text-color)]"><Check size={17} className="mt-0.5 shrink-0" />{assignmentDirty ? "Next saves this assignment." : "The current assignment is filled in. Only change it if needed."}</p>
      </section>}
      {step === 1 && <CeramicStopOrderEditor shipment={shipment.snapshot} order={instructions.currentStopOrder} onChange={order => { instructions.setStopOrder(order); instructions.setSuccess(""); }} disabled={busy} compact activeTab={stopTab} onTabChange={setStopTab} />}
      {step === 2 && <section aria-label="Review shipment" className="space-y-4">
        <div className="space-y-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-sm"><p className="break-words font-semibold">{instructions.assignedDriver?.name} · {[instructions.assignedTruck?.fleetNumber, instructions.assignedTruck?.registration].filter(Boolean).join(" · ")}</p><p><span className="block text-xs text-[var(--nav-text-color)]">Loading</span>{stops.pickups.map(town => town.label).join(" → ")}</p><p><span className="block text-xs text-[var(--nav-text-color)]">First delivery</span>{stops.offloads[0]?.label}<span className="block text-xs text-[var(--nav-text-color)]">{Math.max(0, stops.offloads.length - 1)} more, in your order</span></p></div>
        <details className="border-b border-[var(--card-border)] pb-3"><summary className="cursor-pointer py-2 text-sm font-semibold text-[#0891B2]">View full WhatsApp message</summary><div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-[var(--card-bg)] p-3 text-sm" aria-label="Review WhatsApp driver instructions">{instructions.message}</div><button type="button" disabled={!instructions.canOpenWhatsApp || busy} onClick={() => void instructions.copyMessage()} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 text-sm disabled:opacity-40"><ClipboardCopy size={16} />Copy message</button></details>
        <details className="border-b border-[var(--card-border)] pb-3"><summary className="cursor-pointer py-2 text-sm font-semibold text-[#0891B2]">Edit safety &amp; extra notes</summary><label className="mt-3 block text-sm font-semibold">Safety instructions<textarea rows={4} maxLength={4000} value={instructions.safetyNotes} disabled={busy} onChange={event => instructions.setSafetyNotes(event.target.value)} className={`${field} py-3 font-normal`} /></label><label className="mt-3 block text-sm font-semibold">Extra notes<textarea rows={3} maxLength={4000} value={instructions.additionalNotes} disabled={busy} onChange={event => instructions.setAdditionalNotes(event.target.value)} className={`${field} py-3 font-normal`} placeholder="Anything else the driver needs to know?" /></label></details>
        <WhatsAppRecipientFields systemNumber={instructions.assignedDriver?.phone} mode={recipientMode} onModeChange={setRecipientMode} manualNumber={manualNumber} onNumberChange={setManualNumber} disabled={busy} />
        {instructions.success && <p role="status" className="text-sm text-[var(--success-text)]">{instructions.success}</p>}
      </section>}
    </div>
    <footer role="region" aria-label="Dispatch actions" className="shrink-0 border-t border-[var(--card-border)] bg-[var(--background)] px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p aria-live="polite" className="mb-2 text-center text-xs text-[var(--nav-text-color)]">{busy ? "Saving…" : step === 0 ? "Next confirms the assignment." : step === 1 ? "Next saves this stop order." : instructions.dirty ? "Save edited instructions before opening WhatsApp." : "✓ Assignment and stop order saved"}</p>
      <div className="flex gap-2">{step > 0 && <button type="button" disabled={busy} onClick={() => setStep(step === 2 ? 1 : 0)} className="min-h-11 rounded-xl border border-[var(--card-border)] px-4 text-sm font-semibold disabled:opacity-40">Back</button>}
        {step === 0 && <button type="button" disabled={!chosenDriver || !chosenTruck || !routeDate || (assignmentDirty && !user) || busy} onClick={() => void confirmAssignment()} className={primary}>{busy ? "Saving…" : "Next: Arrange stops"}<ChevronRight size={17} className="shrink-0" /></button>}
        {step === 1 && <button type="button" disabled={!assignmentReady || busy} onClick={() => void reviewInstructions()} className={primary}>{busy ? "Saving…" : "Next: Review & send"}<ChevronRight size={17} className="shrink-0" /></button>}
        {step === 2 && (instructions.dirty ? <button type="button" disabled={busy || !assignmentReady} onClick={() => void saveReviewChanges()} className={primary}>{busy ? "Saving…" : "Save changes"}</button> : canSend ? <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className={primary}><MessageCircle size={17} className="shrink-0" />{recipientMode === "manual" && !manualNumber.trim() ? "Choose contact in WhatsApp" : "Open WhatsApp"}</a> : <button type="button" disabled className={primary}>Open WhatsApp</button>)}
      </div>
    </footer>
  </div>;
}
