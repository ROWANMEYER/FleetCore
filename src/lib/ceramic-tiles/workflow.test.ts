import { describe, expect, it } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ceramicWorkflowLabel, ceramicWorkflowStage } from "./workflow";

type Row = Parameters<typeof ceramicWorkflowStage>[0];
const row: Row = { driverId: "driver" as Id<"drivers">, truckId: "truck" as Id<"trucks">, routeDate: "2026-11-22", version: 1, plannerVersion: 1, updatedAt: 100 };
const instructions: NonNullable<Doc<"ceramicShipments">["driverInstructions"]> = { reviewedVersion: 1, safetyNotes: "Confirmed", additionalNotes: "", updatedAt: 100, updatedBy: "test" };
describe("Saved Ceramic workflow stages", () => {
  it("requires both the assignment and a current Planner snapshot", () => {
    for (const change of [{ driverId: undefined }, { truckId: undefined }, { routeDate: undefined }, { plannerVersion: undefined }, { plannerVersion: 0 }]) {
      expect(ceramicWorkflowStage({ ...row, driverInstructions: instructions, ...change })).toBe("assignment");
    }
    expect(ceramicWorkflowLabel({ ...row, driverId: undefined })).toBe("Needs assignment");
    expect(ceramicWorkflowLabel({ ...row, plannerVersion: undefined })).toBe("Review assignment");
  });
  it("advances a saved assignment to instructions until the current PDF is reviewed", () => {
    expect(ceramicWorkflowStage(row)).toBe("instructions");
    expect(ceramicWorkflowLabel(row)).toBe("Instructions next");
    expect(ceramicWorkflowStage({ ...row, driverInstructions: { ...instructions, reviewedVersion: undefined } })).toBe("instructions");
  });
  it("derives Ready from saved current instructions so it survives refresh", () => {
    const saved = { ...row, driverInstructions: instructions };
    expect(ceramicWorkflowStage(saved)).toBe("ready");
    expect(ceramicWorkflowStage(JSON.parse(JSON.stringify(saved)) as Row)).toBe("ready");
    expect(ceramicWorkflowLabel(saved)).toBe("Ready to send");
  });
  it("requires another instruction review after a later assignment", () => {
    expect(ceramicWorkflowStage({ ...row, updatedAt: 101, driverInstructions: instructions })).toBe("instructions");
    expect(ceramicWorkflowStage({ ...row, updatedAt: 102, driverInstructions: { ...instructions, updatedAt: 102 } })).toBe("ready");
  });
  it("sends revised PDFs through assignment and instruction review without changing records", () => {
    const revised = { ...row, version: 2, driverInstructions: instructions };
    expect(ceramicWorkflowStage(revised)).toBe("assignment");
    expect(ceramicWorkflowStage({ ...revised, plannerVersion: 2 })).toBe("instructions");
    expect(revised).toEqual({ ...row, version: 2, driverInstructions: instructions });
  });
});
