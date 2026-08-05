import { describe, expect, it } from "vitest";
import {
  daysUntilBirthday,
  getBirthdayFromSAID,
  occurrenceDate,
} from "./birthdays";

describe("getBirthdayFromSAID", () => {
  it("parses the YYMMDD prefix from a 13-digit SA ID", () => {
    expect(getBirthdayFromSAID("8001015009087", 2026)).toEqual({
      month: 1,
      day: 1,
      year: 1980,
    });
  });

  it("maps recent two-digit years to 20xx", () => {
    // reference year 2026, cutoff 10 -> 05 -> 2005
    expect(getBirthdayFromSAID("0506081234567", 2026)).toEqual({
      month: 6,
      day: 8,
      year: 2005,
    });
  });

  it("treats the cutoff itself as 20xx", () => {
    // yy === cutoff (10) should be 2010
    expect(getBirthdayFromSAID("1001011234567", 2026)!.year).toBe(2010);
  });

  it("returns null for too-short or non-numeric IDs", () => {
    expect(getBirthdayFromSAID("12345", 2026)).toBeNull();
    expect(getBirthdayFromSAID("abcdefghijk", 2026)).toBeNull();
    expect(getBirthdayFromSAID("", 2026)).toBeNull();
  });

  it("returns null for impossible dates", () => {
    expect(getBirthdayFromSAID("9913455009087", 2026)).toBeNull(); // month 13
    expect(getBirthdayFromSAID("9901325009087", 2026)).toBeNull(); // day 32
    expect(getBirthdayFromSAID("9904315009087", 2026)).toBeNull(); // Apr 31
  });

  it("accepts Feb 29 when the derived year is a leap year", () => {
    // yy=08 -> 2008 (leap), so Feb 29 is valid
    expect(getBirthdayFromSAID("0802295009087", 2026)).toEqual({
      month: 2,
      day: 29,
      year: 2008,
    });
  });
});

describe("daysUntilBirthday", () => {
  const ref = new Date(2026, 7, 5); // 2026-08-05

  it("returns 0 for a birthday today", () => {
    expect(daysUntilBirthday(8, 5, ref)).toBe(0);
  });

  it("counts forward to an upcoming birthday", () => {
    expect(daysUntilBirthday(8, 10, ref)).toBe(5);
  });

  it("wraps a past birthday to next year", () => {
    // 2026-08-04 passed -> next occurrence 2027-08-04
    expect(daysUntilBirthday(8, 4, ref)).toBe(364);
  });

  it("handles the Dec -> Jan wraparound", () => {
    const jan1 = new Date(2026, 0, 1);
    expect(daysUntilBirthday(12, 31, jan1)).toBe(364);
    expect(daysUntilBirthday(1, 1, jan1)).toBe(0);
  });
});

describe("occurrenceDate", () => {
  it("formats this year's occurrence as YYYY-MM-DD", () => {
    const ref = new Date(2026, 7, 5);
    expect(occurrenceDate(8, 4, ref)).toBe("2026-08-04");
    expect(occurrenceDate(1, 1, ref)).toBe("2026-01-01");
  });
});
