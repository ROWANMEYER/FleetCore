"use client";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CeramicBillingReview } from "./CeramicBillingReview";
import { CeramicBillingEditor } from "./CeramicBillingEditor";
import { CeramicTemplateTable } from "./CeramicTemplateTable";
import { CeramicReportDataTable } from "./CeramicReportDataTable";
import { CeramicReportViewport } from "./CeramicReportViewport";
import { buildCeramicTemplateSheets } from "@/src/lib/ceramic-tiles/templateWorkbook";
import { ceramicReportItems, ceramicReportNeedsReview, ceramicReportMissing, type CeramicReportItem, type CeramicReportFilter, type CeramicReportSort, type CeramicReportKind } from "@/src/lib/ceramic-tiles/reportView";
import type { CeramicReportRow } from "@/src/lib/ceramic-tiles/reportExport";
import styles from "./CeramicReports.module.css";
type Interaction = { dirty: boolean; saving: boolean };
type Edit = { item: CeramicReportItem; legacy: boolean };
function InlineReportEditor({ edit, token, width, interaction, onInteraction, onClose }: { edit: Edit; token: string; width: number; interaction: Interaction; onInteraction: Dispatch<SetStateAction<Interaction>>; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "nearest", inline: "start" }); }, []);
  const row = edit.item.row;
  return <div className={styles.editor} style={{ width: Math.max(240, Math.min(760, width - 28)) }}>
    <h3 ref={heading} tabIndex={-1} style={{ scrollMarginTop: 60 }}>Edit / review {row.shipmentNumber}</h3>
    {edit.legacy ? <CeramicBillingEditor inline row={row} token={token} mode={edit.item.local ? "local" : "main"} onClose={onClose} onInteractionChange={onInteraction} /> : <><CeramicBillingReview shipmentId={row.shipmentId} onInteractionChange={onInteraction} /><button type="button" className={`${styles.control} mt-3`} disabled={interaction.saving} onClick={onClose}>{interaction.dirty ? "Cancel edits" : "Close review"}</button></>}
  </div>;
}
export function CeramicReportWorkspace({ rows, month, range, token, loading, complete, exporting, exportError, onExport, onInteractionChange }: {
  rows: CeramicReportRow[]; month: string; range: { start: string; end: string }; token: string; loading: boolean; complete: boolean; exporting: boolean; exportError: string; onExport: () => void; onInteractionChange: Dispatch<SetStateAction<Interaction>>;
}) {
  const [view, setView] = useState<"table" | "preview">("table"), [kind, setKind] = useState<CeramicReportKind>("monthly");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState<CeramicReportFilter>("all");
  const [sort, setSort] = useState<CeramicReportSort>("date"), [descending, setDescending] = useState(false);
  const [fullscreen, setFullscreen] = useState(false), [zoom, setZoom] = useState("fit-width");
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 }), [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [edit, setEdit] = useState<Edit | null>(null), [interaction, setInteraction] = useState<Interaction>({ dirty: false, saving: false });
  const panel = useRef<HTMLElement>(null), fullButton = useRef<HTMLButtonElement>(null);
  const items = useMemo(() => ceramicReportItems(rows, kind, search, filter, sort, descending), [rows, kind, search, filter, sort, descending]);
  const sheets = useMemo(() => view === "preview" ? buildCeramicTemplateSheets(rows, month) : [], [view, rows, month]);
  const scopedRows = kind === "monthly" ? rows : rows.filter(row => row.locals.length > 0);
  const reviewCount = scopedRows.filter(ceramicReportNeedsReview).length, missingCount = scopedRows.filter(ceramicReportMissing).length;
  const scale = zoom === "fit-width" ? Math.min(1, Math.max(.001, (viewportSize.width - 12) / naturalSize.width)) : zoom === "fit-sheet" ? Math.min(1, Math.max(.001, Math.min((viewportSize.width - 12) / naturalSize.width, (viewportSize.height - 12) / naturalSize.height))) : Number(zoom);
  useEffect(() => { onInteractionChange(interaction); }, [interaction, onInteractionChange]);
  useEffect(() => () => onInteractionChange({ dirty: false, saving: false }), [onInteractionChange]);
  useEffect(() => {
    if (!interaction.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [interaction.dirty]);
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; fullButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); setFullscreen(false); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const controls = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],textarea:not([disabled]),[tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus({ preventScroll: true }); };
  }, [fullscreen]);
  const open = (item: CeramicReportItem, legacy = false) => {
    if (interaction.saving) return;
    if (interaction.dirty && !window.confirm("Discard this row's unsaved changes and open another shipment?")) return;
    setInteraction({ dirty: false, saving: false }); setEdit({ item: structuredClone(item), legacy });
  };
  const close = () => { setEdit(null); setInteraction({ dirty: false, saving: false }); };
  const changeSort = (key: CeramicReportSort) => { if (sort === key) setDescending(!descending); else { setSort(key); setDescending(false); } };
  const previewEdit = (id: string) => {
    const row = rows.find(row => row.shipmentId === id); if (!row) return;
    const local = kind === "local" ? row.locals[0] : undefined;
    setSearch(""); setFilter("all"); setView("table");
    open({ row, local, key: local ? `${row.shipmentId}:${local.key}` : row.shipmentId }, !!row.billing && !row.billing.automation);
  };
  const activeEdit = edit && items.some(item => item.key === edit.item.key) ? edit : null;
  const editor = activeEdit ? <InlineReportEditor key={`${activeEdit.item.key}:${activeEdit.legacy}`} edit={activeEdit} token={token} width={viewportSize.width} interaction={interaction} onInteraction={setInteraction} onClose={close} /> : null;
  return <section ref={panel} className={`${styles.panel} ${fullscreen ? styles.fullscreen : ""}`} role={fullscreen ? "dialog" : "region"} aria-modal={fullscreen || undefined} aria-label="Ceramic report workspace">
    <div className={styles.toolbar}>
      <h2>{kind === "monthly" ? "Monthly Ceramic" : "Local loads"} · {month}</h2><span className="text-xs text-[var(--nav-text-color)]">{range.start} → {range.end}</span>
      <button ref={fullButton} type="button" className={`${styles.control} ml-auto`} onClick={() => setFullscreen(!fullscreen)} aria-pressed={fullscreen}>{fullscreen ? "Exit full screen" : "Full screen"}</button>
      <button type="button" className={styles.control} disabled={exporting || loading} onClick={onExport}>{exporting ? "Exporting…" : "Export full period"}</button>
      <div className={styles.controls}>
        {(["monthly", "local"] as const).map(value => <button key={value} type="button" className={styles.control} disabled={!!edit} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "monthly" ? "Monthly Ceramic" : "Local loads"}</button>)}
        <span aria-hidden="true">|</span>
        <button type="button" className={styles.control} disabled={!!edit} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        <button type="button" className={styles.control} disabled={!!edit} aria-pressed={view === "preview"} onClick={() => setView("preview")}>Sheet preview</button>
        {view === "table" ? <><input type="search" aria-label="Search report shipments" placeholder="Search shipment, driver, truck or destination" className={`${styles.control} ${styles.search}`} value={search} disabled={!!edit} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter report status" className={styles.control} value={filter} disabled={!!edit} onChange={event => setFilter(event.target.value as CeramicReportFilter)}><option value="all">All rows</option><option value="review">Needs review ({reviewCount})</option><option value="missing">Missing amounts ({missingCount})</option></select></> : <><select aria-label="Sheet zoom" className={styles.control} value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit-width">Fit width</option><option value="fit-sheet">Fit whole sheet</option>{[.5,.75,1,1.25,1.5].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select><span className="text-xs">{(scale * 100).toFixed(scale < .1 ? 1 : 0)}% · original template, all loaded shipments. #REF! retains the unavailable January workbook link.</span></>}
      </div>
    </div>
    {exportError && <p role="alert" className="shrink-0 px-3 py-2 text-sm text-[var(--danger-text)]">{exportError}</p>}
    <CeramicReportViewport onSize={setViewportSize} resetKey={`${kind}:${view}:${search}:${filter}:${sort}:${descending}`}>
      {loading ? <p role="status" className={styles.empty}>Loading report…</p> : view === "preview" ? <CeramicTemplateTable sheet={sheets[kind === "monthly" ? 0 : 1]} onEdit={previewEdit} scale={scale} onSize={setNaturalSize} /> : items.length ? <CeramicReportDataTable items={items} kind={kind} editingKey={activeEdit?.item.key ?? null} editor={editor} onEdit={open} onSort={changeSort} sort={sort} descending={descending} /> : <p className={styles.empty}>{search || filter !== "all" ? "No rows match these filters." : kind === "local" ? "No qualifying local deliveries for this period." : "No assigned shipments for this period."}</p>}
    </CeramicReportViewport>
    <footer className={styles.footer}>{edit && !activeEdit && <button type="button" className={styles.control} disabled={interaction.saving} onClick={close}>Close unavailable row</button>}<span aria-live="polite">{view === "table" ? `${items.length} visible row(s) · ` : ""}{rows.length} shipment(s) loaded{complete ? " · complete period" : rows.length >= 10000 ? " · view limit reached" : " · loading remaining shipments…"}</span><span>{reviewCount} need review · {missingCount} missing amounts</span><span>{interaction.dirty ? "Unsaved row changes — save or cancel before filtering." : "Search filters change the table only. Excel exports the full period."}</span></footer>
  </section>;
}
