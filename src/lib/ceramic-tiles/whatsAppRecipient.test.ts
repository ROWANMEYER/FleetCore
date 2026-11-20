import { describe, expect, it } from "vitest";
import { whatsAppDraftHref } from "./whatsAppRecipient";
describe("WhatsApp draft recipients", () => {
  const message = "SHIPMENT SH00123456\nPlease travel safely 🙏 & confirm.";
  it("uses the system number only when selected", () => {
    const url = new URL(whatsAppDraftHref(message, "system", "082 123 4567", "0829876543")!);
    expect(url.pathname).toBe("/27821234567"); expect(url.searchParams.get("text")).toBe(message);
  });
  it("uses a different manual local number", () => expect(new URL(whatsAppDraftHref(message, "manual", "0821234567", "082 987 6543")!).pathname).toBe("/27829876543"));
  it("accepts an international manual number", () => expect(new URL(whatsAppDraftHref(message, "manual", null, "+44 7700 900123")!).pathname).toBe("/447700900123"));
  it("opens contact selection for an empty manual number without falling back to the system", () => {
    const url = new URL(whatsAppDraftHref(message, "manual", "0821234567", "  ")!);
    expect(url.pathname).toBe("/"); expect(url.searchParams.get("text")).toBe(message);
  });
  it("allows contact selection when no system number exists", () => expect(whatsAppDraftHref(message, "manual", null)).not.toBeNull());
  it("blocks invalid manual numbers even with a valid system number", () => expect(whatsAppDraftHref(message, "manual", "0821234567", "123")).toBeNull());
  it("blocks a missing or invalid selected system number", () => { expect(whatsAppDraftHref(message, "system", null)).toBeNull(); expect(whatsAppDraftHref(message, "system", "bad-number")).toBeNull(); });
});
