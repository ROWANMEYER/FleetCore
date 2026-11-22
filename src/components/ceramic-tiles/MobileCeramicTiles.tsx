"use client";

import Link from "next/link";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Package, Search, Truck, UserRound } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ceramicAssignmentComplete, ceramicPalletLabel, ceramicVersionNeedsReview, mobileCeramicShipments, type MobileShipmentFilter } from "@/src/lib/ceramic-tiles/mobileDispatch";
import { MobileShipmentWizard } from "./MobileShipmentWizard";

export function MobileCeramicTiles() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<MobileShipmentFilter>("unassigned");
  const [search, setSearch] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const records = useQuery(api.ceramicTilesMobile.list, {});
  const fleet = useQuery(api.ceramicTilesMobile.fleetChoices, {});
  const visible = useMemo(() => mobileCeramicShipments(records ?? [], filter, search), [records, filter, search]);
  const drivers = new Map((fleet?.drivers ?? []).map(driver => [driver.id as string, driver.name]));
  const trucks = new Map((fleet?.trucks ?? []).map(truck => [truck.id as string, [truck.fleetNumber, truck.registration].filter(Boolean).join(" · ")]));
  const selected = records?.find(record => record._id === selectedId);
  useEffect(() => { pageRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [selectedId, selected?.version]);
  return <main ref={pageRef} aria-label="Ceramic Tiles mobile workspace" className={`h-full min-h-0 w-full min-w-0 shrink-0 text-[var(--foreground)] ${selectedId ? "overflow-hidden" : "overflow-y-auto overscroll-y-contain p-4 pb-8"}`}><div className={`mx-auto w-full max-w-lg ${selectedId ? "h-full min-h-0" : "space-y-4"}`}>
    {selectedId ? records === undefined || !fleet ? <p role="status">Loading shipment…</p> : selected ? <MobileShipmentWizard key={`${selected._id}:${selected.version}`} shipment={selected} fleet={fleet} onBack={() => setSelectedId(null)} /> : <div><p>Shipment is no longer available.</p><button type="button" className="mt-3 min-h-11 text-[#0891B2]" onClick={() => setSelectedId(null)}>Back to shipments</button></div> : <>
      <header><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-[#0891B2]"><Package size={14} />Mobile dispatch</div><h1 className="text-2xl font-bold">Ceramic Tiles</h1><p className="mt-1 text-sm text-[var(--nav-text-color)]">Choose a shipment imported on the web app.</p></header>
      {user && <Link href="/operations/ceramic-tiles/reports" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--card-border)] px-3 text-sm font-semibold text-[#0891B2]">Monthly &amp; local-load spreadsheets</Link>}
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
