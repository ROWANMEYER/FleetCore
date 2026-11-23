"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "./CeramicMobile.module.css";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Package, Search, Table2, Truck, UserRound } from "lucide-react";
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
  return <main ref={pageRef} aria-label="Ceramic Tiles mobile workspace" className={`${styles.workspace} ${selectedId ? styles.selected : styles.list}`}><div className={`${styles.container} ${selectedId ? "" : styles.listStack}`}>
    {selectedId ? records === undefined || !fleet ? <p role="status" className={styles.loading}>Loading shipment…</p> : selected ? <MobileShipmentWizard key={`${selected._id}:${selected.version}`} shipment={selected} fleet={fleet} onBack={() => setSelectedId(null)} /> : <div className={styles.empty}><p>Shipment is no longer available.</p><button type="button" className={`${styles.secondary} mt-3`} onClick={() => setSelectedId(null)}>Back to shipments</button></div> : <>
      <header className={styles.listHero}>
        <p className={styles.eyebrow}><Package size={15} />Mobile dispatch</p>
        <h1 className={styles.listTitle}>Ceramic Tiles</h1>
        <p className={styles.heroCopy}>Choose a shipment, assign the load and prepare the driver instructions.</p>
        <Image className={styles.heroTruck} src="/images/ceramic-mobile/v1/dispatch-truck.png" alt="" width={1774} height={887} sizes="132px" />
      </header>
      {user && <Link href="/operations/ceramic-tiles/reports" className={styles.reportLink}><Table2 size={19} />Monthly &amp; local-load spreadsheets<ChevronRight size={18} /></Link>}
      <nav aria-label="Shipment assignment filter" className={styles.filters}>{([['unassigned','Unassigned'],['assigned','Assigned'],['all','All']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</nav>
      <label className={styles.search}><Search size={19} className="shrink-0" /><input type="search" aria-label="Search shipment number" placeholder="Search shipment number" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {records === undefined || !fleet ? <p role="status" className={styles.loading}>Loading shipments…</p> : !visible.length ? <div className={styles.empty}><Package size={27} /><h2>{search ? 'No matching shipments' : filter === 'unassigned' ? 'No unassigned shipments' : filter === 'assigned' ? 'No assigned shipments' : 'No imported shipments'}</h2><p>{filter === 'unassigned' && records.length ? 'Choose Assigned or All to view existing assignments.' : 'Import shipment PDFs on the web app to see them here.'}</p></div> : <section aria-label="Imported shipment cards" className={styles.cards}>{visible.map(record => <button type="button" key={record._id} aria-label={`Open shipment ${record.shipmentNumber}`} onClick={() => setSelectedId(record._id)} className={styles.shipmentCard}>
        <div className={styles.cardHeading}><div className="min-w-0"><h2>{record.shipmentNumber}</h2><p className={styles.cardMeta}>Version {record.version} · {ceramicPalletLabel(record.snapshot)}<br />{record.snapshot.destinations.length} delivery stops</p></div><ChevronRight size={22} /></div>
        {ceramicVersionNeedsReview(record) && <p className={`${styles.notice} mt-3 mb-0`}>Shipment updated—review before sending</p>}
        <div className={styles.fleetSummary}><p><Truck size={16} /><span>{record.truckId ? trucks.get(record.truckId) ?? 'Assigned truck unavailable' : 'Truck not assigned'}</span></p><p><UserRound size={16} /><span>{record.driverId ? drivers.get(record.driverId) ?? 'Assigned driver unavailable' : 'Driver not assigned'}</span></p></div>
        <p className={styles.cardAction}>{ceramicAssignmentComplete(record) ? 'Open dispatch instructions' : 'Assign truck & driver'}<ChevronRight size={16} /></p>
      </button>)}</section>}
    </>}
  </div></main>;
}
