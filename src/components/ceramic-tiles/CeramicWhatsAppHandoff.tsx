"use client";

import { CeramicBillingReview } from "./CeramicBillingReview";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardCopy, Pencil } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { normaliseWhatsAppNumber } from "@/src/lib/ceramic-tiles/driverInstructions";
import { ceramicSavedHandoff } from "@/src/lib/ceramic-tiles/handoff";
import type { CeramicFleet } from "./useCeramicInstructions";
import { WhatsAppRecipientPicker } from "./WhatsAppRecipientPicker";

const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-sunken)]";

export function CeramicWhatsAppHandoff({ shipment, fleet, onEditAssignment, onEditInstructions, onNext, onInteractionChange }: {
  shipment: Doc<"ceramicShipments">; fleet: CeramicFleet; onEditAssignment: () => void; onEditInstructions: () => void; onNext?: () => void; onInteractionChange?: (state: { dirty: boolean; saving: boolean }) => void;
}) {
  const [billingReady, setBillingReady] = useState(false);
  const handoff = ceramicSavedHandoff(shipment, fleet);
  const [opened, setOpened] = useState(false), [copied, setCopied] = useState(false), [copyError, setCopyError] = useState("");
  const copy = async () => {
    if (!handoff.ready) return;
    setCopyError("");
    try { await navigator.clipboard.writeText(handoff.message); setCopied(true); }
    catch { setCopyError("Select the message below and copy it, then paste it into WhatsApp."); }
  };
  if (!handoff.ready) return <div className="space-y-4" role="status">
    <p className="text-sm text-[var(--warning-text)]">{handoff.reason}</p>
    <button type="button" className={secondary} onClick={handoff.action === "assignment" ? onEditAssignment : onEditInstructions}>{handoff.action === "assignment" ? "Review assignment" : "Review instructions"}<ArrowRight size={16} /></button>
  </div>;
  return <section aria-label="Send shipment to driver" className="space-y-4">
    <div><h3 className="text-lg font-semibold">Review and send</h3><p className="mt-1 text-sm text-[var(--nav-text-color)]">The instructions are saved. Review the message, choose the recipient, then open WhatsApp.</p></div>
    <CeramicBillingReview shipmentId={shipment._id} onReadyChange={setBillingReady} onInteractionChange={onInteractionChange} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] p-3">
      <div className="text-sm"><p className="font-semibold">{handoff.driverName}</p><p className="mt-1 text-xs text-[var(--nav-text-color)]">{handoff.truckLabel} · {shipment.routeDate}</p></div>
      <div className="flex flex-wrap gap-2"><WhatsAppRecipientPicker message={handoff.message} driverName={handoff.driverName} systemNumber={handoff.driverPhone} disabled={!billingReady} disabledReason="Confirm internal billing or flag it for review before sending." onDraftOpened={() => setOpened(true)} /><button type="button" className={secondary} disabled={!billingReady} onClick={() => void copy()}><ClipboardCopy size={16} />Copy message</button></div>
    </div>
    {!normaliseWhatsAppNumber(handoff.driverPhone) && <p className="text-sm text-[var(--nav-text-color)]">No valid driver number is saved. You can choose a contact in WhatsApp or enter another number.</p>}
    {(opened || copied) && <div role="status" className="flex items-start gap-2 rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-sm text-[var(--success-text)]"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><p>{opened ? "WhatsApp draft opened. Review it and press Send in WhatsApp." : "Message copied. Paste it into WhatsApp, review it and press Send."}</p></div>}
    {copyError && <p role="alert" className="text-sm text-[var(--warning-text)]">{copyError}</p>}
    <div className="flex items-center justify-between gap-3"><label htmlFor={`ceramic-saved-message-${shipment._id}`} className="text-sm font-semibold">Message to send</label><button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#0891B2]" onClick={onEditInstructions}><Pencil size={14} />Edit instructions</button></div>
    <textarea id={`ceramic-saved-message-${shipment._id}`} readOnly value={handoff.message} rows={14} className="w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] p-3 font-mono text-xs leading-5 text-[var(--foreground)]" />
    <p className="text-xs text-[var(--nav-text-color)]">FleetCore opens a draft. The message is sent only when you press Send in WhatsApp.</p>
    {(opened || copied) && onNext && <div className="flex justify-end border-t border-[var(--card-border)] pt-4"><button type="button" className={secondary} onClick={onNext}>Next shipment needing action<ArrowRight size={16} /></button></div>}
  </section>;
}
