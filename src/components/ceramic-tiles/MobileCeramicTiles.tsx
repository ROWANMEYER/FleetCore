"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Package, Search, Truck, UserRound } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ceramicAssignmentComplete, ceramicPalletLabel, ceramicVersionNeedsReview, mobileCeramicShipments, type MobileShipmentFilter } from "@/src/lib/ceramic-tiles/mobileDispatch";
import { CeramicDriverInstructions } from "./DriverInstructionsPanel";

type Region = "garden_route" | "eastern_cape";
type Fleet = { drivers: { id: string; name: string; phone: string | null }[]; trucks: { id: string; fleetNumber: string; registration?: string | null }[] };
const field = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm text-[var(--foreground)]";

function MobileShipmentDispatch({ shipment, fleet, token, region, onBack }: { shipment: Doc<"ceramicShipments">; fleet: Fleet; token: string; region: Region; onBack: () => void }) {
  const [driverId, setDriverId] = useState<string>(shipment.driverId ?? "");
  const [truckId, setTruckId] = useState<string>(shipment.truckId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const assign = useMutation(api.ceramicTiles.assign);
  const dirty = driverId !== (shipment.driverId ?? "") || truckId !== (shipment.truckId ?? "");
  const ready = ceramicAssignmentComplete(shipment) && !dirty;
  const save = async () => {
    if (!driverId || !truckId || saving) return;
    setSaving(true); setError("");
    try {
      await assign({ token, region, shipmentId: shipment._id, driverId: driverId as Id<"drivers">, truckId: truckId as Id<"trucks"> });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save assignment."); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4">
    <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0891B2]"><ArrowLeft size={18} />Shipments</button>
    <header><p className="text-xs font-semibold uppercase tracking-widest text-[#0891B2]">Ceramic Tiles · Version {shipment.version}</p><h1 className="mt-1 break-words text-2xl font-bold">{shipment.shipmentNumber}</h1><p className="mt-1 text-sm text-[var(--nav-text-color)]">{ceramicPalletLabel(shipment.snapshot)} · {shipment.snapshot.destinations.length} delivery stops</p></header>
    {ceramicVersionNeedsReview(shipment) && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-[var(--foreground)]">Shipment updated—review before sending. Check Version {shipment.version} quantities and stop order below.</p>}
    <section aria-label="Assign shipment" className="space-y-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <h2 className="text-base font-bold">1. Assign truck &amp; driver</h2>
      <label className="block text-xs font-semibold">Truck<select aria-label="Shipment truck" className={field} value={truckId} disabled={saving} onChange={event => setTruckId(event.target.value)}><option value="">Choose a truck</option>{fleet.trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.fleetNumber}{truck.registration ? ` · ${truck.registration}` : ""}</option>)}</select></label>
      <label className="block text-xs font-semibold">Driver<select aria-label="Shipment driver" className={field} value={driverId} disabled={saving} onChange={event => setDriverId(event.target.value)}><option value="">Choose a driver</option>{fleet.drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
      {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}
      <button type="button" onClick={() => void save()} disabled={!driverId || !truckId || !dirty || saving} className="min-h-11 w-full rounded-xl bg-[#0891B2] px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving assignment…" : dirty ? "Save assignment" : ready ? "Assignment saved" : "Save assignment"}</button>
      {!ready && <p className="text-xs text-[var(--nav-text-color)]">Choose both a truck and driver, then save to arrange stops and prepare WhatsApp instructions.</p>}
    </section>
    {ready && <section aria-label="Order and send shipment" className="space-y-2"><h2 className="text-base font-bold">2. Order stops &amp; send</h2><CeramicDriverInstructions key={`${shipment._id}:${shipment.version}:${shipment.driverId}:${shipment.truckId}`} shipment={shipment} token={token} region={region} drivers={fleet.drivers} trucks={fleet.trucks} onClose={onBack} requireVersionReview compact /></section>}
  </div>;
}

export function MobileCeramicTiles() {
  const { user, token } = useAuth();
  const isAdmin = user?.role === "admin";
  const region: Region = user?.role === "regional" ? (user.region ?? "garden_route") : "garden_route";
  const [filter, setFilter] = useState<MobileShipmentFilter>("unassigned");
  const [search, setSearch] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ownRegionRecords = useQuery(api.ceramicTiles.list, token ? { token, region } : "skip");
  const easternRecords = useQuery(api.ceramicTiles.list, token && isAdmin ? { token, region: "eastern_cape" } : "skip");
  // Each query retains the existing server-enforced scope; admins see both regions without a selector.
  const records = useMemo(() => ownRegionRecords === undefined || (isAdmin && easternRecords === undefined) ? undefined
    : isAdmin ? [...ownRegionRecords, ...(easternRecords ?? [])] : ownRegionRecords, [ownRegionRecords, easternRecords, isAdmin]);
  const fleet = useQuery(api.ceramicTiles.fleetChoices, token ? { token, region } : "skip");
  const visible = useMemo(() => mobileCeramicShipments(records ?? [], filter, search), [records, filter, search]);
  const drivers = new Map((fleet?.drivers ?? []).map(driver => [driver.id as string, driver.name]));
  const trucks = new Map((fleet?.trucks ?? []).map(truck => [truck.id as string, [truck.fleetNumber, truck.registration].filter(Boolean).join(" · ")]));
  const selected = records?.find(record => record._id === selectedId);
  useEffect(() => { pageRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [selectedId, selected?.version, region]);
  if (!user || !token) return <p className="p-4 text-sm">Sign in to view Ceramic Tiles shipments.</p>;
  return <main ref={pageRef} aria-label="Ceramic Tiles mobile workspace" className="h-full min-h-0 w-full min-w-0 shrink-0 overflow-y-auto overscroll-y-contain p-4 pb-8 text-[var(--foreground)]"><div className="mx-auto max-w-lg space-y-4">
    {selectedId ? records === undefined || !fleet ? <p role="status">Loading shipment…</p> : selected ? <MobileShipmentDispatch key={`${selected._id}:${selected.version}`} shipment={selected} fleet={fleet} token={token} region={selected.region} onBack={() => setSelectedId(null)} /> : <div><p>Shipment is no longer available in this region.</p><button type="button" className="mt-3 min-h-11 text-[#0891B2]" onClick={() => setSelectedId(null)}>Back to shipments</button></div> : <>
      <header><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-[#0891B2]"><Package size={14} />Mobile dispatch</div><h1 className="text-2xl font-bold">Ceramic Tiles</h1><p className="mt-1 text-sm text-[var(--nav-text-color)]">Choose a shipment imported on the web app.</p></header>
      <nav aria-label="Shipment assignment filter" className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1">{([['unassigned','Unassigned'],['assigned','Assigned'],['all','All']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${filter === value ? 'bg-[#0891B2] text-white' : 'text-[var(--nav-text-color)]'}`}>{label}</button>)}</nav>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3"><Search size={16} className="shrink-0 text-[var(--nav-text-color)]" /><input type="search" aria-label="Search shipment number" placeholder="Search shipment number" value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none" /></label>
      {records === undefined || !fleet ? <p role="status" className="py-6 text-center text-sm text-[var(--nav-text-color)]">Loading shipments…</p> : !visible.length ? <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-6 text-center"><Package className="mx-auto mb-2 text-[#0891B2]" /><h2 className="font-semibold">{search ? 'No matching shipments' : filter === 'unassigned' ? 'No unassigned shipments' : filter === 'assigned' ? 'No assigned shipments' : 'No imported shipments'}</h2><p className="mt-2 text-sm text-[var(--nav-text-color)]">{filter === 'unassigned' && records.length ? 'Choose Assigned or All to view existing assignments.' : 'Import shipment PDFs on the web app to see them here.'}</p></div> : <section aria-label="Imported shipment cards" className="space-y-3">{visible.map(record => <button type="button" key={record._id} aria-label={`Open shipment ${record.shipmentNumber}`} onClick={() => setSelectedId(record._id)} className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 text-left shadow-sm">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-base font-bold">{record.shipmentNumber}</h2><p className="mt-1 text-xs text-[var(--nav-text-color)]">Version {record.version} · {ceramicPalletLabel(record.snapshot)}</p></div><ChevronRight size={20} className="shrink-0 text-[#0891B2]" /></div>
        {ceramicVersionNeedsReview(record) && <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Shipment updated—review before sending</p>}
        <div className="mt-3 space-y-2 text-xs text-[var(--nav-text-color)]"><p className="flex items-center gap-2"><Truck size={14} className="shrink-0" /><span className="break-words">{record.truckId ? trucks.get(record.truckId) ?? 'Assigned truck unavailable' : 'Truck not assigned'}</span></p><p className="flex items-center gap-2"><UserRound size={14} className="shrink-0" /><span className="break-words">{record.driverId ? drivers.get(record.driverId) ?? 'Assigned driver unavailable' : 'Driver not assigned'}</span></p></div>
        <p className="mt-3 text-xs font-semibold text-[#0891B2]">{ceramicAssignmentComplete(record) ? 'Open dispatch instructions' : 'Assign truck & driver'}</p>
      </button>)}</section>}
    </>}
  </div></main>;
}
