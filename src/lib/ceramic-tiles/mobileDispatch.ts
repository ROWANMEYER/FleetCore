import type { Doc } from "@/convex/_generated/dataModel";
import type { CeramicShipment } from "./parser";

export type CeramicDispatchShipment = Pick<Doc<"ceramicShipments">, "_id" | "region" | "shipmentNumber" | "version" | "snapshot" | "driverId" | "truckId" | "driverInstructions" | "updatedAt">;

export type MobileShipmentFilter = "unassigned" | "assigned" | "all";
type DispatchRecord = { shipmentNumber: string; version: number; driverId?: string; truckId?: string; updatedAt: number; driverInstructions?: { reviewedVersion?: number } };
export function ceramicAssignmentComplete(row: Pick<DispatchRecord, "driverId" | "truckId">): boolean {
  return !!row.driverId && !!row.truckId;
}
export function ceramicVersionNeedsReview(row: Pick<DispatchRecord, "version" | "driverInstructions">): boolean {
  return row.version > 1 && row.driverInstructions?.reviewedVersion !== row.version;
}
export function mobileCeramicShipments<T extends DispatchRecord>(rows: T[], filter: MobileShipmentFilter, search = ""): T[] {
  const term = search.trim().toUpperCase();
  return rows.filter(row => (filter === "all" || ceramicAssignmentComplete(row) === (filter === "assigned")) && (!term || row.shipmentNumber.toUpperCase().includes(term)))
    .sort((a, b) => Number(ceramicAssignmentComplete(a)) - Number(ceramicAssignmentComplete(b)) || b.updatedAt - a.updatedAt || a.shipmentNumber.localeCompare(b.shipmentNumber));
}
export function ceramicPalletLabel(snapshot: Pick<CeramicShipment, "totalPallets">): string {
  return snapshot.totalPallets === null ? "Pallets not specified" : `${snapshot.totalPallets.toLocaleString("en-GB", { maximumFractionDigits: 3 })} pallets`;
}
