import { describe, expect, it } from "vitest";
import {
  availableMonths,
  compareMonths,
  compositionProblem,
  compositionValue,
  defaultPair,
  estimatedRateImpact,
  lastPriceInMonth,
  monthKeyOf,
  monthLabel,
  swapPair,
} from "./compare";

/** Builds a record the way the backend would, with the figures worked out. */
const row = (effectiveDate: string, pricePerLitre: number, compositionPercent?: number) => ({
  _id: `${effectiveDate}-${pricePerLitre}`,
  effectiveDate,
  pricePerLitre,
  ...(compositionPercent === undefined ? {} : { compositionPercent }),
  change: null,
  percentChange: null,
  carriedPercent: null,
});

const HISTORY = [
  row("2024-11-05", 20.37, 50),
  row("2024-12-03", 19.9, 50),
  row("2025-01-07", 20.5, 55),
  row("2025-02-04", 21.1, 55),
  row("2025-11-04", 21.1, 60),
  row("2025-12-02", 22.0, 60),
  row("2026-01-06", 22.72, 60),
  row("2026-09-02", 22.84, 60),
];

describe("monthKeyOf", () => {
  it("keeps the year in the key, so two Septembers cannot be confused", () => {
    expect(monthKeyOf("2026-09-02")).toBe("2026-09");
    expect(monthKeyOf("2025-09-02")).toBe("2025-09");
    expect(monthKeyOf("2026-09-02")).not.toBe(monthKeyOf("2025-09-02"));
  });
  it("reads a month number as a month number, not as a day", () => {
    expect(monthKeyOf("2026-01-06")).toBe("2026-01");
    expect(monthKeyOf("2026-12-31")).toBe("2026-12");
  });
  it("refuses a month that is not one", () => {
    expect(monthKeyOf("2026-13-01")).toBeNull();
    expect(monthKeyOf("2026-00-01")).toBeNull();
  });
  it("refuses text that is not a date", () => {
    expect(monthKeyOf("not a date")).toBeNull();
    expect(monthKeyOf("")).toBeNull();
  });
});

describe("monthLabel", () => {
  it("names the month and the year together", () => {
    expect(monthLabel("2026-09")).toBe("Sept 2026");
    expect(monthLabel("2025-01")).toBe("Jan 2025");
  });
  it("hands back anything it cannot read", () => {
    expect(monthLabel("nonsense")).toBe("nonsense");
  });
});

describe("availableMonths", () => {
  it("lists each month once, oldest first", () => {
    expect(availableMonths(HISTORY)).toEqual([
      "2024-11", "2024-12", "2025-01", "2025-02", "2025-11", "2025-12", "2026-01", "2026-09",
    ]);
  });
  it("collapses several prices in one month down to a single month", () => {
    const rows = [row("2026-01-06", 22.72), row("2026-01-20", 23.1), row("2026-01-13", 22.9)];
    expect(availableMonths(rows)).toEqual(["2026-01"]);
  });
  it("finds nothing when nothing is recorded", () => {
    expect(availableMonths([])).toEqual([]);
  });
});

describe("lastPriceInMonth", () => {
  it("takes the last price of the month, which is the one that month ended on", () => {
    const rows = [row("2026-01-06", 22.72), row("2026-01-20", 23.1), row("2026-01-13", 22.9)];
    expect(lastPriceInMonth(rows, "2026-01")?.effectiveDate).toBe("2026-01-20");
    expect(lastPriceInMonth(rows, "2026-01")?.pricePerLitre).toBe(23.1);
  });

  it("finds the same price whichever way the rows arrive", () => {
    const rows = [row("2026-01-06", 22.72), row("2026-01-20", 23.1), row("2026-01-13", 22.9)];
    const reversed = [...rows].reverse();
    expect(lastPriceInMonth(reversed, "2026-01")?.effectiveDate).toBe("2026-01-20");
  });

  it("does not reach across a year boundary", () => {
    // December 2025 and January 2026 are adjacent months, and must not be confused.
    expect(lastPriceInMonth(HISTORY, "2025-12")?.effectiveDate).toBe("2025-12-02");
    expect(lastPriceInMonth(HISTORY, "2026-01")?.effectiveDate).toBe("2026-01-06");
  });

  it("has nothing to say about a month with no record", () => {
    expect(lastPriceInMonth(HISTORY, "2026-05")).toBeNull();
  });
});

