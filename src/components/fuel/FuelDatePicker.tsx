"use client";

import { useEffect, useRef } from "react";
import { CalendarDays, Check, X } from "lucide-react";
import type { DatedFuelPrice } from "@/src/lib/fuel/compareDates";
import { formatLongDay, formatRand } from "@/src/lib/fuel/display";
import css from "./fuelDatePicker.module.css";

export function FuelDatePicker({ label, dates, selected, onSelect, onClose }: {
  label: string; dates: DatedFuelPrice[]; selected: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className={css.dialog} aria-labelledby="recorded-date-title" onCancel={onClose}>
    <header className={css.header}><span className={css.icon}><CalendarDays size={22} /></span>
      <div><h2 id="recorded-date-title">Choose a fuel date</h2><p>{label}</p></div>
      <button type="button" aria-label="Close date picker" onClick={onClose} className={css.close}><X size={20} /></button>
    </header>
    <p className={css.hint}>Recorded prices · {dates.length} dates</p>
    <div className={css.list}>{dates.map((date) => <button type="button" key={date._id}
      className={css.option} aria-pressed={date._id === selected} autoFocus={date._id === selected}
      onClick={() => { onSelect(date._id); onClose(); }}>
      <CalendarDays size={19} className={css.calendar} />
      <span><strong>{formatLongDay(date.effectiveDate)}</strong><small>{formatRand(date.pricePerLitre)} per litre</small></span>
      {date._id === selected && <Check className={css.check} size={20} />}
    </button>)}</div>
  </dialog>;
}
