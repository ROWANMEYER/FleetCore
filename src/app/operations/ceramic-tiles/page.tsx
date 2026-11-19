"use client";

import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, CheckCircle2, FileText, FolderUp, LoaderCircle, RefreshCw, Trash2, Truck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { parseCeramicShipmentText, type CeramicShipment } from "@/src/lib/ceramic-tiles/parser";
import { extractCeramicPdfText, hashCeramicPdf } from "@/src/lib/ceramic-tiles/pdfReader";

type Region = "garden_route" | "eastern_cape";
type Entry = {
  id: string;
  filename: string;
  hash: string;
  shipment?: CeramicShipment;
  error?: string;
  expanded: boolean;
};
type AssignDraft = { driverId: string; truckId: string };
const panel = "rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm";
const input = "w-full rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[#06B6D4]";
const secondaryButton = "rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-sunken)] disabled:opacity-50";
const primaryButton = "rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const formatNumber = (value: number | null) => value === null ? "—" : value.toLocaleString("en-ZA", { maximumFractionDigits: 3 });
const rowStatusLabel: Record<string, string> = {
  new: "New shipment",
  revision: "Newer revision",
  duplicate: "Already imported",
  older_version: "Older version",
  version_conflict: "Version conflict",
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

export default function CeramicTilesPage() {
  const { user, token } = useAuth();
  const [regionChoice, setRegionChoice] = useState<Region>("garden_route");
  const region: Region = user?.role === "regional" ? (user.region ?? "garden_route") : regionChoice;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignDraft>>({});
  const [assignmentSavingId, setAssignmentSavingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<Id<"ceramicShipments"> | null>(null);

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
  const commitBatch = useMutation(api.ceramicTiles.commitBatch);
  const assign = useMutation(api.ceramicTiles.assign);

  const updateShipment = useCallback((id: string, update: (shipment: CeramicShipment) => CeramicShipment) => {
    setEntries((prev) => prev.map((item) =>
      item.id === id && item.shipment ? { ...item, shipment: update(item.shipment) } : item
    ));
  }, []);

  const addFiles = useCallback(async (selection: FileList | File[]) => {
    const list = Array.from(selection);
    if (!list.length) return;
    setMessage("");
    setFailure("");
    if (entries.length + list.length > 25) {
      setFailure("You can review up to 25 PDFs per import batch. Remove some before adding more.");
      return;
    }
    setBusy(true);
    try {
      const batch: Entry[] = [];
      for (const file of list) {
        const entry: Entry = { id: crypto.randomUUID(), filename: file.name, hash: "", expanded: false };
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
  }, [entries.length]);

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
  const conflicts = ready.filter(({ shipment }) => statusByNumber.get(shipment.shipmentNumber.toUpperCase())?.status === "version_conflict");
  const duplicateNumbers = new Set<string>();
  const repeatedInBatch = ready.filter(({ shipment }) => {
    const key = shipment.shipmentNumber.toUpperCase();
    if (duplicateNumbers.has(key)) return true;
    duplicateNumbers.add(key);
    return false;
  });
  const canCommit = !!token && !busy && !saving && ready.length > 0 && comparison !== undefined &&
    conflicts.length === 0 && repeatedInBatch.length === 0;
  const importBatch = async () => {
    if (!token || !canCommit) return;
    setSaving(true);
    setFailure("");
    setMessage("");
    try {
      const outcome = await commitBatch({
        token, region,
        files: ready.map(({ filename, hash, shipment }) => ({ fileName: filename, fileHash: hash, snapshot: shipment })),
      });
      const created = outcome.filter((r) => r.status === "created").length;
      const revised = outcome.filter((r) => r.status === "revised").length;
      const skipped = outcome.length - created - revised;
      setMessage(`Import complete: ${created} new, ${revised} revised, ${skipped} already imported/older. Existing driver and truck assignments are retained on revisions.`);
      setEntries((prev) => prev.filter((item) => !item.shipment));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Import failed. No changes have been saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveAssignment = async (shipmentId: Id<"ceramicShipments">, existingDriver: string, existingTruck: string) => {
    if (!token) return;
    setFailure("");
    setAssignmentSavingId(shipmentId);
    const draft = assignmentDrafts[shipmentId] ?? { driverId: existingDriver, truckId: existingTruck };
    try {
      await assign({
        token, region, shipmentId,
        driverId: draft.driverId ? draft.driverId as Id<"drivers"> : null,
        truckId: draft.truckId ? draft.truckId as Id<"trucks"> : null,
      });
      setMessage("Assignment saved.");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Could not save assignment.");
    } finally {
      setAssignmentSavingId(null);
    }
  };

  if (!token || !user) {
    return <main className="p-6 text-sm text-[var(--nav-text-color)]">Sign in to use Ceramic Tiles.</main>;
  }

  return <main className="h-full overflow-y-auto p-4 lg:p-6 text-[var(--foreground)]">
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-[#0891B2]">Operations / Ceramic Tiles</p>
          <h1 className="text-2xl font-semibold tracking-tight">Ceramic Tiles Shipments</h1>
          <p className="mt-1 text-sm text-[var(--nav-text-color)]">Upload shipment plan PDFs, check destinations and orders, then import to FleetCore.</p>
        </div>
        {user.role === "admin" && <label className="flex items-center gap-2 text-xs font-medium">
          Region
          <select aria-label="Ceramic Tiles region" className={input} value={regionChoice} onChange={(event) => { setRegionChoice(event.target.value as Region); setHistoryId(null); setEntries([]); }}>
            <option value="garden_route">Garden Route</option>
            <option value="eastern_cape">Eastern Cape</option>
          </select>
        </label>}
      </header>

      {failure && <div role="alert" className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-surface)] p-3 text-sm text-[var(--danger-text)]">{failure}</div>}
      {message && <div role="status" className="rounded-lg border border-[var(--success-border)] bg-[var(--success-surface)] p-3 text-sm text-[var(--success-text)]">{message}</div>}

      <section className={`${panel} p-4`} aria-label="Upload shipment PDFs">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Bulk import</h2>
            <p className="mt-0.5 text-xs text-[var(--nav-text-color)]">Up to 25 PDFs at a time. Documents are read on your device; scanned PDFs cannot be extracted yet.</p>
          </div>
          {entries.length > 0 && <button type="button" onClick={() => { setEntries([]); setFailure(""); }} className={secondaryButton}>Clear batch</button>}
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
            <input type="file" accept=".pdf,application/pdf" multiple onChange={onSelectFiles} disabled={busy || saving} className="sr-only" aria-label="Choose Ceramic Tiles PDFs" />
          </label>
          {busy && <p role="status" className="mt-3 flex items-center justify-center gap-2 text-xs"><LoaderCircle className="h-4 w-4 animate-spin" />Reading PDFs and extracting shipment details...</p>}
        </div>

        {entries.length > 0 && <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--nav-text-color)]">Review batch · {entries.length} file(s)</h3>
            <button disabled={!canCommit} type="button" className={primaryButton} onClick={() => void importBatch()}>
              {saving ? "Importing..." : `Confirm & import ${ready.length} shipment(s)`}
            </button>
          </div>
          {repeatedInBatch.length > 0 && <p className="text-xs text-[var(--danger-text)]">The same shipment number appears more than once in this batch. Remove one PDF first.</p>}
          {entries.map((entry) => {
            const shipment = entry.shipment;
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
                {shipment?.warnings.length ? <span title={shipment.warnings.join("\n")} className="inline-flex items-center gap-1 text-xs text-[var(--warning-text)]"><AlertTriangle className="h-4 w-4" />{shipment.warnings.length} flags</span> : shipment && <CheckCircle2 className="h-4 w-4 text-[var(--success-text)]" />}
                {shipment && <button type="button" className={secondaryButton} onClick={() => setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, expanded: !e.expanded } : e))}>
                  {entry.expanded ? "Hide details" : "Review / edit"}
                </button>}
                <button type="button" aria-label={`Remove ${entry.filename}`} title="Remove from batch" onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))} className="rounded-md p-2 text-[var(--nav-text-color)] hover:text-[var(--danger-text)]"><Trash2 className="h-4 w-4" /></button>
              </div>
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
                      <thead className="border-b border-[var(--card-border)] text-[var(--nav-text-color)]"><tr><th className="pb-2">Delivery</th><th className="pb-2">Order number</th><th className="pb-2">Collect from</th><th className="pb-2">Weight (kg)</th><th className="pb-2">Pallets</th></tr></thead>
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
                          <td className="py-1 pr-2"><input aria-label="Order number" className={input} value={order.orderNumber} onChange={(e) => changeOrder("orderNumber", e.target.value)} /></td>
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
          <p className="text-[11px] text-[var(--nav-text-color)]">Import saves structured shipment data and the document fingerprint. Original PDF files are not yet archived in FleetCore; retain your Outlook attachments until document storage is added.</p>
        </div>}
      </section>

      <section className={`${panel} overflow-hidden`} aria-label="Imported Ceramic Tiles shipments">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--card-border)] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Imported shipments</h2>
            <p className="text-xs text-[var(--nav-text-color)]">Latest version of each shipment, with the existing truck and driver records.</p>
          </div>
          <span className="text-xs text-[var(--nav-text-color)]">{imported ? `${imported.length} shipments` : "Loading..."}</span>
        </div>
        {!imported ? <div className="p-6 text-sm text-[var(--nav-text-color)]"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />Loading shipments...</div>
          : imported.length === 0 ? <div className="p-8 text-center text-sm text-[var(--nav-text-color)]">No Ceramic Tiles shipments imported for this region yet.</div>
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-[var(--table-row-header)] text-[var(--nav-text-color)]"><tr>
                <th className="px-4 py-2">Shipment</th><th className="px-3 py-2">Dates</th><th className="px-3 py-2">Deliveries</th><th className="px-3 py-2">Weight / pallets</th><th className="px-3 py-2">Driver</th><th className="px-3 py-2">Truck</th><th className="px-3 py-2">Action</th>
              </tr></thead>
              <tbody>{imported.map((row) => {
                const current = assignmentDrafts[row._id] ?? { driverId: row.driverId ?? "", truckId: row.truckId ?? "" };
                const deliveryCount = row.snapshot.destinations.reduce((count, destination) => count + destination.orders.length, 0);
                return <tr key={row._id} className="border-t border-[var(--card-border)] align-middle">
                  <td className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-[#0891B2]" />{row.shipmentNumber}</span><span className="ml-2 text-[10px] font-normal text-[var(--nav-text-color)]">v{row.version}</span></td>
                  <td className="px-3 py-3 text-[var(--nav-text-color)]">{row.snapshot.plannedLoadingDate ?? "—"} to {row.snapshot.plannedDeliveryDate ?? "—"}</td>
                  <td className="px-3 py-3">{deliveryCount} · {row.snapshot.destinations.length} stops</td>
                  <td className="px-3 py-3">{formatNumber(row.snapshot.totalWeightKg)} kg · {formatNumber(row.snapshot.totalPallets)} PAL</td>
                  <td className="px-3 py-3"><select aria-label={`Driver for ${row.shipmentNumber}`} className={input} value={current.driverId} onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [row._id]: { ...current, driverId: e.target.value } }))}>
                    <option value="">Not assigned</option>
                    {(fleet?.drivers ?? []).map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}
                  </select></td>
                  <td className="px-3 py-3"><select aria-label={`Truck for ${row.shipmentNumber}`} className={input} value={current.truckId} onChange={(e) => setAssignmentDrafts((prev) => ({ ...prev, [row._id]: { ...current, truckId: e.target.value } }))}>
                    <option value="">Not assigned</option>
                    {(fleet?.trucks ?? []).map((truck) => <option value={truck.id} key={truck.id}>{truck.fleetNumber}</option>)}
                  </select></td>
                  <td className="px-3 py-3"><div className="flex gap-2"><button type="button" className={secondaryButton} disabled={assignmentSavingId === row._id || !fleet} onClick={() => void saveAssignment(row._id, row.driverId ?? "", row.truckId ?? "")}>{assignmentSavingId === row._id ? "Saving..." : "Save"}</button><button type="button" className={secondaryButton} onClick={() => setHistoryId(row._id)}>Details / history</button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
      </section>
      {historyId && <ShipmentHistoryPanel token={token} region={region} shipmentId={historyId} onClose={() => setHistoryId(null)} />}
    </div>
  </main>;
}
