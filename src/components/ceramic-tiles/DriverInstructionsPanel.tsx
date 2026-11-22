"use client";

import { useEffect } from "react";
import { Check, ClipboardCopy, Save, X } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useCeramicInstructions } from "./useCeramicInstructions";

import { CeramicStopOrderEditor } from "./StopOrderEditor";
import { WhatsAppRecipientPicker } from "./WhatsAppRecipientPicker";

type Region = "garden_route" | "eastern_cape";
type DriverChoice = { id: string; name: string; phone: string | null };
type TruckChoice = { id: string; fleetNumber: string; registration?: string | null };

export function CeramicDriverInstructions({
  shipment,
  token,
  region,
  drivers,
  trucks,
  onClose,
  requireVersionReview = false,
  compact = false,
  embedded = false,
  assignmentPending = false,
  onSaved,
  onSaveStart,
  closeLabel = "Close",
  onStateChange,
}: {
  shipment: Doc<"ceramicShipments">;
  token: string;
  region: Region;
  drivers: DriverChoice[];
  trucks: TruckChoice[];
  onClose: () => void;
  requireVersionReview?: boolean;
  compact?: boolean;
  embedded?: boolean;
  assignmentPending?: boolean;
  onSaved?: () => void;
  onSaveStart?: () => void;
  closeLabel?: string;
  onStateChange?: (state: { dirty: boolean; saving: boolean }) => void;
}) {
  const { safetyNotes, setSafetyNotes, additionalNotes, setAdditionalNotes, currentStopOrder, setStopOrder,
    assignedDriver, assignedTruck, needsVersionReview, hasEdits, dirty, saving, error, success, setSuccess,
    handleSave, copyMessage, canOpenWhatsApp, message } = useCeramicInstructions({ shipment, token, region, drivers, trucks, requireVersionReview });

  const reviewPending = needsVersionReview || (embedded && (!shipment.driverInstructions || shipment.driverInstructions.updatedAt < shipment.updatedAt));
  useEffect(() => { onStateChange?.({ dirty: hasEdits, saving }); }, [hasEdits, saving, onStateChange]);
  const saveAndContinue = async () => {
    if (assignmentPending || saving) return;
    onSaveStart?.();
    if (embedded && !dirty && !reviewPending) { onSaved?.(); return; }
    if (await handleSave()) onSaved?.();
  };

  return <section className={embedded ? "min-w-0" : "rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm"} aria-label="Ceramic Tiles driver instructions">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] pb-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0891B2]">Dispatch instructions</p>
        <h2 className="text-lg font-semibold">{shipment.shipmentNumber} · Driver handoff</h2>
        <p className="text-xs text-[var(--nav-text-color)]">Arrange loading and offloading below, then save before opening WhatsApp.</p>
      </div>
      <button type="button" onClick={onClose} disabled={saving} className="inline-flex items-center gap-1 rounded-md border border-[var(--card-border)] px-3 py-2 text-xs font-semibold"><X size={14}/>{closeLabel}</button>
    </div>

    {reviewPending && <p role="status" className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Review Version {shipment.version} quantities and stops, then save instructions before sending.</p>}
    {error && <p role="alert" className="mb-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-surface)] p-2 text-sm text-[var(--danger-text)]">{error}</p>}
    {success && <p role="status" className="mb-3 flex items-center gap-2 rounded-md border border-[var(--success-border)] bg-[var(--success-surface)] p-2 text-sm text-[var(--success-text)]"><Check size={15}/>{success}</p>}

    <div className="mb-4 grid gap-2 rounded-lg border border-[var(--card-border)] bg-[var(--surface-sunken)] p-3 text-xs md:grid-cols-3">
      <p><span className="font-semibold">Driver:</span> {assignedDriver?.name || "Not assigned"}</p>
      <p><span className="font-semibold">Truck:</span> {assignedTruck ? [assignedTruck.registration, assignedTruck.fleetNumber].filter(Boolean).join(" · ") : "Not assigned"}</p>
      <p><span className="font-semibold">System number:</span> {assignedDriver?.phone || "No driver contact number"}</p>
    </div>

    {embedded && <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 shadow-sm">
      <p className="text-xs text-[var(--nav-text-color)]">{assignmentPending ? "Review and save the assignment first." : "Next: review the saved message and choose a WhatsApp recipient."}</p>
      <button type="button" onClick={() => void saveAndContinue()} disabled={saving || assignmentPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0891B2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><Save size={15}/>{saving ? "Saving…" : dirty || reviewPending ? "Save & continue to WhatsApp" : "Continue to WhatsApp"}</button>
    </div>}
    <div className={`grid min-w-0 gap-4 ${embedded ? "2xl:grid-cols-2" : "xl:grid-cols-2"}`}>
      <div className="space-y-4">
        <CeramicStopOrderEditor shipment={shipment.snapshot} order={currentStopOrder} disabled={saving} onChange={order => { setStopOrder(order); setSuccess(""); }} />
        <label className="block text-xs font-semibold">
          Standard safety instructions (editable)
          <textarea disabled={saving} rows={compact || embedded ? 4 : 11} maxLength={4000} value={safetyNotes} onChange={(event) => { setSafetyNotes(event.target.value); setSuccess(""); }}
            className="mt-1 w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[#06B6D4]" />
        </label>
        <label className="block text-xs font-semibold">
          Additional collection, offloading or driver notes
          <textarea disabled={saving} rows={compact || embedded ? 3 : 5} maxLength={4000} value={additionalNotes} onChange={(event) => { setAdditionalNotes(event.target.value); setSuccess(""); }}
            placeholder="Add warehouse times, contact names, delivery restrictions or special instructions..."
            className="mt-1 w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3 text-sm font-normal text-[var(--foreground)] outline-none focus:border-[#06B6D4]" />
        </label>
        {!embedded && <button type="button" onClick={() => void saveAndContinue()} disabled={(!dirty && !reviewPending) || saving || assignmentPending}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          <Save size={15}/>{saving ? "Saving..." : "Save instructions"}
        </button>}
      </div>

      <div className="flex min-h-[350px] flex-col overflow-hidden rounded-lg border border-[var(--card-border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] bg-[var(--surface-sunken)] px-3 py-2">
          <h3 className="text-sm font-semibold">WhatsApp message preview</h3>
          {!embedded && <div className="flex items-center gap-2">
            <button type="button" onClick={() => void copyMessage()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold"><ClipboardCopy size={14}/>Copy</button>
            <WhatsAppRecipientPicker message={message} driverName={assignedDriver?.name ?? "the assigned driver"} systemNumber={assignedDriver?.phone}
              disabled={!canOpenWhatsApp || reviewPending || assignmentPending} disabledReason={assignmentPending ? "Review and save the assignment first" : dirty || reviewPending ? "Save changes first" : saving ? "Saving instructions" : "Assign a driver and truck first"} />
          </div>}
        </div>
        <textarea readOnly aria-label="Review WhatsApp driver instructions" value={message} className="min-h-[400px] w-full flex-1 resize-y bg-[var(--card-bg)] p-3 font-mono text-xs text-[var(--foreground)] outline-none" />
        <p className="border-t border-[var(--card-border)] p-3 text-xs text-[var(--nav-text-color)]">
          {dirty ? "Save the edited instructions before opening WhatsApp. " : ""}
          WhatsApp opens a draft only — you must review and press Send yourself.
          If the phone number is missing or the message is too long, use Copy.
        </p>
      </div>
    </div>
  </section>;
}
