import type { Doc } from "@/convex/_generated/dataModel";
import type { CeramicShipment } from "./parser";

export type CeramicDispatchShipment = Pick<Doc<"ceramicShipments">, "_id" | "region" | "shipmentNumber" | "version" | "snapshot" | "driverId" | "truckId" | "driverInstructions" | "updatedAt" | "routeDate" | "plannerVersion" | "assignedAt">;

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

/** Use the saved assignment instant in South African time, independent of phone timezone. */
export function assignedCeramicDays<T extends { assignedAt?: number }>(rows: T[]): { day: string; label: string; shipments: T[] }[] {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" });
  const days = new Map<string, T[]>();
  for (const row of rows) {
    const parts = row.assignedAt !== undefined && Number.isFinite(row.assignedAt) && !Number.isNaN(new Date(row.assignedAt).getTime())
      ? formatter.formatToParts(new Date(row.assignedAt)) : [];
    const part = (type: string) => parts.find(item => item.type === type)?.value;
    const day = parts.length ? `${part("year")}-${part("month")}-${part("day")}` : "";
    const group = days.get(day) ?? [];
    group.push(row); days.set(day, group);
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).map(([day, shipments]) => ({
    day, shipments,
    label: day ? new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "Assignment date not recorded",
  }));
}
