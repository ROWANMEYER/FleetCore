"use client";
import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_FUEL_COMPOSITION } from "@/convex/rateSheetFields";
import { formatCurrency } from "@/src/pdf/formatters";

/** Read-only snapshots, paged by customer, including prior deleted cards. */
export function TariffHistory({ token, customerId }: { token: string; customerId: Id<"customers"> }) {
  const [open, setOpen] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(api.rateSheets.history, open ? { token, customerId } : "skip", { initialNumItems: 5 });
  return <section className="glass-card rounded-xl p-5 space-y-3">
    <button className="font-semibold text-left" aria-expanded={open} onClick={() => setOpen(!open)}>Historical tariff records {open ? "−" : "+"}</button>
    {open && <>
      <p className="text-sm text-[var(--nav-text-color)]">Saved starting tariffs and agreements are kept as recorded. These records do not recalculate when fuel prices change. Dates without a lane override use the customer effective date.</p>
      {status === "LoadingFirstPage" && <p>Loading tariff history…</p>}
      {status !== "LoadingFirstPage" && results.length === 0 && <p>No historical records yet. The first change preserves the existing card and the new tariff.</p>}
      {results.map(record => <details key={record._id} className="border border-[var(--card-border)] rounded-lg p-3">
        <summary className="cursor-pointer">Revision {record.revision} · {record.action} · {new Date(record.recordedAt).toLocaleString("en-ZA")} · {record.snapshot.effectiveDate ?? "Date not set"}</summary>
        <p className="text-sm mt-2">{record.recordedByEmail} · {record.snapshot.agreementType === "fixed" ? "Fixed-rate agreement" : record.snapshot.agreementType === "fuel_linked" ? `Fuel-linked: ${record.snapshot.fuelCompositionPercent ?? DEFAULT_FUEL_COMPOSITION}%` : "Original recorded fuel composition"}</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm mt-2"><thead><tr><th className="p-2">Loading point</th><th className="p-2">Destination</th><th className="p-2">Unit</th><th className="p-2">Effective date</th><th className="p-2">Starting tariff</th></tr></thead>
          <tbody>{record.snapshot.lanes.map(lane => <tr key={lane.id}><td className="p-2">{lane.loadingPoint}</td><td className="p-2">{lane.destination}</td><td className="p-2">{lane.pricingUnit || record.snapshot.defaultPricingUnit}</td><td className="p-2">{(record.snapshot.agreementType ? lane.date : undefined) || record.snapshot.effectiveDate || "Not set"}</td><td className="p-2 whitespace-nowrap">{formatCurrency(lane.rate)}</td></tr>)}</tbody>
        </table></div>
        {record.snapshot.notes && <p className="text-sm whitespace-pre-wrap mt-2">{record.snapshot.notes}</p>}
      </details>)}
      {status === "CanLoadMore" && <button className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm" onClick={() => loadMore(5)}>Older records</button>}
      {status === "LoadingMore" && <p>Loading older records…</p>}
    </>}
  </section>;
}
