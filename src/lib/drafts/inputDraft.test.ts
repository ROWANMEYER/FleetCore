import { describe, it, expect } from "vitest";
import {
  describeStaleReferences,
  pruneStaleInputDraft,
  sanitizeInputDraft,
  type InputDraft,
  type InputDraftData,
} from "./inputDraft";

function makeData(overrides: Partial<InputDraftData> = {}): InputDraftData {
  return {
    date: "2026-09-09",
    truckFleetNo: "TRK-01",
    trailerFleetNo: "TRL-09",
    driverName: "Sipho",
    routeKilometers: "420",
    notes: "call on arrival",
    region: "garden_route",
    isFleetMode: true,
    selectedSubId: "",
    detailsCollapsed: false,
    loads: [],
    draftLoad: {
      clientName: "ACME",
      fromLocations: ["george"],
      toLocations: ["kaap"],
      quantity: "30",
      quantityType: "tons",
      rate: "1500",
      rateType: "per_unit",
      subcontractorRate: "",
      subcontractorRateType: "per_unit",
    },
    ...overrides,
  };
}

function makeDraft(overrides: Partial<InputDraftData> = {}, step = 2): InputDraft {
  return { step, data: makeData(overrides) };
}

const AVAILABLE = {
  truckFleetNos: ["TRK-01", "TRK-02"],
  trailerFleetNos: ["TRL-09"],
  driverNames: ["Sipho", "Nadia"],
  subcontractorIds: ["sub123"],
};

describe("sanitizeInputDraft", () => {
  it("accepts a well-formed draft", () => {
    const draft = sanitizeInputDraft(makeDraft());
    expect(draft?.data.truckFleetNo).toBe("TRK-01");
    expect(draft?.data.loads).toEqual([]);
    expect(draft?.step).toBe(2);
  });

  it("rejects payloads that are not draft objects", () => {
    expect(sanitizeInputDraft(null)).toBeNull();
    expect(sanitizeInputDraft("nope")).toBeNull();
    expect(sanitizeInputDraft([1, 2])).toBeNull();
    expect(sanitizeInputDraft({ step: 2 })).toBeNull();
    expect(sanitizeInputDraft({ step: 2, data: "nope" })).toBeNull();
  });

  it("coerces wrongly typed fields instead of throwing", () => {
    const draft = sanitizeInputDraft({
      step: "not a number",
      data: {
        date: 123,
        truckFleetNo: null,
        isFleetMode: "yes",
        detailsCollapsed: 1,
        loads: "not an array",
        draftLoad: { rateType: "weird", fromLocations: "george" },
      },
    });
    expect(draft).not.toBeNull();
    expect(draft?.step).toBe(0);
    expect(draft?.data.date).toBe("");
    expect(draft?.data.truckFleetNo).toBe("");
    expect(draft?.data.isFleetMode).toBe(true);
    expect(draft?.data.detailsCollapsed).toBe(false);
    expect(draft?.data.loads).toEqual([]);
    expect(draft?.data.draftLoad.rateType).toBe("per_unit");
    expect(draft?.data.draftLoad.fromLocations).toEqual([""]);
  });

  it("clamps the wizard step into range", () => {
    expect(sanitizeInputDraft({ step: -4, data: {} })?.step).toBe(0);
    expect(sanitizeInputDraft({ step: 99, data: {} })?.step).toBe(6);
    expect(sanitizeInputDraft({ step: 3.7, data: {} })?.step).toBe(3);
  });

  it("drops malformed load entries but keeps the valid ones", () => {
    const draft = sanitizeInputDraft({
      step: 1,
      data: {
        loads: [
          { id: "l1", clientName: "ACME", rateType: "flat", sequence: 1 },
          null,
          "garbage",
          { clientName: "MTO", rateType: "flat", sequence: 2 },
        ],
      },
    });
    expect(draft?.data.loads).toHaveLength(2);
    expect(draft?.data.loads[0].id).toBe("l1");
    expect(draft?.data.loads[1].id).toBe("restored-3");
    expect(draft?.data.loads[1].sequence).toBe(2);
  });
});

