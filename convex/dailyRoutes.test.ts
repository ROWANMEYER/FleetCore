import { describe, expect, it } from "vitest";
import {
  buildAssignmentPatch,
  generateSubNotes,
  normalizeAssignmentField,
} from "./dailyRoutes";

describe("normalizeAssignmentField", () => {
  it("returns the trimmed string for a set value", () => {
    expect(normalizeAssignmentField("  Peter  ")).toBe("Peter");
  });

  it("collapses null to undefined (clear)", () => {
    expect(normalizeAssignmentField(null)).toBeUndefined();
  });

  it("collapses undefined to undefined (leave unchanged)", () => {
    expect(normalizeAssignmentField(undefined)).toBeUndefined();
  });

  it("collapses empty string to undefined (clear)", () => {
    expect(normalizeAssignmentField("")).toBeUndefined();
  });

  it("collapses whitespace-only string to undefined (clear)", () => {
    expect(normalizeAssignmentField("   ")).toBeUndefined();
  });
});

describe("buildAssignmentPatch", () => {
  describe("driver clearing/setting", () => {
    it("A: existing driver John, set Peter => patch sets Peter", () => {
      const patch = buildAssignmentPatch({ driverName: "Peter" });
      expect(patch.driverName).toBe("Peter");
      expect("trailerFleetNoStr" in patch).toBe(false);
    });

    it("B: existing driver John, clear driver => driverName removed", () => {
      const patch = buildAssignmentPatch({ driverName: null });
      expect(patch).toEqual({ driverName: undefined });
    });
  });

  describe("trailer clearing/setting", () => {
    it("C: existing trailer 108, set 56 => patch sets 56", () => {
      const patch = buildAssignmentPatch({ trailerFleetNoStr: "56" });
      expect(patch.trailerFleetNoStr).toBe("56");
      expect("driverName" in patch).toBe(false);
    });

    it("D: existing trailer 108, clear trailer => trailerFleetNoStr removed", () => {
      const patch = buildAssignmentPatch({ trailerFleetNoStr: null });
      expect(patch).toEqual({ trailerFleetNoStr: undefined });
    });
  });

  it("E: clear driver only => trailer untouched (no trailer key)", () => {
    const patch = buildAssignmentPatch({ driverName: null });
    expect(patch).toEqual({ driverName: undefined });
    expect("trailerFleetNoStr" in patch).toBe(false);
  });

  it("F: clear trailer only => driver untouched (no driver key)", () => {
    const patch = buildAssignmentPatch({ trailerFleetNoStr: null });
    expect(patch).toEqual({ trailerFleetNoStr: undefined });
    expect("driverName" in patch).toBe(false);
  });

  it("G: set both => both present", () => {
    const patch = buildAssignmentPatch({ driverName: "Peter", trailerFleetNoStr: "56" });
    expect(patch.driverName).toBe("Peter");
    expect(patch.trailerFleetNoStr).toBe("56");
  });

  it("H: clear both => both removed", () => {
    const patch = buildAssignmentPatch({ driverName: null, trailerFleetNoStr: null });
    expect(patch).toEqual({ driverName: undefined, trailerFleetNoStr: undefined });
  });

  it("omits untouched fields when args are undefined (leave unchanged)", () => {
    expect(buildAssignmentPatch({})).toEqual({});
  });

  it("I/J: patch only ever touches driverName/trailerFleetNoStr (loads, loadId, order safe)", () => {
    for (const patch of [
      buildAssignmentPatch({ driverName: "Peter" }),
      buildAssignmentPatch({ trailerFleetNoStr: null }),
      buildAssignmentPatch({ driverName: null, trailerFleetNoStr: "56" }),
    ]) {
      expect(Object.keys(patch).sort()).toEqual(
        Array.from(new Set(Object.keys(patch))).sort()
      );
      for (const key of Object.keys(patch)) {
        expect(["driverName", "trailerFleetNoStr"]).toContain(key);
      }
    }
  });

  it("K: trucks.currentTrailerId can never be produced by this patch builder", () => {
    for (const patch of [
      buildAssignmentPatch({ driverName: null }),
      buildAssignmentPatch({ trailerFleetNoStr: "56" }),
      buildAssignmentPatch({ driverName: "Peter", trailerFleetNoStr: null }),
    ]) {
      expect(Object.keys(patch)).not.toContain("currentTrailerId");
    }
  });

  it("trims whitespace on set values", () => {
    const patch = buildAssignmentPatch({
      driverName: "  A.GQOMFA  ",
      trailerFleetNoStr: " 108 ",
    });
    expect(patch.driverName).toBe("A.GQOMFA");
    expect(patch.trailerFleetNoStr).toBe("108");
  });
});

describe("subcontractor trip notes", () => {
  it("uses trip registration and driver without querying owned fleet tables", async () => {
    const ctx = {
      db: {
        get: async () => ({ companyName: "External Transport" }),
        query: () => { throw new Error("Owned fleet must not be queried"); },
      },
    };
    const notes = await generateSubNotes(ctx, "sub123", "CA 123-456", "External Driver", [
      { quantity: "2", subcontractorRate: "100", subcontractorRateType: "per_unit" },
    ]);
    expect(notes).toBe("EXTERNAL TRANSPORT / CA 123-456 / EXTERNAL DRIVER / SUB COST: R 200.00");
    expect(await generateSubNotes(ctx, "sub123", "EC 987-654", "Another Driver"))
      .toBe("EXTERNAL TRANSPORT / EC 987-654 / ANOTHER DRIVER");
  });
});