describe("defaultPair", () => {
  it("opens on the two most recent months", () => {
    expect(defaultPair(HISTORY)).toEqual({ from: "2026-01", to: "2026-09" });
  });

  it("puts both ends on the same month when there is only one, rather than a blank half", () => {
    const rows = [row("2026-01-06", 22.72), row("2026-01-20", 23.1)];
    expect(defaultPair(rows)).toEqual({ from: "2026-01", to: "2026-01" });
  });

  it("has nothing to compare when nothing is recorded", () => {
    expect(defaultPair([])).toEqual({ from: null, to: null });
  });

  it("does not combine a December with a January as though they were neighbours in time", () => {
    const rows = [row("2025-12-02", 22.0), row("2026-01-06", 22.72)];
    expect(defaultPair(rows)).toEqual({ from: "2025-12", to: "2026-01" });
  });
});

describe("swapPair", () => {
  it("exchanges the two ends", () => {
    expect(swapPair({ from: "2026-01", to: "2026-09" })).toEqual({ from: "2026-09", to: "2026-01" });
  });
  it("survives being swapped twice", () => {
    const once = swapPair({ from: "2025-12", to: "2026-09" });
    expect(swapPair(once)).toEqual({ from: "2025-12", to: "2026-09" });
  });
  it("leaves a month compared with itself alone", () => {
    expect(swapPair({ from: "2026-01", to: "2026-01" })).toEqual({ from: "2026-01", to: "2026-01" });
  });
});

describe("compareMonths", () => {
  it("reads a later month against an earlier one as a rise", () => {
    const result = compareMonths(HISTORY, "2025-12", "2026-01");
    expect(result.randDifference).toBeCloseTo(0.72, 10);
    expect(result.dieselPercentChange).toBeCloseTo(3.272727272, 6);
  });

  it("reads the same two months the other way round as a fall", () => {
    const forward = compareMonths(HISTORY, "2025-12", "2026-01");
    const backward = compareMonths(HISTORY, "2026-01", "2025-12");
    // The sign follows the months, so reversing them reverses the sign. Measured
    // against the January price this time, not the December one.
    expect(backward.randDifference).toBeCloseTo(-0.72, 10);
    expect(backward.dieselPercentChange).toBeCloseTo(-3.1690140845, 6);
    // Which is not simply the negative of the forward result, because each
    // direction measures against a different baseline.
    expect(forward.dieselPercentChange).not.toBeNull();
    expect(backward.dieselPercentChange).not.toBeNull();
    expect(forward.dieselPercentChange!).not.toBeCloseTo(backward.dieselPercentChange!, 3);
  });

  it("compares across years without mixing up the year", () => {
    const result = compareMonths(HISTORY, "2024-12", "2026-09");
    expect(result.baseline?.row.effectiveDate).toBe("2024-12-03");
    expect(result.comparison?.row.effectiveDate).toBe("2026-09-02");
    expect(result.randDifference).toBeCloseTo(2.94, 10);
    expect(result.dieselPercentChange).toBeCloseTo(14.7738693467, 6);
  });

  it("uses the last price of each month, not the first", () => {
    const rows = [row("2026-01-06", 22.72), row("2026-01-20", 23.1), row("2026-02-03", 24.2)];
    const result = compareMonths(rows, "2026-01", "2026-02");
    expect(result.baseline?.price).toBe(23.1);
    expect(result.comparison?.price).toBe(24.2);
    expect(result.randDifference).toBeCloseTo(1.1, 10);
  });

  it("reports a genuine zero when a month is compared with itself", () => {
    const result = compareMonths(HISTORY, "2026-01", "2026-01");
    expect(result.randDifference).toBe(0);
    expect(result.dieselPercentChange).toBe(0);
  });

  it("reports a genuine zero when two months happen to end on the same price", () => {
    const rows = [row("2026-01-06", 22.1), row("2026-02-03", 22.1)];
    const result = compareMonths(rows, "2026-01", "2026-02");
    expect(result.randDifference).toBe(0);
    expect(result.dieselPercentChange).toBe(0);
  });

  it("names the date each price actually came from", () => {
    const result = compareMonths(HISTORY, "2025-11", "2025-12");
    expect(result.baseline?.label).toBe("Nov 2025");
    expect(result.baseline?.row.effectiveDate).toBe("2025-11-04");
    expect(result.comparison?.label).toBe("Dec 2025");
    expect(result.comparison?.row.effectiveDate).toBe("2025-12-02");
  });

  it("carries the composition recorded against the comparison month", () => {
    const result = compareMonths(HISTORY, "2025-12", "2026-01");
    expect(result.comparison?.row.compositionPercent).toBe(60);
  });

  it("gives no result at all when a month has nothing recorded", () => {
    const result = compareMonths(HISTORY, "2025-12", "2026-05");
    expect(result.baseline).not.toBeNull();
    expect(result.comparison).toBeNull();
    expect(result.randDifference).toBeNull();
    expect(result.dieselPercentChange).toBeNull();
  });

  it("refuses to divide by a baseline of zero rather than reporting Infinity", () => {
    const rows = [row("2026-01-06", 0), row("2026-02-03", 24.2)];
    const result = compareMonths(rows, "2026-01", "2026-02");
    // The money difference is still a real number, so it is still reported.
    expect(result.randDifference).toBe(24.2);
    expect(result.dieselPercentChange).toBeNull();
  });

  it("reports a zero baseline as no movement rather than as a fall to nothing", () => {
    const rows = [row("2026-01-06", 0), row("2026-02-03", 0)];
    const result = compareMonths(rows, "2026-01", "2026-02");
    expect(result.dieselPercentChange).toBeNull();
  });
});

