import { describe, expect, it } from "vitest";
import {
  DASH,
  formatDay,
  formatLongDay,
  formatPercent,
  formatRand,
  formatSignedPercent,
  formatSignedRand,
  movementArrow,
  movementOf,
  movementText,
  movementWord,
  orderForDisplay,
} from "./display";

describe("formatRand", () => {
  it("reads as a plain rand amount with two decimals", () => {
    expect(formatRand(31.32)).toBe("R 31,32");
    expect(formatRand(22.98)).toBe("R 22,98");
    expect(formatRand(0)).toBe("R 0,00");
  });
});

describe("formatPercent", () => {
  it("never carries a currency marker, which is the whole point of keeping it separate", () => {
    const formatted = formatPercent(-3.48);
    expect(formatted).toBe("-3,48%");
    expect(formatted).not.toContain("R");
  });
  it("keeps two decimals, so a column of percentages lines up", () => {
    expect(formatPercent(10.01)).toBe("10,01%");
    expect(formatPercent(0)).toBe("0,00%");
    expect(formatPercent(40)).toBe("40,00%");
  });
  it("holds an honest zero rather than blanking it", () => {
    expect(formatPercent(0)).not.toBe(DASH);
  });
  it("drops the comma when no decimals are asked for", () => {
    expect(formatPercent(5.5, 0)).toBe("6%");
    expect(formatPercent(-0.45, 1)).toBe("-0,5%");
  });
});

describe("formatSignedPercent", () => {
  it("always spells out the direction, so a rise and a fall never look alike", () => {
    expect(formatSignedPercent(10.01)).toBe("+10,01%");
    expect(formatSignedPercent(-3.48)).toBe("-3,48%");
  });
  it("leaves a genuine zero unsigned, because it did not move either way", () => {
    expect(formatSignedPercent(0)).toBe("0,00%");
  });
  it("cannot turn a fall into an amount of money", () => {
    expect(formatSignedPercent(-2.04)).not.toContain("R");
  });
});

describe("formatSignedRand", () => {
  it("spells out the direction against the amount", () => {
    expect(formatSignedRand(2.3)).toBe("+R 2,30");
    expect(formatSignedRand(-0.88)).toBe("-R 0,88");
    expect(formatSignedRand(0)).toBe("R 0,00");
  });
});

describe("formatDay", () => {
  it("reads as a day a person would say out loud, matching the app's own format", () => {
    expect(formatDay("2026-09-02")).toBe("02 Sept 2026");
    expect(formatDay("2022-08-01")).toBe("01 Aug 2022");
    expect(formatDay("2024-12-31")).toBe("31 Dec 2024");
  });
  it("does not slip a day when the machine is behind UTC", () => {
    // new Date("2022-06-01") is UTC midnight, which is the previous day in any
    // negative offset. The parts are read off the text instead.
    expect(formatDay("2022-06-01")).toBe("01 Jun 2022");
    expect(formatDay("2022-06-01")).not.toContain("31 May");
  });
  it("hands back anything it cannot read rather than showing an invalid date", () => {
    expect(formatDay("not a date")).toBe("not a date");
    expect(formatDay("2026-13-01")).toBe("2026-13-01");
    expect(formatDay("")).toBe("");
  });
});

describe("formatLongDay", () => {
  it("spells the month out, for the places with room", () => {
    expect(formatLongDay("2026-09-02")).toBe("2 September 2026");
    expect(formatLongDay("2026-11-30")).toBe("30 November 2026");
  });
});

describe("movementOf", () => {
  it("reads a rise and a fall apart", () => {
    expect(movementOf(1)).toBe("up");
    expect(movementOf(-1)).toBe("down");
    expect(movementOf(0)).toBe("flat");
  });
  it("has no direction for a missing movement, which is the first price", () => {
    expect(movementOf(null)).toBeNull();
    expect(movementOf(undefined)).toBeNull();
  });
});

describe("movementText, movementArrow and movementWord", () => {
  it("pairs a colour with an arrow, so colour is never the only signal", () => {
    expect(movementText(1)).toBe("text-orange-600 dark:text-orange-300");
    expect(movementText(-1)).toBe("text-teal-600 dark:text-teal-300");
    expect(movementArrow(1)).toBe("▲");
    expect(movementWord(1)).toBe("up");
    expect(movementArrow(-1)).toBe("▼");
    expect(movementWord(-1)).toBe("down");
  });
  it("lights a rise as a cost and a fall as a saving", () => {
    expect(movementText(1)).toContain("orange");
    expect(movementText(-1)).toContain("teal");
  });
  it("reads a real zero as flat rather than colouring it as a move", () => {
    expect(movementOf(0)).toBe("flat");
    expect(movementArrow(0)).toBe("•");
    expect(movementWord(0)).toBe("unchanged");
  });
  it("keeps a missing movement quiet", () => {
    expect(movementText(null)).toBe("text-[var(--nav-text-color)]");
    expect(movementArrow(null)).toBe("");
    expect(movementWord(null)).toBe("");
  });

});

describe("orderForDisplay", () => {
  const rows = [
    { effectiveDate: "2022-06-01", change: null, percentChange: null, carriedPercent: null },
    { effectiveDate: "2022-07-06", change: 2.3, percentChange: 10.01, carriedPercent: 5.01 },
    { effectiveDate: "2022-08-03", change: -0.88, percentChange: -3.48, carriedPercent: -1.74 },
  ];

  it("reads oldest first when asked for the oldest first", () => {
    expect(orderForDisplay(rows, false).map(r => r.effectiveDate)).toEqual([
      "2022-06-01", "2022-07-06", "2022-08-03",
    ]);
  });

  it("reads newest first by default, which is how the table opens", () => {
    expect(orderForDisplay(rows, true).map(r => r.effectiveDate)).toEqual([
      "2022-08-03", "2022-07-06", "2022-06-01",
    ]);
  });

  it("keeps every row's figures attached to its own date, whichever way it is read", () => {
    // This is the whole reason the sort is a display concern only: reversing
    // the table must not re-pair a change with the wrong price.
    for (const ordered of [orderForDisplay(rows, true), orderForDisplay(rows, false)]) {
      const june = ordered.find(r => r.effectiveDate === "2022-06-01")!;
      const july = ordered.find(r => r.effectiveDate === "2022-07-06")!;
      const august = ordered.find(r => r.effectiveDate === "2022-08-03")!;
      expect(june.change).toBeNull();
      expect(july.change).toBe(2.3);
      expect(july.carriedPercent).toBe(5.01);
      expect(august.change).toBe(-0.88);
      expect(august.percentChange).toBe(-3.48);
    }
  });

  it("sorts by date rather than by the order it was handed, so a row cannot drift", () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    expect(orderForDisplay(shuffled, false).map(r => r.effectiveDate)).toEqual([
      "2022-06-01", "2022-07-06", "2022-08-03",
    ]);
  });

  it("does not reorder the array it was given", () => {
    const original = [...rows];
    orderForDisplay(rows, true);
    expect(rows).toEqual(original);
  });

  it("copes with no records at all", () => {
    expect(orderForDisplay([], true)).toEqual([]);
    expect(orderForDisplay([], false)).toEqual([]);
  });
});

describe("DASH", () => {
  it("is a single character, so a column of them stays narrow on a phone", () => {
    expect(DASH).toBe("—");
  });
});
