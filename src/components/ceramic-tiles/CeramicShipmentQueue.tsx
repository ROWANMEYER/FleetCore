"use client";

import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, Package, Search, Table2, Trash2, Truck, UserRound } from "lucide-react";
import { assignedCeramicDays, ceramicAssignmentComplete, ceramicPalletLabel, ceramicVersionNeedsReview, mobileCeramicShipments, type CeramicDispatchShipment, type MobileShipmentFilter } from "@/src/lib/ceramic-tiles/mobileDispatch";
import type { CeramicFleet } from "./useCeramicInstructions";
import styles from "./CeramicMobile.module.css";

/** Both surfaces use assignment status, not instruction readiness, for these tabs. */
export function CeramicShipmentQueue<T extends CeramicDispatchShipment>({ rows, fleet, filter, search, onFilterChange, onSearchChange, onSelect, selectedId, canViewReports, onDelete, disabled = false }: {
  rows: T[] | undefined; fleet: CeramicFleet | undefined;
  filter: MobileShipmentFilter; search: string;
  onFilterChange: (filter: MobileShipmentFilter) => void; onSearchChange: (search: string) => void;
  onSelect: (shipment: T) => void; selectedId?: string;
  canViewReports: boolean; onDelete?: (shipment: T) => void; disabled?: boolean;
}) {
  const visible = mobileCeramicShipments(rows ?? [], filter, search);
  const drivers = new Map((fleet?.drivers ?? []).map(driver => [driver.id as string, driver.name]));
  const trucks = new Map((fleet?.trucks ?? []).map(truck => [truck.id as string, [truck.fleetNumber, truck.registration].filter(Boolean).join(" · ")]));
  const card = (row: T) => <article key={row._id} className={styles.shipmentCard} data-selected={row._id === selectedId || undefined}>
    <button type="button" disabled={disabled} aria-label={`Open shipment ${row.shipmentNumber}`} aria-pressed={row._id === selectedId} onClick={() => onSelect(row)} className={styles.openShipment}>
      <div className={styles.cardHeading}><div className="min-w-0"><h2>{row.shipmentNumber}</h2><p className={styles.cardMeta}>Version {row.version} · {ceramicPalletLabel(row.snapshot)}<br />{row.snapshot.destinations.length} delivery stops · TRANSVAAL</p></div><ChevronRight size={22} /></div>
      {ceramicVersionNeedsReview(row) && <p className={`${styles.notice} mt-3 mb-0`}>Shipment updated—review before sending</p>}
      <div className={styles.fleetSummary}><p><Truck size={16} /><span>{row.truckId ? trucks.get(row.truckId) ?? "Assigned truck unavailable" : "Truck not assigned"}</span></p><p><UserRound size={16} /><span>{row.driverId ? drivers.get(row.driverId) ?? "Assigned driver unavailable" : "Driver not assigned"}</span></p></div>
      <p className={styles.cardAction}>{ceramicAssignmentComplete(row) ? "Open dispatch instructions" : "Assign truck & driver"}<ChevronRight size={16} /></p>
    </button>
    {onDelete && <button type="button" disabled={disabled} className={styles.deleteShipment} aria-label={`Delete shipment ${row.shipmentNumber}`} onClick={() => onDelete(row)}><Trash2 size={16} />Delete shipment</button>}
  </article>;
  return <div className={styles.listStack}>
    {canViewReports && <Link href="/operations/ceramic-tiles/reports" className={styles.reportLink}><Table2 size={19} />Monthly &amp; local-load spreadsheets<ChevronRight size={18} /></Link>}
    <nav aria-label="Shipment assignment filter" className={styles.filters}>{([["unassigned", "Unassigned"], ["assigned", "Assigned"], ["all", "All"]] as const).map(([value, label]) => <button type="button" key={value} disabled={disabled} aria-pressed={filter === value} onClick={() => onFilterChange(value)}>{label}</button>)}</nav>
    <label className={styles.search}><Search size={19} className="shrink-0" /><input type="search" disabled={disabled} aria-label="Search shipment number" placeholder="Search shipment number" value={search} onChange={event => onSearchChange(event.target.value)} /></label>
    {!rows || !fleet ? <p role="status" className={styles.loading}>Loading shipments…</p> : !visible.length ? <div className={styles.empty}><Package size={27} /><h2>{search ? "No matching shipments" : filter === "unassigned" ? "No unassigned shipments" : filter === "assigned" ? "No assigned shipments" : "No imported shipments"}</h2><p>{search ? "Try another shipment number or assignment filter." : filter === "unassigned" && rows.length ? "Choose Assigned or All to view existing assignments." : "Import shipment PDFs on the web app to see them here."}</p></div> : <section aria-label="Imported shipment cards" className={styles.cards}>
      {filter === "assigned" ? <><p className={styles.groupHint}>Grouped by the day the assignment was saved. Expand a day to view its shipments.</p>{assignedCeramicDays(visible).map(group => <details key={group.day || "undated"} className={styles.dayGroup}>
        <summary><CalendarDays size={20} /><span>{group.label}<small>{group.shipments.length} {group.shipments.length === 1 ? "shipment" : "shipments"}</small></span><ChevronDown size={20} className={styles.dayChevron} /></summary>
        <div className={styles.dayShipments}>{group.shipments.map(card)}</div>
      </details>)}</> : visible.map(card)}
    </section>}
  </div>;
}
