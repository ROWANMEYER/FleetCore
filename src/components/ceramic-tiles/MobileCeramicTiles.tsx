"use client";

import { getUserRegions } from "@/src/lib/regions";

import styles from "./CeramicMobile.module.css";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CeramicShipmentQueue } from "./CeramicShipmentQueue";
import { CeramicDispatchHeader } from "./CeramicDispatchHeader";
import { MobileShipmentWizard } from "./MobileShipmentWizard";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { ceramicErrorMessage } from "@/src/lib/ceramic-tiles/assignmentAccess";
import type { CeramicDispatchShipment, MobileShipmentFilter } from "@/src/lib/ceramic-tiles/mobileDispatch";

export function MobileCeramicTiles() {
  const { user, token } = useAuth();
  const canViewReports = user?.role === "admin" || getUserRegions(user).includes("transvaal");
  const [filter, setFilter] = useState<MobileShipmentFilter>("unassigned");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CeramicDispatchShipment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [message, setMessage] = useState("");
  const removeShipment = useMutation(api.ceramicTiles.remove);
  const pageRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const records = useQuery(api.ceramicTilesMobile.list, {});
  const fleet = useQuery(api.ceramicTilesMobile.fleetChoices, {});
  const selected = records?.find(record => record._id === selectedId);
  const deleteShipment = async () => {
    if (!token || !deleteTarget || deleting) return;
    setDeleting(true); setDeleteError("");
    try {
      await removeShipment({ token, region: deleteTarget.region, shipmentId: deleteTarget._id, expectedVersion: deleteTarget.version, expectedUpdatedAt: deleteTarget.updatedAt });
      setMessage(`Shipment ${deleteTarget.shipmentNumber} deleted.`);
      if (selectedId === deleteTarget._id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(ceramicErrorMessage(error, "Could not delete shipment. Please try again."));
    } finally { setDeleting(false); }
  };
  useEffect(() => { pageRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [selectedId, selected?.version]);
  return <main ref={pageRef} aria-label="Ceramic Tiles mobile workspace" className={`${styles.workspace} ${selectedId ? styles.selected : styles.list}`}><div className={`${styles.container} ${selectedId ? "" : styles.listStack}`}>
    {selectedId ? records === undefined || !fleet ? <p role="status" className={styles.loading}>Loading shipment…</p> : selected ? <MobileShipmentWizard key={`${selected._id}:${selected.version}`} shipment={selected} fleet={fleet} onBack={() => setSelectedId(null)} /> : <div className={styles.empty}><p>Shipment is no longer available.</p><button type="button" className={`${styles.secondary} mt-3`} onClick={() => setSelectedId(null)}>Back to shipments</button></div> : <>
      <CeramicDispatchHeader />
      {message && <p role="status" className={styles.success}>{message}</p>}
      <CeramicShipmentQueue rows={records} fleet={fleet} filter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} onSelect={row => setSelectedId(row._id)} canViewReports={canViewReports} onDelete={canViewReports && token ? row => { setDeleteError(""); setDeleteTarget(row); } : undefined} />
    </>}
  </div>
    <ConfirmDialog open={!!deleteTarget} title={`Delete shipment ${deleteTarget?.shipmentNumber ?? ""}?`} message="This removes the shipment from web and mobile, its planned main load from Daily Planner, and its monthly and local report entries. PDFs and history are retained. Completed, locked or invoiced loads cannot be deleted. Driver and truck records are kept." confirmLabel="Delete shipment" variant="danger" loading={deleting} autoFocus onConfirm={() => void deleteShipment()} onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}>
      {deleteError && <p role="alert" className={styles.error}>{deleteError}</p>}
    </ConfirmDialog>
  </main>;
}
