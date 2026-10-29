import { describe, expect, it } from "vitest";
import { cleanAdditionalPhones, driverContactNumbers, isDialablePhone, phoneDigits } from "./driverPhones";

describe("driver phone numbers", () => {
  it("uses the same dialling number for SA local, international and 00 prefixes", () => {
    expect(phoneDigits("082 123 4567")).toBe("27821234567");
    expect(phoneDigits("+27 (82) 123-4567")).toBe("27821234567");
    expect(phoneDigits("0027 82 123 4567")).toBe("27821234567");
    expect(phoneDigits("+44 20 1234 5678")).toBe("442012345678");
  });
  it("keeps the legacy primary number and adds labeled numbers without duplicates", () => {
    const numbers = driverContactNumbers("082 123 4567", [
      { label: "Personal", number: "+27821234567", whatsapp: false },
      { label: "Work", number: "083 234 5678", whatsapp: true },
    ]);
    expect(numbers).toEqual([
      { label: "Primary", number: "082 123 4567", whatsapp: true },
      { label: "Work", number: "083 234 5678", whatsapp: true },
    ]);
    expect(driverContactNumbers()).toEqual([]);
  });
  it("does not make callable links out of missing or invalid legacy values", () => {
    for (const value of ["", "N/A", "123", "082-call-me", "0821234567/0831234567"]) expect(isDialablePhone(value)).toBe(false);
    expect(isDialablePhone("+27 82 123 4567")).toBe(true);
  });
  it("validates labels, number length and duplicates before saving", () => {
    expect(() => cleanAdditionalPhones("0821234567", [{ label: "Work", number: "+27821234567", whatsapp: true }]))
      .toThrow(/\+27821234567 is listed more than once — it is already used as the primary number/);
    expect(() => cleanAdditionalPhones("", [
      { label: "Work", number: "0832345678", whatsapp: false },
      { label: "Personal", number: "083 234 5678", whatsapp: true },
    ])).toThrow(/083 234 5678 is listed more than once — it is already used as Work/);
    expect(() => cleanAdditionalPhones("", [{ label: "", number: "0832345678", whatsapp: false }])).toThrow("label");
    expect(() => cleanAdditionalPhones("", [{ label: "Work", number: "123", whatsapp: false }])).toThrow("valid phone");
    expect(cleanAdditionalPhones("legacy unchanged", [
      { label: " Work ", number: " 083 234 5678 ", whatsapp: false },
      { label: "Unused row", number: "", whatsapp: true },
    ])).toEqual([{ label: "Work", number: "083 234 5678", whatsapp: false }]);
  });
  it("rejects more than ten additional numbers", () => {
    expect(() => cleanAdditionalPhones("", Array.from({ length: 11 }, () => ({ label: "Work", number: "0832345678", whatsapp: true })))).toThrow("up to 10");
  });
});
