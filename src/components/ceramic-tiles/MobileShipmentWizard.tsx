"use client";

import Link from "next/link";
import { ceramicAssignmentAccess, ceramicErrorMessage } from "@/src/lib/ceramic-tiles/assignmentAccess";
import { getRegionLabel } from "@/src/lib/regions";
import Image from "next/image";
import styles from "./CeramicMobile.module.css";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { CERAMIC_MAIN_REGION, ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ClipboardCopy, MessageCircle, MapPin, Truck, UserRound } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ceramicAssignmentComplete, ceramicPalletLabel, ceramicVersionNeedsReview, type CeramicDispatchShipment } from "@/src/lib/ceramic-tiles/mobileDispatch";
import { ceramicWorkflowStage } from "@/src/lib/ceramic-tiles/workflow";
import { normaliseWhatsAppNumber } from "@/src/lib/ceramic-tiles/driverInstructions";
import { orderedCeramicStops } from "@/src/lib/ceramic-tiles/stopOrder";
import { whatsAppDraftHref, type WhatsAppRecipientMode } from "@/src/lib/ceramic-tiles/whatsAppRecipient";
import { CeramicStopOrderEditor } from "./StopOrderEditor";
import { WhatsAppRecipientFields } from "./WhatsAppRecipientPicker";
import { useCeramicInstructions, type CeramicFleet } from "./useCeramicInstructions";

type Step = 0 | 1 | 2;
const field = styles.field;
const primary = styles.primary;

