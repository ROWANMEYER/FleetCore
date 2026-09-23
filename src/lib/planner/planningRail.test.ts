import { describe, it, expect } from "vitest";
import {
  accentColorFor,
  isWarmAccent,
  filterUnallocatedLoads,
  formatQuantity,
  planningLoadsCountLabel,
  addLoadsButtonLabel,
  formatBoardDateLabel,
  type LoadLike,
} from "./planningRail";

const loads: LoadLike[] = [
  {
    _id: "jd75naa4y0zrf10yrdxpvkft4n8eynpm",
    client: "SHAVECO",
    fromLocations: ["George"],
    toLocations: ["Kaap"],
  },
  {
    _id: "jd767qmxc9r0q7n1yph6p2eq158ey1cz",
    client: "ALIEN TREE SOLUTIONS",
    fromLocations: ["Mosselbaai"],
    toLocations: ["Bredasdorp"],
  },
  {
    _id: "jd7ar9anvasacj610wred69ycn8ezpps",
    client: "shaveco",
    fromLocations: ["George"],
    toLocations: ["Knysna", "Plett"],
  },
];

describe("filterUnallocatedLoads", () => {
  it("returns all loads for an empty query", () => {
    expect(filterUnallocatedLoads(loads, "")).toHaveLength(3);
    expect(filterUnallocatedLoads(loads, "  ")).toHaveLength(3);
  });

  it("matches by client (case-insensitive)", () => {
    const r = filterUnallocatedLoads(loads, "shaveco");
    expect(r.map((l) => l.client)).toEqual(["SHAVECO", "shaveco"]);
  });

  it("matches by client substring", () => {
    const r = filterUnallocatedLoads(loads, "ALIEN");
    expect(r.map((l) => l.client)).toEqual(["ALIEN TREE SOLUTIONS"]);
  });

  it("matches by pickup location", () => {
    const r = filterUnallocatedLoads(loads, "mosselbaai");
    expect(r.map((l) => l.client)).toEqual(["ALIEN TREE SOLUTIONS"]);
  });

  it("matches by delivery location", () => {
    const r = filterUnallocatedLoads(loads, "bredasdorp");
    expect(r.map((l) => l.client)).toEqual(["ALIEN TREE SOLUTIONS"]);
  });

  it("matches any of multiple delivery locations", () => {
    const r = filterUnallocatedLoads(loads, "plett");
    expect(r.map((l) => l.client)).toEqual(["shaveco"]);
  });

  it("returns nothing when no load matches", () => {
    expect(filterUnallocatedLoads(loads, "no-such-place")).toHaveLength(0);
  });
});

describe("accentColorFor", () => {
  it("is deterministic for the same identifier", () => {
    const a = accentColorFor("jd75naa4y0zrf10yrdxpvkft4n8eynpm");
    const b = accentColorFor("jd75naa4y0zrf10yrdxpvkft4n8eynpm");
    expect(a).toBe(b);
  });

  it("always returns a palette colour", () => {
    for (const id of ["a", "abc", "zzzzzz", "jd767qmxc9r0q7n1yph6p2eq158ey1cz"]) {
      const colour = accentColorFor(id);
      expect(colour).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("spreads different identifiers across the palette", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 14; i += 1) {
      seen.add(accentColorFor(`seed-${i}`));
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("falls back to position when the seed is empty", () => {
    expect(accentColorFor("", 2)).toBe(accentColorFor("", 2));
  });
});

describe("isWarmAccent", () => {
  it("flags emerald as warm", () => {
    expect(isWarmAccent("#10B981")).toBe(true);
  });

  it("treats cool accents as not warm", () => {
    expect(isWarmAccent("#06B6D4")).toBe(false);
  });
});

describe("formatQuantity", () => {
  it("formats tonnes as compact 't'", () => {
    expect(formatQuantity("34", "tonnes")).toBe("34 t");
  });

  it("formats plural variants and t abbreviation", () => {
    expect(formatQuantity("34", "ton")).toBe("34 t");
    expect(formatQuantity("34", "tons")).toBe("34 t");
    expect(formatQuantity("34", "t")).toBe("34 t");
  });

  it("formats kg", () => {
    expect(formatQuantity("1200", "kg")).toBe("1200 kg");
  });

  it("formats pallets", () => {
    expect(formatQuantity("8", "pallets")).toBe("8 plt");
  });

  it("falls back to the raw unit when unknown", () => {
    expect(formatQuantity("5", "loads")).toBe("5 loads");
  });

  it("returns null when quantity is missing", () => {
    expect(formatQuantity(undefined, "tonnes")).toBeNull();
    expect(formatQuantity("", "tonnes")).toBeNull();
  });

  it("returns null when quantityType is missing", () => {
    expect(formatQuantity("34", undefined)).toBeNull();
    expect(formatQuantity("34", "")).toBeNull();
  });
});

describe("planningLoadsCountLabel", () => {
  it("singular for one load", () => {
    expect(planningLoadsCountLabel(1)).toBe("1 Load");
  });

  it("plural for multiple loads", () => {
    expect(planningLoadsCountLabel(4)).toBe("4 Loads");
    expect(planningLoadsCountLabel(0)).toBe("0 Loads");
  });
});

describe("addLoadsButtonLabel", () => {
  it("singular form for one load", () => {
    expect(addLoadsButtonLabel(1)).toBe("Add 1 Load");
  });

  it("plural form for several loads", () => {
    expect(addLoadsButtonLabel(4)).toBe("Add 4 Loads");
    expect(addLoadsButtonLabel(12)).toBe("Add 12 Loads");
  });
});

describe("formatBoardDateLabel", () => {
  it("formats YYYY-MM-DD with zero-padded day", () => {
    expect(formatBoardDateLabel("2026-09-09")).toBe("09 Sep 2026");
  });

  it("does not zero-pad a two-digit day", () => {
    expect(formatBoardDateLabel("2026-09-24")).toBe("24 Sep 2026");
  });

  it("maps all months", () => {
    expect(formatBoardDateLabel("2026-01-03")).toBe("03 Jan 2026");
    expect(formatBoardDateLabel("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns the input unchanged when unparseable", () => {
    expect(formatBoardDateLabel("not-a-date")).toBe("not-a-date");
    expect(formatBoardDateLabel("2026-13-01")).toBe("2026-13-01");
  });
});