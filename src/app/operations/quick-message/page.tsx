"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { Copy, Send, RotateCcw, UserRound, Truck, Container, ChevronRight, ChevronDown, Check, X, Search, FileText, Palette, CircleCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useToast } from "@/src/components/common/Toast";
import { useCachedValue } from "@/src/lib/offline/useCachedValue";
import { useOnlineStatus } from "@/src/lib/offline/useOnline";
import { buildQuickMessage, isoWeek, weekProblem } from "@/src/lib/quicksend/message";

import { QUICK_SEND_STYLES, useQuickSendStyle } from "@/src/lib/quicksend/useQuickSendStyle";
import css from "./quick-message.module.css";

type Choice = { id: string; title: string; detail: string; search: string };
type Selector = "Driver" | "Truck" | "Trailer";

function FleetPicker({ kind, choices, selected, onSelect, onClose }: {
  kind: Selector; choices: Choice[]; selected: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const filtered = choices.filter((choice) => choice.search.toLowerCase().includes(search.trim().toLowerCase()));
  return <dialog ref={dialog} className={css.picker} aria-labelledby="fleet-picker-title" onCancel={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={css.pickerHeader}><h2 id="fleet-picker-title">Select {kind.toLowerCase()}</h2>
      <button type="button" className={css.iconButton} aria-label="Close selection" onClick={onClose}><X size={20} /></button></div>
    <label className={css.search}><Search size={18} /><input autoFocus aria-label={`Search ${kind.toLowerCase()}s`}
      placeholder={`Search ${kind.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    <p className={css.resultCount}>{filtered.length} available</p>
    <div className={css.options}>{filtered.map((choice) => <button type="button" key={choice.id}
      className={css.option} aria-pressed={choice.id === selected} onClick={() => { onSelect(choice.id); onClose(); }}>
      <span><strong>{choice.title}</strong><small>{choice.detail}</small></span>{choice.id === selected ? <Check size={20} /> : <ChevronRight size={18} />}
    </button>)}{filtered.length === 0 && <p className={css.empty}>No matching {kind.toLowerCase()}s. Try another search.</p>}</div>
  </dialog>;
}

export default function QuickMessagePage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const online = useOnlineStatus();
  const driversLive = useQuery(api.fleet.getDrivers, {});
  const trucksLive = useQuery(api.fleet.getTrucks, {});
  const trailersLive = useQuery(api.trailers.list, {});
  const cacheKey = `quick-message:${user?._id ?? "guest"}`;
  const drivers = useCachedValue(`${cacheKey}:drivers`, driversLive, !online);
  const trucks = useCachedValue(`${cacheKey}:trucks`, trucksLive, !online);
  const trailers = useCachedValue(`${cacheKey}:trailers`, trailersLive, !online);
  const [driverId, setDriverId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [template, setTemplate] = useState<"standard" | "week">("standard");
  const [week, setWeek] = useState(() => String(isoWeek(new Date())));
  const [location, setLocation] = useState("Gabarone");
  const [shunter, setShunter] = useState(false);
  const [loadNumber, setLoadNumber] = useState("");
  const [totalLoads, setTotalLoads] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [style, setStyle] = useQuickSendStyle();
  const [picker, setPicker] = useState<Selector | null>(null);
  const [step, setStep] = useState(0);

  const activeDrivers = (drivers ?? []).filter((d) => !d.status || d.status.toLowerCase() === "active");
  const activeTrucks = trucks ?? [];
  const activeTrailers = (trailers ?? []).filter((t) => t.status !== "inactive" && !t.subcontractorId);
  const driver = activeDrivers.find((d) => d._id === driverId);
  const truck = activeTrucks.find((t) => t._id === truckId);
  const trailer = activeTrailers.find((t) => t._id === trailerId);
  const loading = drivers === undefined || trucks === undefined || trailers === undefined;
  const error = template === "week" ? weekProblem(week, loadNumber, totalLoads) : "";
  const ready = Boolean(driver && truck && trailer && !error);
  const message = driver && truck && trailer ? buildQuickMessage({
    template, driver: { name: driver.driverName ?? "", idNumber: driver.idNumber, phone: driver.phone },
    truck: { fleetNo: truck.truckFleetNo ?? "", registration: truck.registration },
    trailer: { fleetNo: trailer.trailerFleetNoStr, trailers: trailer.trailers },
    week, location, shunter, loadNumber, totalLoads, eta, notes,
  }) : "";
  const fleetReady = Boolean(driver && truck && trailer);
  const copyMessage = async () => {
    if (!ready) return;
    try { await navigator.clipboard.writeText(message); addToast("Message copied", "success"); }
    catch { addToast("Copy was unavailable. Select and copy the preview below.", "error"); }
  };
  const clearSelections = () => {
    setDriverId(""); setTruckId(""); setTrailerId(""); setStep(0);
  };
  const choices: Record<Selector, Choice[]> = {
    Driver: activeDrivers.map((d) => ({ id: d._id, title: d.driverName || "Unnamed driver", detail: [d.phone, d.idNumber ? `ID: ${d.idNumber}` : ""].filter(Boolean).join(" · "), search: [d.driverName, d.phone, d.idNumber].join(" ") })),
    Truck: activeTrucks.map((t) => ({ id: t._id, title: t.truckFleetNo || "Unnamed truck", detail: [t.registration, t.make, t.model].filter(Boolean).join(" · "), search: [t.truckFleetNo, t.registration, t.make, t.model].join(" ") })),
    Trailer: activeTrailers.map((t) => ({ id: t._id, title: t.trailerFleetNoStr, detail: [t.type, ...t.trailers.map((part) => `${part.length}: ${part.registration}`)].join(" · "), search: [t.trailerFleetNoStr, t.type, ...t.trailers.map((part) => part.registration)].join(" ") })),
  };
  const selections = [
    { kind: "Driver" as const, icon: UserRound, id: driverId, title: driver?.driverName, detail: driver ? [driver.phone, driver.idNumber ? `ID: ${driver.idNumber}` : ""].filter(Boolean).join(" · ") : "Choose a driver from your fleet" },
    { kind: "Truck" as const, icon: Truck, id: truckId, title: truck?.truckFleetNo, detail: truck ? [truck.registration, truck.make].filter(Boolean).join(" · ") : "Choose your assigned truck" },
    { kind: "Trailer" as const, icon: Container, id: trailerId, title: trailer?.trailerFleetNoStr, detail: trailer ? trailer.trailers.map((part) => `${part.length}: ${part.registration}`).join(" · ") : "Choose the attached trailer" },
  ];
  const fleetSection = <section className={css.fleet} aria-label="Fleet selections">
    {selections.map(({ kind, icon: Icon, title, detail }) => <button type="button" key={kind} className={css.card}
      aria-label={`${kind}: ${title || `Select ${kind.toLowerCase()}`}`} onClick={() => setPicker(kind)}>
      <span className={css.cardIcon}><Icon size={24} strokeWidth={1.8} /></span>
      <span className={css.cardText}><small>{kind}</small><strong>{title || `Select ${kind.toLowerCase()}`}</strong><span>{detail || "No details recorded"}</span></span>
      {style === "guided" && title ? <CircleCheck className={css.cardCheck} size={20} /> : <ChevronRight className={css.chevron} size={18} />}
    </button>)}
  </section>;
  const templateSection = <div className={css.templates} role="group" aria-label="Message template">
    <button type="button" aria-pressed={template === "standard"} onClick={() => setTemplate("standard")}>Standard Format</button>
    <button type="button" aria-pressed={template === "week"} onClick={() => setTemplate("week")}>Week Format</button>
  </div>;
  const weekSection = template === "week" && <section className={css.weekFields} aria-label="Week details">
    <label>Week<input type="number" min="1" max="53" value={week} onChange={(e) => setWeek(e.target.value)} /></label>
    <label>Location<select value={location} onChange={(e) => setLocation(e.target.value)}><option>Gabarone</option><option>Lesotho</option></select></label>
    <label>Load number<input type="number" min="1" value={loadNumber} onChange={(e) => setLoadNumber(e.target.value)} /></label>
    <label>Total loads<input type="number" min="1" value={totalLoads} onChange={(e) => setTotalLoads(e.target.value)} /></label>
    <label className={css.shunter}><input type="checkbox" checked={shunter} onChange={(e) => setShunter(e.target.checked)} />Shunter</label>
    <label>ETA<input value={eta} onChange={(e) => setEta(e.target.value)} placeholder="Optional ETA" /></label>
    {error && <p className={css.error} role="status">{error}</p>}
  </section>;
  const notesSection = <details className={css.notes}>
    <summary><FileText size={18} /><span>Notes <small>(optional)</small></span><ChevronDown size={16} /></summary>
    <label className={css.notesBody}><span className={css.srOnly}>Notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note to include in the message" /></label>
    {notes && <p className={css.notesSummary}>{notes}</p>}
  </details>;
  const previewSection = <section className={css.preview} aria-label="Message preview">
    <div className={css.sectionTitle}><h2><FileText size={18} />Message preview</h2><span>{ready ? "Ready to share" : "Draft"}</span></div>
    <textarea aria-label="Message preview" readOnly rows={template === "week" ? 18 : 10} value={message}
      placeholder="Your message will appear here once you select a driver, truck and trailer." />
  </section>;
  const actionSection = <div className={css.actions}>
    <button type="button" className={css.copy} disabled={!ready} onClick={copyMessage}><Copy size={18} />Copy message</button>
    {ready ? <a className={css.whatsapp} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><Send size={18} />WhatsApp</a>
      : <button type="button" className={css.whatsapp} disabled><Send size={18} />WhatsApp</button>}
    <button type="button" className={css.clear} onClick={clearSelections}><RotateCcw size={15} />Clear selections</button>
  </div>;

  return <div className={css.page} data-style={style}>
    <div className={css.content}>
      <div className={css.stylePicker}><Palette size={17} /><label htmlFor="quick-send-style">Style</label>
        <select id="quick-send-style" value={style} onChange={(event) => {
          const next = QUICK_SEND_STYLES.find((option) => option.id === event.target.value);
          if (next) setStyle(next.id);
        }}>{QUICK_SEND_STYLES.map((option, index) => <option key={option.id} value={option.id}>{index + 1} · {option.label}</option>)}</select>
      </div>
      <header className={css.header}><div className={css.heading}><Send size={28} /><h1>QuickSend</h1><span className={css.live} data-online={online}>{online ? "Live" : "Offline"}</span></div>
        <p>Fleet details. Ready to share.</p></header>
      {!online && <p className={css.notice} role="status">Using the last fleet details saved on this device. Connect to refresh.</p>}
      {loading && <p className={css.notice} role="status">{online ? "Loading fleet details…" : "Open QuickSend while connected to save your fleet list first."}</p>}
      {style === "guided" ? <>
        <nav className={css.steps} aria-label="QuickSend steps">{["Fleet", "Message", "Share"].map((label, index) => <button type="button" key={label}
          aria-current={step === index ? "step" : undefined} disabled={index > 0 && !fleetReady || index === 2 && !ready}
          onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
        {step === 0 && <>{fleetSection}<button type="button" className={css.next} disabled={!fleetReady} onClick={() => setStep(1)}>Continue to message<ChevronRight size={18} /></button></>}
        {step === 1 && <>{templateSection}{weekSection}{notesSection}{previewSection}<div className={css.stepActions}><button type="button" onClick={() => setStep(0)}>Back to fleet</button><button type="button" className={css.next} disabled={!ready} onClick={() => setStep(2)}>Continue to share<ChevronRight size={18} /></button></div></>}
        {step === 2 && <>{previewSection}{actionSection}<button type="button" className={css.back} onClick={() => setStep(1)}>Back to message</button></>}
      </> : <>{templateSection}{fleetSection}{style === "message" ? <>{previewSection}{weekSection}{notesSection}</> : <>{weekSection}{notesSection}{previewSection}</>}{actionSection}</>}
      <p className={css.preference}>Style saved on this device · Your selections stay when switching styles</p>
    </div>
    {picker && <FleetPicker key={picker} kind={picker} choices={choices[picker]} selected={picker === "Driver" ? driverId : picker === "Truck" ? truckId : trailerId}
      onClose={() => setPicker(null)} onSelect={picker === "Driver" ? setDriverId : picker === "Truck" ? setTruckId : setTrailerId} />}
  </div>;
}
