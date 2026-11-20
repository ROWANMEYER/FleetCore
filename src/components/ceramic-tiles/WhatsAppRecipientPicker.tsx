"use client";

import { useId, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { normaliseWhatsAppNumber } from "@/src/lib/ceramic-tiles/driverInstructions";

/** Choose the recipient for this draft without changing the driver's contact record. */
export function WhatsAppRecipientPicker({ message, driverName, systemNumber, disabled, disabledReason }: {
  message: string;
  driverName: string;
  systemNumber: string | null | undefined;
  disabled: boolean;
  disabledReason: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const choiceName = useId();
  const [mode, setMode] = useState<"system" | "manual">("system");
  const [manualNumber, setManualNumber] = useState("");
  const savedPhone = normaliseWhatsAppNumber(systemNumber);
  const manualPhone = normaliseWhatsAppNumber(manualNumber);
  const chooseContact = mode === "manual" && !manualNumber.trim();
  const recipient = mode === "system" ? savedPhone : manualPhone;
  const canContinue = !disabled && (chooseContact || !!recipient);
  const href = `https://wa.me/${chooseContact ? "" : recipient ?? ""}?text=${encodeURIComponent(message)}`;
  const open = () => {
    if (disabled) return;
    setMode(savedPhone ? "system" : "manual");
    setManualNumber("");
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const choiceClass = "flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--card-border)] p-3 text-sm has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-500/10";

  return <>
    <button type="button" disabled={disabled} onClick={open} title={disabled ? disabledReason : "Choose a WhatsApp recipient"}
      className="inline-flex min-h-11 items-center gap-1 rounded-md bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
      <MessageCircle size={15} />Open WhatsApp
    </button>
    <dialog ref={dialog} aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-[var(--foreground)] shadow-2xl backdrop:bg-slate-950/60">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h3 id={titleId} className="text-lg font-semibold">Send WhatsApp instructions</h3><p className="mt-1 break-words text-sm text-[var(--nav-text-color)]">Who should receive the instructions for {driverName}?</p></div>
        <button type="button" onClick={close} aria-label="Close recipient chooser" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)]"><X size={18} /></button>
      </div>
      <fieldset className="min-w-0 space-y-3">
        <legend className="mb-2 text-sm font-semibold">Choose the WhatsApp number</legend>
        <label className={`${choiceClass} ${!savedPhone ? "cursor-not-allowed opacity-50" : ""}`}>
          <input type="radio" name={choiceName} value="system" checked={mode === "system"} disabled={!savedPhone} onChange={() => setMode("system")} className="mt-1 h-4 w-4 shrink-0 accent-cyan-600" />
          <span className="min-w-0"><span className="block font-semibold">Use system number</span><span className="mt-1 block break-words text-[var(--nav-text-color)]">{savedPhone ? systemNumber : "No valid number saved for this driver"}</span></span>
        </label>
        <label className={choiceClass}>
          <input type="radio" name={choiceName} value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} className="mt-1 h-4 w-4 shrink-0 accent-cyan-600" />
          <span className="min-w-0"><span className="block font-semibold">Choose manually</span><span className="mt-1 block text-[var(--nav-text-color)]">Use a different number or select a contact in WhatsApp.</span></span>
        </label>
        {mode === "manual" && <div className="space-y-2">
          <label className="block text-sm font-semibold">WhatsApp number (optional)
            <input type="tel" inputMode="tel" autoComplete="off" maxLength={32} value={manualNumber} onChange={event => setManualNumber(event.target.value)} aria-invalid={!!manualNumber.trim() && !manualPhone} aria-describedby={`${titleId}-number-help`}
              placeholder="e.g. 082 123 4567 or +27 82 123 4567" className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-base font-normal text-[var(--foreground)]" />
          </label>
          <p id={`${titleId}-number-help`} className="text-xs text-[var(--nav-text-color)]">Leave blank to choose a contact inside WhatsApp.</p>
          {!!manualNumber.trim() && !manualPhone && <p role="alert" className="text-sm text-[var(--danger-text)]">Enter a valid mobile number, including its country code for numbers outside South Africa.</p>}
        </div>}
      </fieldset>
      <p className="mt-4 text-xs text-[var(--nav-text-color)]">This choice applies to this message only. Review the draft in WhatsApp and press Send yourself.</p>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={close} className="min-h-11 rounded-lg border border-[var(--card-border)] px-4 text-sm font-semibold">Cancel</button>
        {canContinue ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={close} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0891B2] px-4 text-center text-sm font-bold text-white"><MessageCircle size={16} className="shrink-0" />{chooseContact ? "Choose contact in WhatsApp" : "Continue to WhatsApp"}</a>
          : <button type="button" disabled className="min-h-11 rounded-lg bg-[#0891B2] px-4 text-sm font-bold text-white opacity-40">Continue to WhatsApp</button>}
      </div>
    </dialog>
  </>;
}
