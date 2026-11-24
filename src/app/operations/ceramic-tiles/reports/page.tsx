"use client";

import { getUserRegionOptions } from "@/src/lib/regions";
import type { Region } from "@/src/lib/regions";
import Link from "next/link";
import { CeramicBillingSettings } from "@/src/components/ceramic-tiles/CeramicBillingSettings";
import { ceramicBillingPeriod, ceramicReportMonth } from "@/src/lib/ceramic-tiles/billingPeriod";
import { ceramicReportLocalPrice } from "@/src/lib/ceramic-tiles/reportView";
import { ceramicMonthlyAmounts } from "@/src/lib/ceramic-tiles/monthlyReport";
import { formatCurrency } from "@/src/pdf/formatters";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { CeramicReportWorkspace } from "@/src/components/ceramic-tiles/CeramicReportWorkspace";
import { useConvex, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { downloadCeramicReports, type CeramicReportRow } from "@/src/lib/ceramic-tiles/reportExport";

const field = "min-h-11 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm";

export default function CeramicReportsPage() {
  const { token, user } = useAuth();
  const convex = useConvex();
  const [month, setMonth] = useState(() => ceramicReportMonth(ceramicPlanningDate()));
  const [customRange, setCustomRange] = useState<{ month: string; start: string; end: string } | null>(null);
  const [regionChoice, setRegionChoice] = useState<Region>("transvaal");
  const [billingInteraction, setBillingInteraction] = useState({ dirty: false, saving: false });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const regionOptions = getUserRegionOptions(user);
  const region = regionOptions.find(option => option.value === regionChoice)?.value ?? regionOptions[0]?.value ?? "garden_route";
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const configuration = useQuery(api.ceramicBilling.settings, token && validMonth ? { token, effectiveDate: `${month}-01` } : "skip");
  const defaultRange = validMonth ? ceramicBillingPeriod(month, configuration?.config.billingStartDay ?? 25) : { start: "", end: "" };
  const range = customRange?.month === month ? customRange : defaultRange;
  const validRange = validMonth && !!range.start && !!range.end && range.start <= range.end;
  const { results, status, loadMore } = usePaginatedQuery(api.ceramicTiles.report,
    token && validRange ? { token, region, month, startDate: range.start, endDate: range.end } : "skip", { initialNumItems: 50 });
  useEffect(() => {
    if (status === "CanLoadMore" && results.length < 10000) loadMore(Math.min(100, 10000 - results.length));
  }, [status, results.length, loadMore]);
  const exportReports = async () => {
    if (!token || exporting || !validRange) return;
    setExporting(true); setError("");
    try {
      const rows: CeramicReportRow[] = [];
      let cursor: string | null = null;
      // Read every page, rather than silently exporting just the visible rows.
      for (let count = 0; count < 100; count++) {
        const page: { page: CeramicReportRow[]; isDone: boolean; continueCursor: string } = await convex.query(api.ceramicTiles.report, { token, region, month, startDate: range.start, endDate: range.end, paginationOpts: { numItems: 100, cursor } });
        rows.push(...page.page);
        if (page.isDone) { await downloadCeramicReports(rows, month, region, range); return; }
        cursor = page.continueCursor;
      }
      throw new Error("This month exceeds the 10,000-shipment export limit. No incomplete file was downloaded.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export the reports."); }
    finally { setExporting(false); }
  };
  const confirmed = results.filter(row => !row.needsReview && (!row.billing?.automation || row.billing.automation.status === "confirmed"));
  const mainTotal = confirmed.reduce((sum, row) => sum + (ceramicMonthlyAmounts(row.warehouseWeights ?? [], row.billing).total ?? 0), 0);
  const localTotal = confirmed.reduce((sum, row) => sum + (ceramicReportLocalPrice({ key: row.shipmentId, row }) ?? 0), 0);
  if (!token || !user) return <main className="p-6">Sign in to view Ceramic reports.</main>;
  const locked = exporting || billingInteraction.dirty || billingInteraction.saving;
  return <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3 text-[var(--foreground)] lg:p-4">
    <div className="shrink-0 max-h-[40dvh] space-y-3 overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-2"><div><Link href="/operations/ceramic-tiles" className="text-sm font-semibold text-[#0891B2]">← Ceramic shipments</Link><h1 className="mt-1 text-xl font-semibold">Ceramic reports</h1></div><p className="max-w-xl text-xs text-[var(--nav-text-color)]">Main loads: TRANSVAAL. Local deliveries: GEORGE → GEORGE, reports only.</p></header>
      <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs">Report month<input type="month" className={field} value={month} disabled={locked} onChange={event => setMonth(event.target.value)} /></label><label className="grid gap-1 text-xs">Period starts<input type="date" className={field} value={range.start} disabled={locked} onChange={event => setCustomRange({ month, start: event.target.value, end: range.end })} /></label><label className="grid gap-1 text-xs">Period ends<input type="date" className={field} value={range.end} disabled={locked} onChange={event => { const end = event.target.value, reportMonth = end ? end.slice(0, 7) : month; setMonth(reportMonth); setCustomRange({ month: reportMonth, start: range.start, end }); }} /></label>{regionOptions.length > 1 && <label className="grid gap-1 text-xs">Region<select className={field} value={region} disabled={locked} onChange={event => setRegionChoice(event.target.value as Region)}>{regionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}</div>
      <div className="[&>details]:p-2"><CeramicBillingSettings /></div>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs"><span>Loaded confirmed main: <strong>{formatCurrency(mainTotal)}</strong></span><span>Local transport: <strong>{formatCurrency(localTotal)}</strong></span><span>Combined: <strong>{formatCurrency(mainTotal + localTotal)}</strong></span></p>
      {results.length >= 10000 && status !== "Exhausted" && <p role="alert" className="text-sm text-[var(--warning-text)]">The view reached 10,000 shipments. Choose a shorter period to view every row.</p>}
    </div>
    {!validRange ? <p role="alert">Choose a valid report period.</p> : <CeramicReportWorkspace key={`${region}:${range.start}:${range.end}`} rows={results} month={month} range={range} token={token} loading={status === "LoadingFirstPage"} complete={status === "Exhausted"} exporting={exporting} exportError={error} onExport={() => void exportReports()} onInteractionChange={setBillingInteraction} />}
  </main>;
}