export function MobileShipmentWizard({ shipment, fleet, onBack }: {
  shipment: CeramicDispatchShipment; fleet: CeramicFleet; onBack: () => void;
}) {
  const { token, user, loading: authLoading } = useAuth();
  const access = ceramicAssignmentAccess(token ? user : null, shipment.region);
  const canEditAssignment = access.allowed && !authLoading;
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
  const reviewPending = ceramicWorkflowStage(shipment) === "instructions";
  const canSend = assignmentReady && reviewReached && !reviewPending && instructions.canOpenWhatsApp && !!href && !busy;
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); headingRef.current?.focus({ preventScroll: true }); }, [step]);

  const confirmAssignment = async () => {
    if (!chosenDriver || !chosenTruck || busy) return;
    if (assignmentDirty && !canEditAssignment) { setAssignmentError(access.message || "Checking your account access. Please try again."); return; }
    setAssignmentError(""); setAssigning(true);
    try {
      if (assignmentDirty) await assign({ token: token ?? undefined, routeDate, shipmentId: shipment._id, driverId: driverId as Id<"drivers">, truckId: truckId as Id<"trucks">, expectedVersion: shipment.version });
      setEditingAssignment(false); setStep(1);
    } catch (cause) { setAssignmentError(ceramicErrorMessage(cause, "Could not save assignment. Please try again.")); }
    finally { setAssigning(false); }
  };
  const reviewInstructions = async () => {
    if (!assignmentReady || busy) return;
    if ((instructions.dirty || reviewPending) && !await instructions.handleSave()) return;
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

  const titles = ["Assign truck and driver", "Arrange the stops", "Review and send"];
  const descriptions = ["Choose who is taking this shipment and confirm the planning date.", "Set the loading and delivery order for the driver.", "Check the saved instructions and choose the WhatsApp recipient."];
  return <div className={styles.wizard}>
    <header className={styles.header}>
      <div className={styles.backRow}>
        <button type="button" disabled={busy} onClick={leave} className={styles.back}><ArrowLeft size={18} />Shipments</button>
        <span className={`${styles.saveState} ${!instructions.dirty && !assignmentDirty && !reviewPending ? styles.saved : ""}`}>
          {busy ? "Saving…" : instructions.dirty || assignmentDirty ? "Draft" : reviewPending ? "Review instructions" : <><Check size={15} />Saved</>}
        </span>
      </div>
      <div className={styles.titleRow}><h1>{shipment.shipmentNumber}</h1><span className={styles.version}>Version {shipment.version}</span></div>
      <div className={styles.metrics}>
        <span className={styles.metric}><Image src="/images/ceramic-mobile/v1/icons/pallets.svg" alt="" width={23} height={23} />{ceramicPalletLabel(shipment.snapshot)}</span>
        <span className={styles.metric}><Truck size={23} />{shipment.snapshot.destinations.length} deliveries</span>
        <span className={styles.metric}><MapPin size={20} />{getRegionLabel(CERAMIC_MAIN_REGION)}</span>
      </div>
      <div className={styles.journey}>
        <Image className={styles.journeyTruck} src="/images/ceramic-mobile/v1/dispatch-truck.png" alt="" width={1774} height={887} sizes="100px" />
        <p className={styles.stepPill}>Step {step + 1} of 3</p>
        <nav aria-label="Dispatch steps" className={styles.steps}>
          {(["Assign truck & driver", "Arrange stops", "Send"] as const).map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} disabled={busy || index === 1 && !assignmentReady || index === 2 && !assignmentReady || index === 2 && step === 0 && !reviewReached} onClick={() => goTo(index as Step)} className={styles.step}><span className={styles.stepNumber}>{index < step ? <Check size={15} /> : index + 1}</span><span>{label}</span></button>)}
        </nav>
      </div>
    </header>
    <div ref={bodyRef} role="region" aria-label="Dispatch step content" className={styles.body}>
      <div className={styles.taskHeading}><span className={styles.iconTile}>{step === 0 ? <Truck size={26} /> : step === 1 ? <MapPin size={25} /> : <MessageCircle size={25} />}</span><h2 ref={headingRef} tabIndex={-1}>{titles[step]}</h2></div>
      <p className={styles.description}>{descriptions[step]}</p>
      {ceramicVersionNeedsReview(shipment) && <p role="status" className={styles.notice}>Shipment updated—review before sending. Check Version {shipment.version} quantities and stops.</p>}
      {step > 0 && !assignmentReady && <p role="alert" className={`${styles.notice} ${styles.error}`}>Confirm the truck, driver and planning date in step 1 before continuing.</p>}
      {(assignmentError || instructions.error) && <p role="alert" className={`${styles.notice} ${styles.error}`}>{assignmentError || instructions.error}</p>}
      {step === 0 && <section aria-label="Assign shipment">
        {!canEditAssignment && <div role="status" className={styles.notice}>{authLoading ? "Checking your account access…" : <>{access.message}{!user && <> <Link href="/login?next=ceramic-tiles" className="font-semibold underline">Sign in</Link></>}</>}</div>}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Shipment assignment</h3>
          {!editingAssignment ? <>
            <div className={styles.assignmentRow}><span className={styles.iconTile}><Truck size={25} /></span><div className={styles.assignmentInfo}><small>Truck</small><strong>{chosenTruck ? [chosenTruck.fleetNumber, chosenTruck.registration].filter(Boolean).join(" · ") : "Choose a truck"}</strong></div><button type="button" disabled={busy || !canEditAssignment} onClick={() => setEditingAssignment(true)} className={styles.change}>Change truck<ChevronRight size={16} /></button></div>
            <div className={styles.assignmentRow}><span className={styles.iconTile}><UserRound size={25} /></span><div className={styles.assignmentInfo}><small>Driver</small><strong>{chosenDriver?.name || "Choose a driver"}</strong></div><button type="button" disabled={busy || !canEditAssignment} onClick={() => setEditingAssignment(true)} className={styles.change}>Change driver<ChevronRight size={16} /></button></div>
          </> : <div className={styles.formFields}>
            <label className={styles.label}>Truck<select aria-label="Shipment truck" className={field} value={truckId} disabled={busy || !canEditAssignment} onChange={event => setTruckId(event.target.value)}><option value="">Choose a truck</option>{fleet.trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.fleetNumber}{truck.registration ? ` · ${truck.registration}` : ""}</option>)}</select></label>
            <label className={styles.label}>Driver<select aria-label="Shipment driver" className={field} value={driverId} disabled={busy || !canEditAssignment} onChange={event => { const id = event.target.value; setDriverId(id); setRecipientMode(normaliseWhatsAppNumber(fleet.drivers.find(d => d.id === id)?.phone) ? "system" : "manual"); setManualNumber(""); }}><option value="">Choose a driver</option>{fleet.drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
          </div>}
          <label className={`${styles.label} ${styles.dateField}`}>Planning date<input aria-label="Shipment planning date" type="date" className={field} value={routeDate} disabled={busy || !canEditAssignment} onChange={event => setRouteDate(event.target.value)} /></label>
          {!user && assignmentDirty && <p role="alert" className={styles.hint}><Link href="/login?next=ceramic-tiles" className="font-semibold underline">Sign in</Link> to save this assignment to Daily Planner and reports.</p>}
          <p className={styles.hint}><Check size={15} />{assignmentDirty && !canEditAssignment ? "Your truck and driver selections have not been saved." : assignmentDirty ? "Next saves the main load under TRANSVAAL. Locals are GEORGE → GEORGE." : "Assignment saved. Only the main load goes to Daily Planner."}</p>
        </div>
      </section>}
      {step === 1 && <div className={styles.panel}><CeramicStopOrderEditor shipment={shipment.snapshot} order={instructions.currentStopOrder} onChange={order => { instructions.setStopOrder(order); instructions.setSuccess(""); }} disabled={busy} compact activeTab={stopTab} onTabChange={setStopTab} /></div>}
      {step === 2 && <section aria-label="Review shipment" className={styles.review}>
        <div className={styles.reviewSummary}><strong>{instructions.assignedDriver?.name} · {[instructions.assignedTruck?.fleetNumber, instructions.assignedTruck?.registration].filter(Boolean).join(" · ")}</strong><p><small>Loading</small>{stops.pickups.map(town => town.label).join(" → ")}</p><p><small>First delivery</small>{stops.offloads[0]?.label}<small>{Math.max(0, stops.offloads.length - 1)} more, in your order</small></p></div>
        <details><summary>View full WhatsApp message</summary><div className={styles.message} aria-label="Review WhatsApp driver instructions">{instructions.message}</div><button type="button" disabled={!instructions.canOpenWhatsApp || reviewPending || busy} onClick={() => void instructions.copyMessage()} className={`${styles.secondary} mt-3`}><ClipboardCopy size={16} />Copy message</button></details>
        <details><summary>Edit safety &amp; extra notes</summary><label className={`${styles.label} mt-2`}>Safety instructions<textarea rows={4} maxLength={4000} value={instructions.safetyNotes} disabled={busy} onChange={event => instructions.setSafetyNotes(event.target.value)} className={field} /></label><label className={`${styles.label} mt-3`}>Extra notes<textarea rows={3} maxLength={4000} value={instructions.additionalNotes} disabled={busy} onChange={event => instructions.setAdditionalNotes(event.target.value)} className={field} placeholder="Anything else the driver needs to know?" /></label></details>
        <div className={styles.panel}><WhatsAppRecipientFields systemNumber={instructions.assignedDriver?.phone} mode={recipientMode} onModeChange={setRecipientMode} manualNumber={manualNumber} onNumberChange={setManualNumber} disabled={busy} /></div>
        {instructions.success && <p role="status" className={styles.success}>{instructions.success}</p>}
      </section>}
      <aside className={styles.nextCard} aria-label="What happens next">
        <Image src="/images/ceramic-mobile/v1/route-guide.svg" alt="" width={192} height={176} />
        <div><h3>{step === 2 ? "Send from WhatsApp" : "What happens next?"}</h3><p>{step === 0 ? "Arrange the loading and delivery stops, review the locations and confirm the order for this shipment." : step === 1 ? "Review the saved message, add any driver notes and choose the WhatsApp recipient." : "Open the draft, review it and press Send in WhatsApp. FleetCore does not send automatically."}</p></div>
      </aside>
    </div>
    <footer role="region" aria-label="Dispatch actions" className={styles.footer}>
      <p aria-live="polite" className={styles.footerHint}>{busy ? "Saving…" : step === 0 ? !chosenDriver || !chosenTruck ? "Choose a truck and driver to continue." : !routeDate ? "Choose the planning date to continue." : assignmentDirty && !user ? "Sign in to save this assignment." : "Next confirms the assignment." : step === 1 ? "Next saves and reviews this stop order." : instructions.dirty || reviewPending ? "Save the instructions before opening WhatsApp." : "Assignment and instructions saved · opens a draft only"}</p>
      <div className={styles.actions}>{step > 0 && <button type="button" disabled={busy} onClick={() => setStep(step === 2 ? 1 : 0)} className={styles.secondary}>Back</button>}
        {step === 0 && <button type="button" disabled={!chosenDriver || !chosenTruck || !routeDate || (assignmentDirty && !canEditAssignment) || busy} onClick={() => void confirmAssignment()} className={primary}>{busy ? "Saving…" : "Next: Arrange stops"}<ChevronRight size={19} /></button>}
        {step === 1 && <button type="button" disabled={!assignmentReady || busy} onClick={() => void reviewInstructions()} className={primary}>{busy ? "Saving…" : "Next: Review & send"}<ChevronRight size={19} /></button>}
        {step === 2 && (instructions.dirty || reviewPending ? <button type="button" disabled={busy || !assignmentReady} onClick={() => void saveReviewChanges()} className={primary}>{busy ? "Saving…" : "Save changes"}</button> : canSend ? <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className={primary}><MessageCircle size={18} />{recipientMode === "manual" && !manualNumber.trim() ? "Choose contact in WhatsApp" : "Open WhatsApp"}</a> : <button type="button" disabled className={primary}>Open WhatsApp</button>)}
      </div>
    </footer>
  </div>;
}
