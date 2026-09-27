import { describe, it, expect } from "vitest";
import {
  ALREADY_CANCELLED_MESSAGE,
  DEALLOCATE_FIRST_MESSAGE,
  buildCancelTargetMessage,
  canCancelPlanningLoad,
  describeCancelTarget,
  isVisibleInUnallocatedList,
  selectCancellableUnallocatedIds,
  type CancellablePlanningLoad,
} from "./planningLoadCancellation";

function load(over: Partial<CancellablePlanningLoad> = {}): CancellablePlanningLoad {
  return {
    _id: "pl_1",
    loadDate: "2026-09-23",
    region: "garden_route",
    status: "unallocated",
    client: "SHAVECO",
    fromLocations: ["George"],
    toLocations: ["Cape Town"],
    ...over,
  };
}

describe("G — an unallocated load can be cancelled", () => {
  it("allows an unallocated load", () => {
    expect(canCancelPlanningLoad("unallocated")).toEqual({ allowed: true });
  });

  it("produces the confirmation copy the dispatcher is shown", () => {
    expect(buildCancelTargetMessage(load())).toBe(
      "SHAVECO\nGeorge → Cape Town\n2026-09-23\n\nIt will be removed from the active planning board."
    );
  });

  it("names every leg of a multi-stop route", () => {
    const message = buildCancelTargetMessage(
      load({ fromLocations: ["George", "Mossel Bay"], toLocations: ["Cape Town"] })
    );
    expect(message).toContain("George + Mossel Bay → Cape Town");
  });

  it("handles missing locations without rendering undefined", () => {
    expect(describeCancelTarget(load({ fromLocations: [], toLocations: [] }))).toEqual({
      client: "SHAVECO",
      route: "— → —",
      date: "2026-09-23",
    });
  });

  it("falls back for a blank client token", () => {
    expect(describeCancelTarget(load({ client: "   " })).client).toBe("—");
  });
});

describe("H — a cancelled load leaves the normal Unallocated list", () => {
  it("shows an unallocated load and hides a cancelled one", () => {
    expect(isVisibleInUnallocatedList({ status: "unallocated" })).toBe(true);
    expect(isVisibleInUnallocatedList({ status: "cancelled" })).toBe(false);
  });

  it("hides an allocated load too — it is not in the unallocated list", () => {
    expect(isVisibleInUnallocatedList({ status: "allocated" })).toBe(false);
  });

  it("keeps a cancelled load out of every bulk selection", () => {
    const rows = [load({ _id: "a" }), load({ _id: "b", status: "cancelled" })];
    expect(
      selectCancellableUnallocatedIds(rows, "2026-09-23", "garden_route")
    ).toEqual(["a"]);
  });
});

describe("I — an allocated load cannot bypass the deallocation rule", () => {
  it("refuses an allocated load and names the required step", () => {
    const result = canCancelPlanningLoad("allocated");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe(DEALLOCATE_FIRST_MESSAGE);
  });

  it("refuses a load that is already cancelled", () => {
    const result = canCancelPlanningLoad("cancelled");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toBe(ALREADY_CANCELLED_MESSAGE);
  });

  it("never selects an allocated load for a bulk cancel, even for its own date", () => {
    const rows = [
      load({ _id: "unalloc" }),
      load({ _id: "alloc", status: "allocated" }),
    ];
    expect(selectCancellableUnallocatedIds(rows, "2026-09-23", "garden_route")).toEqual([
      "unalloc",
    ]);
  });

  it("becomes cancellable once it is returned to Unallocated", () => {
    const returned = load({ status: "unallocated" });
    expect(canCancelPlanningLoad(returned.status).allowed).toBe(true);
  });
});

describe("J — cancelling 23 Sep never touches equivalent 24 Sep loads", () => {
  const sameRoute = {
    client: "SHAVECO",
    fromLocations: ["George"],
    toLocations: ["Cape Town"],
  };

  it("selects only the 23 Sep documents when 23 Sep is cancelled", () => {
    const rows = [
      load({ _id: "d23a", loadDate: "2026-09-23", ...sameRoute }),
      load({ _id: "d23b", loadDate: "2026-09-23", ...sameRoute }),
      load({ _id: "d24a", loadDate: "2026-09-24", ...sameRoute }),
      load({ _id: "d25a", loadDate: "2026-09-25", ...sameRoute }),
    ];
    expect(selectCancellableUnallocatedIds(rows, "2026-09-23", "garden_route")).toEqual([
      "d23a",
      "d23b",
    ]);
  });

  it("leaves the 24 Sep rows in the list afterwards", () => {
    const rows = [
      load({ _id: "d23a", loadDate: "2026-09-23", ...sameRoute }),
      load({ _id: "d24a", loadDate: "2026-09-24", ...sameRoute }),
    ];
    const cancelled = new Set(
      selectCancellableUnallocatedIds(rows, "2026-09-23", "garden_route")
    );
    expect([...cancelled]).toEqual(["d23a"]);
    const remaining = rows.filter((r) => !cancelled.has(r._id));
    expect(remaining.map((r) => r._id)).toEqual(["d24a"]);
    expect(isVisibleInUnallocatedList(remaining[0])).toBe(true);
  });

  it("never matches on route content — only on date, region and document id", () => {
    const rows = [load({ _id: "d24a", loadDate: "2026-09-24", ...sameRoute })];
    // Identical client and route, different planning date: not selected.
    expect(selectCancellableUnallocatedIds(rows, "2026-09-23", "garden_route")).toEqual([]);
  });

  it("narrows by effective region, so the other region's loads are untouched", () => {
    const rows = [
      load({ _id: "gr", region: "garden_route" }),
      load({ _id: "ec", region: "eastern_cape" }),
    ];
    expect(selectCancellableUnallocatedIds(rows, "2026-09-23", "garden_route")).toEqual(["gr"]);
    expect(selectCancellableUnallocatedIds(rows, "2026-09-23", "eastern_cape")).toEqual(["ec"]);
  });

  it("covers every region only when there is no effective region", () => {
    const rows = [
      load({ _id: "gr", region: "garden_route" }),
      load({ _id: "ec", region: "eastern_cape" }),
    ];
    expect(selectCancellableUnallocatedIds(rows, "2026-09-23", null)).toEqual(["gr", "ec"]);
  });

  it("returns an empty selection for a date with nothing on it", () => {
    expect(selectCancellableUnallocatedIds([load()], "2026-09-30", "garden_route")).toEqual([]);
  });
});
