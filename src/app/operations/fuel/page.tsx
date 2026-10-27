"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { Fuel, CalendarDays, ArrowRightLeft, ChevronDown } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { compareFuelDates, defaultFuelDates } from "@/src/lib/fuel/compareDates";
import { compositionProblem, compositionValue, estimatedRateImpact } from "@/src/lib/fuel/compare";
import { DASH, formatLongDay, formatPercent, formatRand, formatSignedPercent, formatSignedRand, movementArrow, movementWord } from "@/src/lib/fuel/display";
import css from "./comparison.module.css";
import { FuelDatePicker } from "@/src/components/fuel/FuelDatePicker";

function Result({ value, format }: { value: number | null; format: (value: number) => string }) {
  return <span data-direction={value === null || value === 0 ? "flat" : value > 0 ? "up" : "down"}>
    {value === null ? DASH : <><span aria-hidden="true">{movementArrow(value)} </span><span className="sr-only">{movementWord(value)} </span>{format(value)}</>}
  </span>;
}

export default function FuelComparisonPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const rows = useQuery(api.fuelPrices.list, {});
  const [chosenFrom, setChosenFrom] = useState<string | null>(null);
  const [chosenTo, setChosenTo] = useState<string | null>(null);
  const [compositionOverride, setCompositionOverride] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState<"from" | "to" | null>(null);
  const records = rows ?? [];
  const defaults = defaultFuelDates(records);
  const fromId = chosenFrom ?? defaults.from;
  const toId = chosenTo ?? defaults.to;
  const result = compareFuelDates(records, fromId, toId);
  const compositionText = compositionOverride ?? (result.comparison?.compositionPercent?.toString() ?? "");
  const compositionError = compositionProblem(compositionText);
  const percent = compositionValue(compositionText);
  const impact = percent === null ? null : estimatedRateImpact(result.dieselPercentChange, percent);
  const dates = [...records].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  if (rows === undefined) return <div className={css.screen}><p role="status" className={css.status}>Loading recorded fuel dates…</p></div>;
  if (!records.length) return <div className={css.screen}><div className={css.status}><Fuel size={30} /><h1>No recorded fuel prices</h1><p>Add at least one price to start comparing.</p>{admin && <Link href="/operations/fuel/manage">Manage fuel prices</Link>}</div></div>;

  return <div className={css.screen}><main className={css.content} aria-label="Fuel date comparison">
    <header className={css.header}><span className={css.icon}><Fuel size={24} /></span><div><h1>Fuel comparison</h1><p>Choose two recorded fuel dates</p></div>{admin && <Link className={css.manage} href="/operations/fuel/manage">Manage prices</Link>}</header>
    <section className={css.dateCard} aria-label="Choose recorded prices">
      <h2>Compare fuel prices</h2>
      {([
        { key: "from", label: "From · baseline", row: result.baseline },
        { key: "to", label: "To · comparison", row: result.comparison },
      ] as const).map(({ key, label, row }, index) => <div key={key} className={css.dateGroup}>
        {index === 1 && <button type="button" className={css.swap} aria-label="Swap selected fuel dates" onClick={() => { setChosenFrom(toId); setChosenTo(fromId); setCompositionOverride(null); }}><ArrowRightLeft size={20} /></button>}
        <button type="button" id={`fuel-${key}`} className={css.dateOption} data-comparison={key === "to"}
          aria-label={`${label}: ${row ? formatLongDay(row.effectiveDate) : "Choose a recorded date"}`} aria-haspopup="dialog" aria-expanded={datePicker === key} onClick={() => setDatePicker(key)}>
          <CalendarDays className={css.calendarIcon} size={24} />
          <span className={css.dateText}><span>{label}</span><strong className={css.dateValue}>{row ? formatLongDay(row.effectiveDate) : "Choose a recorded date"}</strong><small>{row ? `${formatRand(row.pricePerLitre)} per litre` : "Selected record is unavailable"}</small></span>
          <ChevronDown size={18} className={css.calendarIcon} />
        </button>
      </div>)}
    </section>
    <section className={css.metrics} aria-label="Fuel price difference">
      <div><h2>Rand difference</h2><strong><Result value={result.randDifference} format={formatSignedRand} /></strong></div>
      <div><h2>Diesel change</h2><strong><Result value={result.dieselPercentChange} format={formatSignedPercent} /></strong></div>
    </section>
    <section className={css.composition}><div><label htmlFor="fuel-composition">Fuel composition</label><p>Share of your rate affected by diesel</p></div>
      <div className={css.percent}><input id="fuel-composition" inputMode="decimal" type="text" value={compositionText} placeholder="Enter %" aria-invalid={compositionError !== null} aria-describedby={compositionError ? "fuel-composition-error" : undefined} onChange={(e) => setCompositionOverride(e.target.value)} /><span>%</span></div>
      {compositionError && <p id="fuel-composition-error" className={css.error} role="status">{compositionError}</p>}
    </section>
    <section className={css.impact} aria-label="Estimated rate impact" aria-live="polite"><h2>Estimated rate impact</h2><strong>{impact === null ? DASH : formatSignedPercent(impact)}</strong><p>{percent === null ? "Enter a composition from 0 to 100%" : `At ${formatPercent(percent)} composition`}</p></section>
    <p className={css.caption}>Compares the two selected prices only.</p>
  </main>{datePicker && <FuelDatePicker label={datePicker === "from" ? "From · baseline" : "To · comparison"}
    dates={dates} selected={datePicker === "from" ? fromId : toId} onClose={() => setDatePicker(null)}
    onSelect={(id) => { if (datePicker === "from") setChosenFrom(id); else { setChosenTo(id); setCompositionOverride(null); } }} />}</div>;
}
