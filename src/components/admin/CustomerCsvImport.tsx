"use client";
import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { parseAgeAnalysisCustomers } from "@/src/lib/clients/ageAnalysisCsv";
import { planCustomerImport, type CustomerImportRow } from "@/convex/customerImportRules";
import { ModalShell } from "@/src/components/common/ModalShell";

const button = "rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm hover:bg-[var(--card-bg)] disabled:opacity-40";
type Result = FunctionReturnType<typeof api.customerImport.importAgeAnalysis>[number];
export function CustomerCsvImport({ token, customers, onClose }: { token: string; customers: Doc<"customers">[]; onClose: () => void }) {
  const importRows = useMutation(api.customerImport.importAgeAnalysis);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const plan = useMemo(() => planCustomerImport(rows, customers), [rows, customers]);
  const completed = useMemo(() => new Map(results.map(r => [r.sourceRow, r])), [results]);
  const display = plan.map(entry => ({ ...entry, result: completed.get(entry.row.sourceRow) }));
  const ready = display.filter(e => !e.reason && !e.result);
  const skipped = display.filter(e => e.result?.status === "skipped" || (!e.result && e.reason));
  const imported = results.filter(r => r.status === "imported");
  const filtered = display.filter(e => filter === "all" || (filter === "ready" && !e.reason && !e.result) || (filter === "skipped" && (e.result?.status === "skipped" || (!e.result && e.reason))) || (filter === "imported" && e.result?.status === "imported"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 40));
  const currentPage = Math.min(page, pageCount);
  async function runImport() {
    const pending = ready.map(e => e.row);
    if (!pending.length) return;
    setBusy(true); setError(""); setProgress({ done: 0, total: pending.length });
    try {
      for (let start = 0; start < pending.length; start += 100) {
        const batch = pending.slice(start, start + 100);
        const saved = await importRows({ token, rows: batch });
        setResults(previous => [...previous, ...saved]);
        setProgress({ done: Math.min(start + batch.length, pending.length), total: pending.length });
      }
    } catch (e) { setError(`${e instanceof Error ? e.message : "Import failed."} Completed batches are retained. You can retry the remaining rows; existing customers will be skipped.`); }
    finally { setBusy(false); }
  }
  return <ModalShell open onClose={() => { if (!busy) onClose(); }} portal style={{ width: "calc(100vw - 32px)", maxWidth: "1152px", maxHeight: "calc(100dvh - 32px)", margin: 0 }}>
    <div style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 32px)", overflow: "hidden" }} role="dialog" aria-modal="true" aria-labelledby="customer-import-title">
      <header className="flex justify-between items-center gap-4 p-5 border-b border-[var(--card-border)]" style={{ flexShrink: 0 }}><h2 id="customer-import-title" className="text-xl font-semibold">Import Age Analysis customers</h2><button className={button} disabled={busy} onClick={onClose}>Close</button></header>
      <div className="p-5 space-y-4" style={{ minHeight: 0, overflow: "auto", overscrollBehavior: "contain" }}>
      <p>Choose your Age Analysis customer CSV. Preview it below, then import the ready rows. Existing customers, account numbers and active/inactive status are kept unchanged.</p>
      <label className="block">Customer CSV<input type="file" accept=".csv,text/csv" disabled={busy} className="block mt-2" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        setBusy(true); setError(""); setRows([]); setResults([]); setProgress(null); setPage(1); setFilter("all"); setFilename(file.name);
        try { if (file.size > 10_000_000) throw new Error("Choose a CSV smaller than 10 MB."); setRows(parseAgeAnalysisCustomers(await file.text())); }
        catch (err) { setError(err instanceof Error ? err.message : "Could not read this CSV."); }
        finally { setBusy(false); }
      }} /></label>
      <details className="text-sm"><summary className="cursor-pointer text-cyan-600">Column mapping and import rules</summary><ul className="list-disc pl-5 mt-2 space-y-1"><li>Rekno → account number; Name → customer name.</li><li>Contact, Email and Telephone → contact fields. Mobile is the phone fallback.</li><li>Delivery address → address; postal address is used when delivery is empty.</li><li>Tax Reference → VAT number. Aliases, COD, mobile, fax and additional postal details are saved in customer notes.</li><li>Blocked = Yes → inactive. No balances, credit limits, pricing lists, accounting tax settings or customer rates are imported.</li><li>Missing names and duplicate names/accounts are skipped. Resolve ambiguous rows in the CSV before importing them.</li></ul></details>
      {error && <p role="alert" className="text-red-500 whitespace-pre-wrap">{error}</p>}
      {!!rows.length && <>
        <div className="flex flex-wrap gap-4 items-center"><strong>{filename}</strong><span>{rows.length} rows</span><span>{ready.length} ready ({ready.filter(e => !e.row.isActive).length} inactive)</span><span>{skipped.length} skipped</span><span>{imported.length} imported</span></div>
        <div className="flex items-center justify-between gap-3 flex-wrap"><label>Show <select className="settings-input" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">All rows</option><option value="ready">Ready to import</option><option value="skipped">Skipped / conflicts</option><option value="imported">Imported</option></select></label></div>
        {progress && <p role="status">{busy ? "Processing" : "Processed"} {progress.done} of {progress.total} rows in this run. {busy ? "Keep this window open." : "Imported customers are now available in Fleetcore."}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm text-left" style={{ minWidth: "850px" }}><thead><tr>{["Row", "Account", "Customer / details", "Contact", "Fleetcore status", "Import result"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{filtered.slice((currentPage - 1) * 40, currentPage * 40).map(({ row, reason, result }) => <tr key={row.sourceRow} className="border-t border-[var(--card-border)] align-top"><td className="p-2">{row.sourceRow}</td><td className="p-2">{row.accountNumber}</td><td className="p-2"><strong>{row.name || "(Missing name)"}</strong><details><summary className="cursor-pointer text-cyan-600">Details</summary><p className="whitespace-pre-wrap">{row.address || "No address"}</p><p>VAT: {row.vatNumber || "—"}</p><p className="whitespace-pre-wrap">{row.note}</p></details></td><td className="p-2 break-all">{row.contactPerson}<br />{row.email}<br />{row.phone}</td><td className="p-2">{row.isActive ? "Active" : "Inactive (blocked)"}</td><td className="p-2">{result?.status === "imported" ? "Imported" : result?.reason ?? reason ?? "Ready"}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-end gap-3"><button className={button} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className={button} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      </>}
      </div>
      <footer className="p-4 border-t border-[var(--card-border)] flex justify-end gap-3 flex-wrap" style={{ flexShrink: 0 }}>
        <button className={button} disabled={busy} onClick={onClose}>Close</button>
        <button className={`${button} bg-cyan-600 text-white`} disabled={busy || !ready.length} onClick={() => void runImport()}>{busy ? "Importing…" : `Import ${ready.length} ready customers`}</button>
      </footer>
    </div>
  </ModalShell>;
}
