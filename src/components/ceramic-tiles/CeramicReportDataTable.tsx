"use client";
import { Fragment, useState, type ReactNode } from "react";
import { formatCurrency } from "@/src/pdf/formatters";
import { CERAMIC_WAREHOUSES, ceramicMonthlyAmounts, ceramicStopsCharge } from "@/src/lib/ceramic-tiles/monthlyReport";
import { ceramicReportLocalPrice, ceramicReportStatus, type CeramicReportItem, type CeramicReportKind, type CeramicReportSort } from "@/src/lib/ceramic-tiles/reportView";
import styles from "./CeramicReports.module.css";
const money = (value: number | null | undefined) => value == null ? "—" : formatCurrency(value);
export function CeramicReportDataTable({ items, kind, editingKey, editor, onEdit, onSort, sort, descending }: {
  items: CeramicReportItem[]; kind: CeramicReportKind; editingKey: string | null; editor: ReactNode;
  onEdit: (item: CeramicReportItem, legacy?: boolean) => void; onSort: (key: CeramicReportSort) => void; sort: CeramicReportSort; descending: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState<Set<string>>(() => new Set());
  const toggleDetails = (key: string) => setDetailsOpen(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const sorted = (key: CeramicReportSort, label: string) => <button type="button" className={styles.link} onClick={() => onSort(key)} disabled={!!editingKey}>{label}{sort === key ? descending ? " ↓" : " ↑" : ""}</button>;
  const order = (key: CeramicReportSort) => sort === key ? descending ? "descending" as const : "ascending" as const : undefined;
  return <table className={styles.table} aria-label={kind === "monthly" ? "Monthly Ceramic data table" : "Local loads data table"}>
    <thead><tr><th className={styles.date} aria-sort={order("date")}>{sorted("date", "Date")}</th><th className={styles.shipment} aria-sort={order("shipment")}>{sorted("shipment", "Shipment")}</th><th className={styles.driver} aria-sort={order("driver")}>{sorted("driver", "Driver")}</th><th>Truck</th>
      {kind === "monthly" ? <><th>Chargeable tons</th><th>Rate / ton</th><th>Extra pickups / drops</th><th aria-sort={order("amount")}>{sorted("amount", "Main total")}</th><th>Local transport</th></> : <><th className={styles.destination}>Local delivery</th><th>Weight / pallets</th><th>Route</th><th aria-sort={order("amount")}>{sorted("amount", "Local price")}</th></>}
      <th className={styles.status}>Status</th><th className={styles.action}>Edit / review</th></tr></thead>
    <tbody>{items.map(item => {
      const { row, local } = item, status = ceramicReportStatus(row), amounts = ceramicMonthlyAmounts(row.warehouseWeights ?? [], row.billing);
      return <Fragment key={item.key}><tr>
        <td className={styles.date}>{row.routeDate}</td><td className={styles.shipment}><strong>{row.shipmentNumber}</strong><span className={styles.muted}>v{row.version} · <button type="button" className={styles.link} aria-expanded={detailsOpen.has(item.key)} onClick={() => toggleDetails(item.key)}>{detailsOpen.has(item.key) ? "Hide details" : "Details"}</button></span></td>
        <td className={styles.driver}>{row.driverName}</td><td>{row.truckRegistration || "—"}<span className={styles.muted}>Fleet {row.truckFleetNo}</span></td>
        {kind === "monthly" ? <><td className={styles.number}><button type="button" className={styles.link} aria-label={`Review chargeable tons for ${row.shipmentNumber}`} onClick={() => onEdit(item)}>{row.billing?.automation?.chargeableTons ?? 34}</button></td><td className={styles.number}><button type="button" className={styles.link} aria-label={`Review rate for ${row.shipmentNumber}`} onClick={() => onEdit(item, !!row.billing && !row.billing.automation)}>{money(row.billing?.ratePerTon)}</button><span className={styles.muted}>{row.billing?.automation?.variant === "sp" ? "SP" : row.billing?.automation ? "Standard" : "Manual"}</span></td><td className={styles.number}><button type="button" className={styles.link} aria-label={`Review stop charges for ${row.shipmentNumber}`} onClick={() => onEdit(item, !!row.billing && !row.billing.automation)}>{money(ceramicStopsCharge(row.billing))}</button></td><td className={styles.number}>{money(amounts.total)}</td><td className={styles.number}>{money(ceramicReportLocalPrice(item))}</td></> : <><td className={styles.destination}>{local?.name}<span className={styles.muted}>{local?.address}</span></td><td className={styles.number}>{local ? (local.weightKg / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 5 }) : "—"} t<span className={styles.muted}>{local?.pallets ?? "Unknown"} pallets</span></td><td>GEORGE → GEORGE</td><td className={styles.number}><button type="button" className={styles.link} aria-label={`Review local price for ${row.shipmentNumber}`} onClick={() => onEdit(item, !!row.billing && !row.billing.automation)}>{money(ceramicReportLocalPrice(item))}</button></td></>}
        <td className={styles.status}><span style={{ color: status === "Ready" ? "var(--success-text)" : "var(--warning-text)" }}>{status}</span></td>
        <td className={styles.action}><button type="button" className={styles.control} disabled={editingKey === item.key} onClick={() => onEdit(item)} aria-label={`Review billing for ${row.shipmentNumber}`}>Review billing</button>{row.billing && !row.billing.automation && <button type="button" className={`${styles.link} mt-2 block text-xs`} onClick={() => onEdit(item, true)}>Edit manual amounts</button>}</td>
      </tr>
      {editingKey === item.key && <tr><td colSpan={kind === "monthly" ? 11 : 10}>{editor}</td></tr>}
      {detailsOpen.has(item.key) && <tr><td colSpan={kind === "monthly" ? 11 : 10} className="!py-1"><section><p className="text-xs text-[var(--nav-text-color)]">{row.shipmentNumber}: shipment details and warehouse weights</p><div className="grid max-w-4xl gap-3 p-3 text-xs sm:grid-cols-2"><div><strong>Collection points</strong>{row.fromLocations.map((location,i) => <p key={i}>{location}</p>)}<strong className="mt-2 block">Deliveries</strong>{row.toLocations.map((location,i) => <p key={i}>{location}</p>)}</div><div><strong>Actual PDF totals</strong><p>{row.weightKg == null ? "Unknown" : (row.weightKg / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 5 })} t · {row.pallets ?? "Unknown"} pallets</p>{CERAMIC_WAREHOUSES.map(warehouse => <p key={warehouse.code}>{warehouse.label}: {(row.warehouseWeights?.find(weight => weight.code === warehouse.code)?.weightKg ?? 0).toLocaleString("en-ZA")} kg</p>)}</div></div></section></td></tr>}
      </Fragment>;
    })}</tbody>
  </table>;
}
