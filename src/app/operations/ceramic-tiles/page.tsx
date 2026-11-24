"use client";

import styles from "@/src/components/ceramic-tiles/CeramicMobile.module.css";
import { CeramicDispatchHeader } from "@/src/components/ceramic-tiles/CeramicDispatchHeader";
import { ceramicImportErrors } from "@/src/lib/ceramic-tiles/importValidation";
import { ceramicErrorMessage } from "@/src/lib/ceramic-tiles/assignmentAccess";
import { REGION_LABELS, getUserRegions } from "@/src/lib/regions";
import type { Region } from "@/src/lib/regions";
import { ceramicPlanningDate } from "@/src/lib/ceramic-tiles/planning";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, FileText, FolderUp, LoaderCircle, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { parseCeramicShipmentText, withCeramicReviewWarnings, type CeramicShipment } from "@/src/lib/ceramic-tiles/parser";
import { extractCeramicPdfText, hashCeramicPdf } from "@/src/lib/ceramic-tiles/pdfReader";
import { GuidedShipmentWorkspace, type CeramicWorkspaceInteraction } from "@/src/components/ceramic-tiles/GuidedShipmentWorkspace";
import { ModalShell } from "@/src/components/common/ModalShell";

import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { MobileCeramicTiles } from "@/src/components/ceramic-tiles/MobileCeramicTiles";
import { isMobileAppEnvironment } from "@/src/lib/appMode";

type Entry = {
  id: string;
  file: File;
  filename: string;
  hash: string;
  shipment?: CeramicShipment;
  error?: string;
  expanded: boolean;
};
type AssignDraft = { driverId: string; truckId: string; routeDate: string };
const panel = "rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm";
const input = "w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#06B6D4]";
const secondaryButton = "rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-sunken)] disabled:opacity-50";
const primaryButton = "rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const formatNumber = (value: number | null) => value === null ? "—" : value.toLocaleString("en-GB", { maximumFractionDigits: 3 });
const rowStatusLabel: Record<string, string> = {
  new: "New shipment",
  revision: "Newer revision",
  duplicate: "Already imported",
  older_version: "Older version",
  version_conflict: "Version conflict",
  deleted: "Previously deleted — restore before importing",
};