describe("estimatedRateImpact", () => {
  it("scales the diesel move by the fuel share", () => {
    expect(estimatedRateImpact(10, 50)).toBe(5);
    expect(estimatedRateImpact(3.2727272727272725, 55)).toBeCloseTo(1.8, 10);
  });

  it("keeps the sign of the move it is scaling", () => {
    expect(estimatedRateImpact(-7.9, 60)).toBeCloseTo(-4.74, 10);
  });

  it("carries nothing at 0% and everything at 100%", () => {
    expect(estimatedRateImpact(11.18, 0)).toBe(0);
    expect(estimatedRateImpact(11.18, 100)).toBeCloseTo(11.18, 10);
  });

  it("keeps full precision so the rounding happens once, at the edge", () => {
    // 3.272727... * 55 / 100 is 1.8 exactly only after rounding, so the
    // unrounded figure must be kept to arrive there honestly.
    expect(estimatedRateImpact((0.72 / 22) * 100, 55)).toBeCloseTo(1.8, 12);
  });

  it("has no estimate when the move itself is unknown", () => {
    expect(estimatedRateImpact(null, 55)).toBeNull();
  });

  it("has no estimate for a composition that is not a number", () => {
    expect(estimatedRateImpact(10, Number.NaN)).toBeNull();
  });
});

describe("compositionProblem", () => {
  it("accepts a whole or a fractional percentage", () => {
    expect(compositionProblem("55")).toBeNull();
    expect(compositionProblem("40,5")).toBeNull();
    expect(compositionProblem("0")).toBeNull();
    expect(compositionProblem("100")).toBeNull();
    expect(compositionProblem(" 55 ")).toBeNull();
  });

  it("will not treat a blank as a zero, because the panel needs a real figure", () => {
    expect(compositionProblem("")).not.toBeNull();
    expect(compositionProblem("   ")).not.toBeNull();
  });

  it("refuses anything that is not a number", () => {
    expect(compositionProblem("abc")).toBe("Enter a number, such as 40 or 40,5.");
    expect(compositionProblem("40%")).toBe("Enter a number, such as 40 or 40,5.");
    expect(compositionProblem("1.2.3")).toBe("Enter a number, such as 40 or 40,5.");
  });

  it("refuses a share that is not a share", () => {
    expect(compositionProblem("-1")).toBe("A composition cannot be below 0%.");
    expect(compositionProblem("101")).toBe("A composition cannot be above 100%.");
  });
});

describe("compositionValue", () => {
  it("reads a valid entry as a number, decimals and all", () => {
    expect(compositionValue("55")).toBe(55);
    expect(compositionValue("40,5")).toBe(40.5);
    expect(compositionValue("40.5")).toBe(40.5);
    expect(compositionValue("0")).toBe(0);
    expect(compositionValue("100")).toBe(100);
  });

  it("has no value while the entry is unusable", () => {
    expect(compositionValue("")).toBeNull();
    expect(compositionValue("101")).toBeNull();
    expect(compositionValue("abc")).toBeNull();
  });
});
