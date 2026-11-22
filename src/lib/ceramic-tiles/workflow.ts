import type { Doc } from "@/convex/_generated/dataModel";

export type CeramicWorkflowStage = "assignment" | "instructions" | "ready";
type WorkflowRecord = Pick<Doc<"ceramicShipments">, "driverId" | "truckId" | "routeDate" | "plannerVersion" | "version" | "driverInstructions" | "updatedAt">;

/** A saved instruction review must include the current PDF and latest assignment. */
export function ceramicWorkflowStage(row: WorkflowRecord): CeramicWorkflowStage {
  if (!row.driverId || !row.truckId || !row.routeDate || row.plannerVersion !== row.version) return "assignment";
  if (row.driverInstructions?.reviewedVersion !== row.version || row.driverInstructions.updatedAt < row.updatedAt) return "instructions";
  return "ready";
}
export function ceramicWorkflowLabel(row: WorkflowRecord): string {
  const stage = ceramicWorkflowStage(row);
  return stage === "assignment" ? row.driverId && row.truckId ? "Review assignment" : "Needs assignment"
    : stage === "instructions" ? "Instructions next" : "Ready to send";
}
