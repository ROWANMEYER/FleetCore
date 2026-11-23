"use client";

import { getUserRegionOptions } from "@/src/lib/regions";
import type { Region } from "@/src/lib/regions";
import Link from "next/link";
import { CeramicTemplateTable } from "@/src/components/ceramic-tiles/CeramicTemplateTable";
import { CeramicBillingEditor } from "@/src/components/ceramic-tiles/CeramicBillingEditor";
import { buildCeramicTemplateSheets } from "@/src/lib/ceramic-tiles/templateWorkbook";
import { useState } from "react";
import { useConvex, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { downloadCeramicReports, type CeramicReportRow } from "@/src/lib/ceramic-tiles/reportExport";

const field = "min-h-11 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm";

export default function CeramicReportsPage() {
  const { token, user } = useAuth();
  const convex = useConvex();
  const [month, setMonth] = useState(() => ceramicPlanningDate().slice(0, 7));
  const [regionChoice, setRegionChoice] = useState<Region>("transvaal");
  const [tab, setTab] = useState<"monthly" | "local">("monthly");
  const [editing, setEditing] = useState<{ row: CeramicReportRow; mode: "main" | "local" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const regionOptions = getUserRegionOptions(user);
  const region = regionOptions.find(option => option.value === regionChoice)?.value ?? regionOptions[0]?.value ?? "garden_route";
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const { results, status, loadMore } = usePaginatedQuery(api.ceramicTiles.report,
    token && validMonth ? { token, region, month } : "skip", { initialNumItems: 50 });
  const sheets = validMonth ? buildCeramicTemplateSheets(results, month) : [];
  const exportReports = async () => {
    if (!token || exporting || !validMonth) return;
    setExporting(true); setError("");
    try {
      const rows: CeramicReportRow[] = [];
      let cursor: string | null = null;
      // Read every page, rather than silently exporting just the visible rows.
      for (let count = 0; count < 100; count++) {
        const page: { page: CeramicReportRow[]; isDone: boolean; continueCursor: string } = await convex.query(api.ceramicTiles.report, { token, region, month, paginationOpts: { numItems: 100, cursor } });
        rows.push(...page.page);
        if (page.isDone) { await downloadCeramicReports(rows, month, region); return; }
        cursor = page.continueCursor;
      }
      throw new Error("This month exceeds the 10,000-shipment export limit. No incomplete file was downloaded.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export the reports."); }
    finally { setExporting(false); }
  };
  if (!token || !user) return <main className="p-6">Sign in to view Ceramic reports.</main>;
  return <main className="h-full overflow-y-auto p-4 text-[var(--foreground)] lg:p-6"><div className="mx-auto max-w-[1500px] space-y-4">
    <header className="flex flex-wrap justify-between gap-3"><div><Link href="/operations/ceramic-tiles" className="text-sm font-semibold text-[#0891B2]">← Ceramic shipments</Link><h1 className="mt-2 text-2xl font-semibold">Ceramic spreadsheets</h1><p className="mt-1 text-sm text-[var(--nav-text-color)]">Main loads are recorded under TRANSVAAL. Local trips are GEORGE → GEORGE, use the main driver and stay out of Daily Planner.</p></div>
      <button type="button" style={{ backgroundColor: "#0891B2" }} className={`${field} font-semibold text-white disabled:opacity-50`} disabled={exporting || !validMonth || status === "LoadingFirstPage"} onClick={() => void exportReports()}>{exporting ? "Exporting…" : "Export both spreadsheets"}</button></header>
    <div className="flex flex-wrap items-end gap-4"><label className="grid gap-1 text-sm">Report month<input type="month" className={field} value={month} disabled={exporting || !!editing} onChange={event => setMonth(event.target.value)} /></label>{regionOptions.length > 1 && <label className="grid gap-1 text-sm">Region<select className={field} value={region} disabled={exporting || !!editing} onChange={event => setRegionChoice(event.target.value as Region)}>{regionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}</div>
    {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}
    <nav aria-label="Ceramic report" className="flex gap-2">{([['monthly', 'Monthly Ceramic'], ['local', 'Local loads']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)} style={{ backgroundColor: tab === value ? "#0891B2" : "var(--card-bg)" }} className={`${field} font-semibold ${tab === value ? "text-white" : ""}`}>{label}</button>)}</nav>
    <p className="text-xs text-[var(--nav-text-color)]">The supplied template&apos;s headings, layout and formulas are retained. Click a shipment or amount to edit. The final counts retain the external January workbook link and show #REF! while that workbook is unavailable.</p>
    {results.some(row=>row.needsReview || !!row.unmappedWarehouses?.length) && <div role="alert" className="space-y-1 text-sm text-[var(--warning-text)]">{results.filter(row=>row.needsReview || !!row.unmappedWarehouses?.length).map(row=><p key={row.shipmentId}>{row.shipmentNumber}: {row.needsReview?'review the latest shipment/Planner changes. ':''}{row.unmappedWarehouses?.map(w=>`${w.name || 'Missing warehouse code'} (${w.weightKg} kg)`).join('; ')}</p>)}</div>}
    {results.some(row=>!row.billing || row.billingSourceVersion!==row.version || [row.billing.ratePerTon,row.billing.stops,row.billing.drops].some(n=>n===null)) && <p role="status" className="text-sm text-[var(--warning-text)]">Some amounts are missing or need review. Totals are incomplete until every shipment&apos;s amounts are saved.</p>}
    <div className="flex flex-wrap gap-2">{results.filter(row=>tab === "monthly" || row.locals.length > 0).map(row=><button type="button" key={row.shipmentId} className={`${field} text-xs font-semibold`} onClick={()=>setEditing({ row, mode: tab === "monthly" ? "main" : "local" })}>{row.shipmentNumber}: {tab === "local" ? "Edit local amounts" : row.billing && row.billingSourceVersion===row.version?'Edit amounts':'Enter / review amounts'}</button>)}</div>
    {!validMonth ? <p>Choose a valid report month.</p> : status === "LoadingFirstPage" ? <p role="status">Loading report…</p> : <>
      <CeramicTemplateTable sheet={sheets[tab === "monthly" ? 0 : 1]} onEdit={shipmentId=>{const row=results.find(row=>row.shipmentId===shipmentId);if(row)setEditing({row,mode:tab === "monthly" ? "main" : "local"});}}/>
      {results.length===0 && <p className="text-sm text-[var(--nav-text-color)]">No assigned shipments for this month.</p>}
      {status === "CanLoadMore" || status === "LoadingMore" ? <button type="button" className={field} disabled={status === "LoadingMore"} onClick={() => loadMore(50)}>{status === "LoadingMore" ? "Loading…" : "Load more shipments"}</button> : null}
    </>}
    {editing && <CeramicBillingEditor key={`${editing.row.shipmentId}:${editing.mode}`} row={editing.row} mode={editing.mode} token={token} onClose={()=>setEditing(null)}/>}
  </div></main>;
}