function ShipmentHistoryPanel({
  token, region, shipmentId, onClose,
}: {
  token: string;
  region: Region;
  shipmentId: Id<"ceramicShipments">;
  onClose: () => void;
}) {
  const history = useQuery(api.ceramicTiles.versions, { token, region, shipmentId });
  return <section className={`${panel} p-4`} aria-label="Ceramic Tiles shipment version history">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">Shipment details & revision history</h2>
        <p className="text-xs text-[var(--nav-text-color)]">Each imported revision is preserved for comparison. The newest version is active.</p>
      </div>
      <button type="button" className={secondaryButton} onClick={onClose}>Close</button>
    </div>
    {!history ? <p className="text-sm text-[var(--nav-text-color)]">Loading revision history...</p>
      : history.length === 0 ? <p className="text-sm text-[var(--nav-text-color)]">No revisions found.</p>
      : <div className="space-y-2">{history.map((revision, index) =>
        <details className="rounded-lg border border-[var(--card-border)] p-3" key={revision._id} open={index === 0}>
          <summary className="cursor-pointer text-xs font-semibold">
            Version {revision.version} · {revision.fileName} · {new Date(revision.importedAt).toLocaleString("en-ZA")}
          </summary>
          {revision.fileUrl && <a href={revision.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-semibold text-[#0891B2] underline">Open original PDF</a>}
          <p className="mt-2 text-xs text-[var(--nav-text-color)]">
            Loading {revision.snapshot.plannedLoadingDate ?? "—"} · Delivery {revision.snapshot.plannedDeliveryDate ?? "—"} ·
            {formatNumber(revision.snapshot.totalWeightKg)} kg · {formatNumber(revision.snapshot.totalPallets)} pallets
          </p>
          {revision.snapshot.destinations.map((destination, destinationIndex) => <div key={destinationIndex} className="mt-3 border-t border-[var(--card-border)] pt-2">
            <p className="text-xs font-semibold">{destination.name}</p>
            <p className="text-xs text-[var(--nav-text-color)]">{destination.addressLines.join(", ")}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="text-[var(--nav-text-color)]"><tr><th>Delivery</th><th>Order</th><th>Collection</th><th>Weight (kg)</th><th>Pallets</th></tr></thead>
                <tbody>{destination.orders.map((order) => <tr key={order.deliveryNumber} className="border-t border-[var(--card-border)]">
                  <td className="py-2">{order.deliveryNumber}</td><td>{order.orderNumber}</td><td>{order.collectFrom || "—"}</td>
                  <td>{formatNumber(order.weightKg)}</td><td>{formatNumber(order.palletsEstimate)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>)}
        </details>)}</div>}
  </section>;
}

function CeramicTilesDesktopPage() {
  const { user, token } = useAuth();
  const region: Region = "transvaal";
  const canManageRecords = user?.role === "admin" || getUserRegions(user).includes("transvaal");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignDraft>>({});
  const [assignmentSavingId, setAssignmentSavingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<Id<"ceramicShipments"> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"ceramicShipments"> | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<{ shipmentId: Id<"ceramicShipments">; shipmentNumber: string; version: number; updatedAt: number } | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selectedNumber, setSelectedNumber] = useState("");
  const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<CeramicWorkspaceInteraction>({ dirty: false, saving: false });
  const importRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const ready = useMemo(() => entries.filter((item): item is Entry & { shipment: CeramicShipment } => !!item.shipment), [entries]);
  const comparison = useQuery(
    api.ceramicTiles.previewBatch,
    token && ready.length > 0
      ? { token, region, files: ready.map(({ hash, shipment }) => ({
        shipmentNumber: shipment.shipmentNumber, version: shipment.version, fileHash: hash,
      })) }
      : "skip"
  );
  const imported = useQuery(api.ceramicTiles.list, token ? { token, region } : "skip");
  const fleet = useQuery(api.ceramicTiles.fleetChoices, token ? { token, region } : "skip");
  const generateUploadUrl = useMutation(api.ceramicTiles.generateUploadUrl);
  const commitBatch = useMutation(api.ceramicTiles.commitBatch);
  const assign = useMutation(api.ceramicTiles.assign);
  const removeShipment = useMutation(api.ceramicTiles.remove);
  const restoreShipmentRecord = useMutation(api.ceramicTiles.restore);

  const updateShipment = useCallback((id: string, update: (shipment: CeramicShipment) => CeramicShipment) => {
    setEntries((prev) => prev.map((item) =>
      item.id === id && item.shipment ? { ...item, shipment: withCeramicReviewWarnings(update(item.shipment)) } : item
    ));
  }, []);

  const addFiles = useCallback(async (selection: FileList | File[]) => {
    if (busy || saving || restoring || workspaceState.saving || assignmentSavingId !== null) return;
    const list = Array.from(selection);
    if (!list.length) return;
    setMessage("");
    setFailure("");
    if (entries.length + list.length > 25) {
      setFailure("You can review up to 25 PDFs per import batch. Remove some before adding more.");
      return;
    }
    setImportOpen(true);
    setBusy(true);
    try {
      const batch: Entry[] = [];
      for (const file of list) {
        const entry: Entry = { id: crypto.randomUUID(), file, filename: file.name, hash: "", expanded: false };
        try {
          // The PDF is read on the device. Only the reviewed structured shipment
          // and SHA-256 content hash are transmitted when the user presses Import.
          const [text, hash] = await Promise.all([extractCeramicPdfText(file), hashCeramicPdf(file)]);
          entry.hash = hash;
          const result = parseCeramicShipmentText(text);
          if (result.ok) {
            entry.shipment = result.shipment;
          } else {
            entry.error = result.errors.join(" ");
          }
        } catch (error) {
          entry.error = error instanceof Error ? error.message : String(error);
        }
        batch.push(entry);
      }
      setEntries((prev) => [...prev, ...batch]);
    } finally {
      setBusy(false);
    }
  }, [busy, saving, restoring, entries.length, workspaceState.saving, assignmentSavingId]);

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files;
    if (chosen) void addFiles(chosen);
    event.currentTarget.value = "";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  };
  const statusByNumber = new Map((comparison ?? []).map((item) => [item.shipmentNumber.toUpperCase(), item]));
  const conflicts = ready.filter(({ shipment }) => statusByNumber.get(shipment.shipmentNumber.toUpperCase())?.status === "version_conflict" || statusByNumber.get(shipment.shipmentNumber.toUpperCase())?.status === "deleted");
  const duplicateNumbers = new Set<string>();
  const repeatedInBatch = ready.filter(({ shipment }) => {
    const key = shipment.shipmentNumber.toUpperCase();
    if (duplicateNumbers.has(key)) return true;
    duplicateNumbers.add(key);
    return false;
  });
  const validationErrors = ready.flatMap(item => ceramicImportErrors(item.shipment));
  const canCommit = validationErrors.length === 0 && !!token && !busy && !saving && !restoring && ready.length > 0 && comparison !== undefined &&
    conflicts.length === 0 && repeatedInBatch.length === 0;
  const importBatch = async () => {
    if (!token || !canCommit || workspaceState.saving || assignmentSavingId !== null) return;
    if (workspaceState.dirty && !window.confirm("Continue to an imported shipment? Unsaved driver-instruction changes will be lost.")) return;
    setSaving(true);
    setFailure("");
    setMessage("");
    try {
      const staged = [];
      for (const item of ready) {
        const decision = statusByNumber.get(item.shipment.shipmentNumber.toUpperCase());
        if (!decision) throw new Error(`Version comparison is not ready for ${item.shipment.shipmentNumber}.`);
        let storageId: Id<"_storage"> | undefined;
        if (decision.status === "new" || decision.status === "revision") {
          setMessage(`Uploading original PDF for ${item.shipment.shipmentNumber}...`);
          const uploadUrl = await generateUploadUrl({ token, region });
          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: item.file,
          });
          if (!response.ok) throw new Error(`Upload failed for ${item.filename} (HTTP ${response.status}). No shipment records were changed.`);
          const result: { storageId?: string } = await response.json();
          if (!result.storageId) throw new Error(`No storage ID was returned for ${item.filename}.`);
          storageId = result.storageId as Id<"_storage">;
        }
        staged.push({ fileName: item.filename, fileHash: item.hash, snapshot: item.shipment, storageId });
      }
      setMessage("Saving reviewed shipments and revision history...");
      const outcome = await commitBatch({ token, region, files: staged });
      const created = outcome.filter((r) => r.status === "created").length;
      const revised = outcome.filter((r) => r.status === "revised").length;
      const skipped = outcome.length - created - revised;
      setMessage(`Import complete: ${created} new, ${revised} revised, ${skipped} already imported/older. Existing driver and truck assignments are retained on revisions.`);
      setEntries((prev) => prev.filter((item) => !item.shipment));
      const nextShipment = outcome.find(item => item.status === "created" || item.status === "revised") ?? outcome[0];
      if (nextShipment) { setSelectedNumber(nextShipment.shipmentNumber); setWorkspaceGeneration(value => value + 1); }
      setImportOpen(entries.some(item => !item.shipment));
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setMessage("");
      setFailure(ceramicErrorMessage(error, "Import failed. No shipment records were changed. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const restoreShipment = async () => {
    if (!token || !restoreTarget || restoring || saving || deleting || workspaceState.dirty || workspaceState.saving || assignmentSavingId !== null) return;
    setRestoring(true);
    setRestoreError("");
    try {
      await restoreShipmentRecord({ token, region, shipmentId: restoreTarget.shipmentId,
        expectedVersion: restoreTarget.version, expectedUpdatedAt: restoreTarget.updatedAt });
      setMessage(`Shipment ${restoreTarget.shipmentNumber} restored with its saved details. Continue the import to open it or apply a newer PDF revision.`);
      setFailure("");
      setRestoreTarget(null);
    } catch (error) {
      setRestoreError(ceramicErrorMessage(error, "Could not restore shipment. Please try again."));
    } finally {
      setRestoring(false);
    }
  };

  const deleteShipment = async () => {
    if (!token || !deleteTarget || deleting || restoring) return;
    setDeleting(true);
    setDeleteError("");
    setHistoryId((id) => id === deleteTarget._id ? null : id);
    try {
      await removeShipment({ token, region: deleteTarget.region, shipmentId: deleteTarget._id,
        expectedVersion: deleteTarget.version, expectedUpdatedAt: deleteTarget.updatedAt });
      setMessage(`Shipment ${deleteTarget.shipmentNumber} deleted.`);
      setFailure("");
      setAssignmentDrafts((drafts) => {
        const next = { ...drafts };
        delete next[deleteTarget._id];
        return next;
      });
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(ceramicErrorMessage(error, "Could not delete shipment. Please try again."));
    } finally {
      setDeleting(false);
    }
  };

  const saveAssignment = async (row: Doc<"ceramicShipments">) => {
    const shipmentId = row._id;
    if (!token || assignmentSavingId !== null || busy || saving || deleting || restoring) return false;
    setFailure("");
    setMessage("");
    setAssignmentSavingId(shipmentId);
    const draft = assignmentDrafts[shipmentId] ?? { driverId: row.driverId ?? "", truckId: row.truckId ?? "", routeDate: row.routeDate ?? ceramicPlanningDate() };
    try {
      await assign({
        token, region, shipmentId, routeDate: draft.routeDate, expectedVersion: row.version,
        driverId: draft.driverId ? draft.driverId as Id<"drivers"> : null,
        truckId: draft.truckId ? draft.truckId as Id<"trucks"> : null,
      });
      return true;
    } catch (error) {
      setFailure(ceramicErrorMessage(error, "Could not save assignment. Please try again."));
      return false;
    } finally {
      setAssignmentSavingId(null);
    }
  };

  if (!token || !user) {
    return <main className="p-6 text-sm text-[var(--nav-text-color)]">Sign in to use Ceramic Tiles.</main>;
  }

  return <main className={`${styles.workspace} overflow-y-auto p-4 lg:p-6`}>
    <div className="mx-auto max-w-[1500px] space-y-4">
      <CeramicDispatchHeader actions={<>
        <button type="button" className={`${styles.secondary} inline-flex min-h-11 items-center gap-2`} disabled={busy || saving || restoring || workspaceState.saving || assignmentSavingId !== null} onClick={() => { setImportOpen(true); requestAnimationFrame(() => importRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }}><FolderUp size={16} />Upload PDFs</button>
        <span className="text-xs font-semibold">Main loads: {REGION_LABELS.transvaal}</span>
      </>} />

      {failure && <div role="alert" className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-3 text-sm text-[var(--danger-text)]">{failure}</div>}
      {message && <div role="status" className="rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-sm text-[var(--success-text)]">{message}</div>}

      <div ref={importRef} hidden={!importOpen}>
      <section className={`${panel} p-4`} aria-label="Upload shipment PDFs">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Upload &amp; review PDFs</h2>
            <p className="mt-0.5 text-xs text-[var(--nav-text-color)]">Up to 25 PDFs at a time. Documents are read on your device; scanned PDFs cannot be extracted yet.</p>
          </div>
          <div className="flex items-center gap-2"><button type="button" className={secondaryButton} disabled={busy || saving || restoring} onClick={() => setImportOpen(false)}>Back to shipments</button>
          {entries.length > 0 && <button type="button" onClick={() => { setEntries([]); setFailure(""); }} className={secondaryButton} disabled={busy || saving || restoring}>Clear batch</button>}</div>
        </div>
        <div
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={onDrop}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-[#06B6D4] bg-[var(--accent-soft-bg)]" : "border-[var(--card-border)] bg-[var(--surface-sunken)]"}`}
        >
          <FolderUp className="mx-auto mb-2 h-7 w-7 text-[#0891B2]" />
          <p className="text-sm font-medium">Drag shipment plan PDFs here</p>
          <p className="my-2 text-xs text-[var(--nav-text-color)]">or</p>
          <label className={`${primaryButton} inline-flex cursor-pointer items-center gap-2`}>
            Choose PDFs
            <input type="file" accept=".pdf,application/pdf" multiple onChange={onSelectFiles} disabled={busy || saving || restoring} className="sr-only" aria-label="Choose Ceramic Tiles PDFs" />
          </label>
          {busy && <p role="status" className="mt-3 flex items-center justify-center gap-2 text-xs"><LoaderCircle className="h-4 w-4 animate-spin" />Reading PDFs and extracting shipment details...</p>}
        </div>

        {entries.length > 0 && <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--nav-text-color)]">Review batch · {entries.length} file(s)</h3>
            <button disabled={!canCommit} type="button" className={primaryButton} onClick={() => void importBatch()}>
              {saving ? "Importing..." : `Import & continue · ${ready.length} shipment(s)`}
            </button>
          </div>
          {ready.some(({ shipment }) => statusByNumber.get(shipment.shipmentNumber.toUpperCase())?.status === "deleted") && <p role="alert" className="text-xs text-[var(--warning-text)]">This batch contains a previously deleted shipment. {canManageRecords ? (workspaceState.dirty ? "Save or discard the open shipment edits before restoring another shipment." : "Use Restore shipment below, then continue the import. The saved PDF and shipment history will be retained.") : "Ask an administrator or the TRANSVAAL region owner to restore it from this import review."}</p>}
          {validationErrors.length > 0 && <p role="alert" className="text-xs text-[var(--danger-text)]">Fix the highlighted shipment fields below before importing.</p>}
          {repeatedInBatch.length > 0 && <p className="text-xs text-[var(--danger-text)]">The same shipment number appears more than once in this batch. Remove one PDF first.</p>}
          {entries.map((entry) => {
            const shipment = entry.shipment;
            const issues = shipment ? ceramicImportErrors(shipment) : [];
            const status = shipment ? statusByNumber.get(shipment.shipmentNumber.toUpperCase()) : null;
            const deliveryCount = shipment?.destinations.reduce((count, destination) => count + destination.orders.length, 0) ?? 0;
            return <article key={entry.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]">
              <div className="flex flex-wrap items-center gap-3 px-3 py-3">
                <FileText className="h-5 w-5 shrink-0 text-[#0891B2]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{entry.filename}</p>
                  {shipment
                    ? <p className="text-xs text-[var(--nav-text-color)]">{shipment.shipmentNumber} · Version {shipment.version} · {shipment.destinations.length} destinations · {deliveryCount} deliveries · {formatNumber(shipment.totalWeightKg)} kg</p>
                    : <p className="text-xs text-[var(--danger-text)]">{entry.error ?? "Unable to extract shipment"}</p>}
                </div>
                {status && <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${status.status === "version_conflict" ? "border-[var(--danger-border)] text-[var(--danger-text)]" : "border-[var(--card-border)] text-[var(--nav-text-color)]"}`}>{rowStatusLabel[status.status]}{status.currentVersion ? ` (current v${status.currentVersion})` : ""}</span>}
                {status?.status === "deleted" && status.restoreTarget && canManageRecords && <button type="button" className={`${secondaryButton} border-[var(--warning-border)] text-[var(--warning-text)]`} disabled={busy || saving || restoring || deleting || workspaceState.dirty || workspaceState.saving || assignmentSavingId !== null} onClick={() => { setRestoreError(""); setRestoreTarget({ ...status.restoreTarget!, shipmentNumber: status.shipmentNumber, version: status.currentVersion! }); }}>Restore shipment</button>}
                {shipment?.warnings.length ? <span title={shipment.warnings.join("\n")} className="inline-flex items-center gap-1 text-xs text-[var(--warning-text)]"><AlertTriangle className="h-4 w-4" />{shipment.warnings.length} flags</span> : shipment && <CheckCircle2 className="h-4 w-4 text-[var(--success-text)]" />}
                {shipment && <button type="button" className={secondaryButton} onClick={() => setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, expanded: !e.expanded } : e))}>
                  {entry.expanded ? "Hide details" : "Review / edit"}
                </button>}
                <button type="button" aria-label={`Remove ${entry.filename}`} title="Remove from batch" onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))} className="rounded-md p-2 text-[var(--nav-text-color)] hover:text-[var(--danger-text)]"><Trash2 className="h-4 w-4" /></button>
              </div>
              {issues.length > 0 && <ul role="alert" className="list-disc space-y-1 px-8 pb-3 text-xs text-[var(--danger-text)]">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
              {entry.expanded && shipment && <div className="space-y-3 border-t border-[var(--card-border)] bg-[var(--surface-sunken)] p-3">
                {shipment.warnings.length > 0 && <div className="space-y-1 text-xs text-[var(--warning-text)]">{shipment.warnings.map((warning, index) => <p key={index}>• {warning}</p>)}</div>}
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs">Shipment number
                    <input className={input} value={shipment.shipmentNumber} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, shipmentNumber: e.target.value.toUpperCase().trim() }))} />
                  </label>
                  <label className="text-xs">Version
                    <input type="number" min={1} step={1} className={input} value={shipment.version} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, version: Number(e.target.value) }))} />
                  </label>
                  <label className="text-xs">Planned loading
                    <input type="date" className={input} value={shipment.plannedLoadingDate ?? ""} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, plannedLoadingDate: e.target.value || null }))} />
                  </label>
                  <label className="text-xs">Planned delivery
                    <input type="date" className={input} value={shipment.plannedDeliveryDate ?? ""} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, plannedDeliveryDate: e.target.value || null }))} />
                  </label>
                  <label className="text-xs">Total weight (kg)
                    <input type="number" min="0" step="any" className={input} value={shipment.totalWeightKg ?? ""} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, totalWeightKg: e.target.value === "" ? null : Number(e.target.value) }))} />
                  </label>
                  <label className="text-xs">Total pallets
                    <input type="number" min="0" step="any" className={input} value={shipment.totalPallets ?? ""} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, totalPallets: e.target.value === "" ? null : Number(e.target.value) }))} />
                  </label>
                </div>
                {shipment.destinations.map((destination, destinationIndex) => <div key={destinationIndex} className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="text-xs">Delivery destination
                      <input className={input} value={destination.name} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, destinations: s.destinations.map((d, i) => i === destinationIndex ? { ...d, name: e.target.value } : d) }))} />
                    </label>
                    <label className="text-xs">Address / contact lines
                      <input className={input} value={destination.addressLines.join(" | ")} onChange={(e) => updateShipment(entry.id, (s) => ({ ...s, destinations: s.destinations.map((d, i) => i === destinationIndex ? { ...d, addressLines: e.target.value.split("|").map((part) => part.trim()).filter(Boolean) } : d) }))} />
                    </label>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left text-xs">
                      <thead className="border-b border-[var(--card-border)] text-[var(--nav-text-color)]"><tr><th className="pb-2">Delivery</th><th className="pb-2">Order number (optional)</th><th className="pb-2">Collect from</th><th className="pb-2">Weight (kg)</th><th className="pb-2">Pallets</th></tr></thead>
                      <tbody>{destination.orders.map((order, orderIndex) => {
                        const changeOrder = (field: "deliveryNumber" | "orderNumber" | "collectFrom" | "weightKg" | "palletsEstimate", value: string) => {
                          updateShipment(entry.id, (s) => ({ ...s, destinations: s.destinations.map((d, i) => i !== destinationIndex ? d : ({
                            ...d, orders: d.orders.map((o, j) => j !== orderIndex ? o : ({
                              ...o, [field]: field === "weightKg" ? Number(value) : field === "palletsEstimate" ? (value === "" ? null : Number(value)) : value,
                            })),
                          })) }));
                        };
                        return <tr key={orderIndex} className="border-b border-[var(--card-border)] last:border-b-0">
                          <td className="py-1 pr-2"><input aria-label="Delivery number" className={input} value={order.deliveryNumber} onChange={(e) => changeOrder("deliveryNumber", e.target.value)} /></td>
                          <td className="py-1 pr-2"><input aria-label="Order number" placeholder="Not provided" className={input} value={order.orderNumber} onChange={(e) => changeOrder("orderNumber", e.target.value)} /></td>
                          <td className="py-1 pr-2"><input aria-label="Collection point" className={input} value={order.collectFrom} onChange={(e) => changeOrder("collectFrom", e.target.value)} /></td>
                          <td className="py-1 pr-2"><input aria-label="Weight kilograms" type="number" min="0" step="any" className={input} value={order.weightKg} onChange={(e) => changeOrder("weightKg", e.target.value)} /></td>
                          <td className="py-1"><input aria-label="Estimated pallets" type="number" min="0" step="any" className={input} value={order.palletsEstimate ?? ""} onChange={(e) => changeOrder("palletsEstimate", e.target.value)} /></td>
                        </tr>;
                      })}</tbody>
                    </table>
                  </div>
                </div>)}
              </div>}
            </article>;
          })}
          <p className="text-[11px] text-[var(--nav-text-color)]">Original PDFs are archived in FleetCore Convex storage for each newly imported revision. Extraction happens locally in your browser before the confirmed upload.</p>
        </div>}
      </section>

      </div>
      <div ref={workspaceRef}>
        <GuidedShipmentWorkspace canManageRecords={canManageRecords} disabled={busy || saving || deleting || restoring} key={`${region}:${workspaceGeneration}`} rows={imported} fleet={fleet} token={token} region={region} selectedNumber={selectedNumber} onSelect={setSelectedNumber} drafts={assignmentDrafts} onDraftChange={(id, draft) => setAssignmentDrafts(previous => ({ ...previous, [id]: draft }))} savingId={assignmentSavingId} onAssign={saveAssignment} onHistory={setHistoryId} onDelete={row => { setDeleteError(""); setDeleteTarget(row); }} interaction={workspaceState} onInteractionChange={setWorkspaceState} />
      </div>
      <ConfirmDialog
        open={!!restoreTarget}
        title={`Restore shipment ${restoreTarget?.shipmentNumber ?? ""}?`}
        message="Restore the saved shipment, its original PDF history, and any assignment, planned main load and report entries removed with it. Saved amounts and driver instructions are kept. Loads that have since been changed, completed, locked or invoiced require administrator review. The PDF in this batch is checked separately before importing."
        confirmLabel="Restore shipment"
        loading={restoring}
        autoFocus
        onConfirm={() => void restoreShipment()}
        onCancel={() => { if (!restoring) { setRestoreTarget(null); setRestoreError(""); } }}
      >
        {restoreError && <p role="alert" className="text-sm text-[var(--danger-text)]">{restoreError}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete shipment ${deleteTarget?.shipmentNumber ?? ""}?`}
        message="This removes the shipment from web and mobile, its planned main load from Daily Planner, and its monthly and local report entries. PDFs and history are retained. Completed, locked or invoiced loads cannot be deleted. Driver and truck records are kept."
        confirmLabel="Delete shipment"
        variant="danger"
        loading={deleting}
        autoFocus
        onConfirm={() => void deleteShipment()}
        onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}
      >
        {deleteError && <p role="alert" className="text-sm text-[var(--danger-text)]">{deleteError}</p>}
      </ConfirmDialog>
      {historyId && <ModalShell open portal autoFocus onClose={() => setHistoryId(null)} className="max-w-5xl"><div className="max-h-[85dvh] overflow-y-auto"><ShipmentHistoryPanel token={token} region={region} shipmentId={historyId} onClose={() => setHistoryId(null)} /></div></ModalShell>}
    </div>
  </main>;
}

export default function CeramicTilesPage() {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(isMobileAppEnvironment());
    update(); mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (mobile === null) return <p role="status" className="p-4 text-sm">Loading Ceramic Tiles…</p>;
  return mobile ? <MobileCeramicTiles /> : <CeramicTilesDesktopPage />;
}
