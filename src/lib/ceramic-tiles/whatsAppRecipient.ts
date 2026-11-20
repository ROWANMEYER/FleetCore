import { normaliseWhatsAppNumber } from "./driverInstructions";
export type WhatsAppRecipientMode = "system" | "manual";
/** A missing manual number deliberately opens WhatsApp's own contact chooser. */
export function whatsAppDraftHref(message: string, mode: WhatsAppRecipientMode, systemNumber?: string | null, manualNumber = ""): string | null {
  const chooseContact = mode === "manual" && !manualNumber.trim();
  const phone = normaliseWhatsAppNumber(mode === "system" ? systemNumber : manualNumber);
  return chooseContact || phone ? `https://wa.me/${chooseContact ? "" : phone}?text=${encodeURIComponent(message)}` : null;
}