describe("pruneStaleInputDraft", () => {
  it("keeps a fully valid draft untouched", () => {
    const draft = makeDraft();
    const result = pruneStaleInputDraft(draft, AVAILABLE);
    expect(result.staleRefs).toEqual([]);
    expect(result.draft).toEqual(draft);
  });

  it("clears a truck that no longer exists and flags it", () => {
    const result = pruneStaleInputDraft(
      makeDraft({ truckFleetNo: "TRK-99" }),
      AVAILABLE
    );
    expect(result.draft.data.truckFleetNo).toBe("");
    expect(result.staleRefs).toEqual([
      { field: "truckFleetNo", label: "Truck", value: "TRK-99" },
    ]);
  });

  it("clears a deleted trailer, driver and subcontractor together", () => {
    const result = pruneStaleInputDraft(
      makeDraft({
        trailerFleetNo: "TRL-77",
        driverName: "Removed Driver",
        selectedSubId: "sub999",
        isFleetMode: false,
      }),
      AVAILABLE
    );
    expect(result.draft.data.trailerFleetNo).toBe("");
    expect(result.draft.data.driverName).toBe("");
    expect(result.draft.data.selectedSubId).toBe("");
    expect(result.draft.data.isFleetMode).toBe(true);
    expect(result.staleRefs.map((ref) => ref.field)).toEqual([
      "trailerFleetNo",
      "driverName",
      "selectedSubId",
    ]);
  });

  it("matches case and whitespace insensitively", () => {
    const result = pruneStaleInputDraft(
      makeDraft({ truckFleetNo: "  trk-01 ", driverName: "sipho" }),
      AVAILABLE
    );
    expect(result.staleRefs).toEqual([]);
  });

  it("never treats an empty field as stale", () => {
    const result = pruneStaleInputDraft(
      makeDraft({ truckFleetNo: "", trailerFleetNo: "", driverName: "", selectedSubId: "" }),
      AVAILABLE
    );
    expect(result.staleRefs).toEqual([]);
  });

  it("preserves the typed load text and notes", () => {
    const result = pruneStaleInputDraft(
      makeDraft({ truckFleetNo: "TRK-99", notes: "keep my notes" }),
      AVAILABLE
    );
    expect(result.draft.data.notes).toBe("keep my notes");
    expect(result.draft.data.draftLoad.clientName).toBe("ACME");
    expect(result.draft.step).toBe(2);
  });

  it("describes the stale references for the warning banner", () => {
    const result = pruneStaleInputDraft(
      makeDraft({ truckFleetNo: "TRK-99", driverName: "Gone" }),
      AVAILABLE
    );
    expect(describeStaleReferences(result.staleRefs)).toBe('Truck "TRK-99", Driver "Gone"');
    expect(describeStaleReferences([])).toBe("");
  });

  it("skips a check whose availability list has not loaded yet", () => {
    const result = pruneStaleInputDraft(makeDraft({ truckFleetNo: "TRK-99" }), {
      truckFleetNos: undefined,
      trailerFleetNos: undefined,
      driverNames: undefined,
      subcontractorIds: undefined,
    });
    expect(result.staleRefs).toEqual([]);
    expect(result.draft.data.truckFleetNo).toBe("TRK-99");
  });

  it("still checks the subcontractor when fleet lists are unavailable", () => {
    const result = pruneStaleInputDraft(makeDraft({ selectedSubId: "sub999" }), {
      subcontractorIds: ["sub123"],
    });
    expect(result.staleRefs).toEqual([
      { field: "selectedSubId", label: "Subcontractor", value: "sub999" },
    ]);
  });

  it("does not mutate the draft it was given", () => {
    const draft = makeDraft({ truckFleetNo: "TRK-99" });
    pruneStaleInputDraft(draft, AVAILABLE);
    expect(draft.data.truckFleetNo).toBe("TRK-99");
  });
});
