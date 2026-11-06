"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, BellRing, Cake, CalendarRange, ChevronLeft, ChevronRight, Clock3, Download, Send, Target, TrendingUp, Users, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { waWishLink } from "@/src/lib/birthdays";
import { birthdayOffset, johannesburgDay } from "@/src/lib/birthdayTimeline";
import { DriverThumb } from "@/src/components/admin/DriverAvatar";
import { downloadFile } from "@/src/lib/exports/utils";
import css from "./timeline.module.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MiniBars({ items }: { items: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  return <div className={css.miniBars}>{items.map((item) => <div className={css.miniBarRow} key={item.label}><span>{item.label}</span><div className={css.miniBarTrack}><i style={{ width: `${item.value ? Math.max((item.value / maxValue) * 100, 8) : 0}%` }} /></div><b>{item.value}</b></div>)}</div>;
}

function exportBirthdayMetrics(rows: Array<{ name: string; age: number; month: number; day: number }>) {
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = [
    ["Driver", "Age", "Birthday"].map(cell).join(","),
    ...rows.map((row) => [row.name, row.age, `${MONTHS[row.month - 1]} ${row.day}`].map(cell).join(",")),
  ];
  downloadFile(`\uFEFF${lines.join("\r\n")}\r\n`, `fleetcore-birthday-metrics_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

export default function BirthdayTimelinePage() {
  const [today, setToday] = useState(() => johannesburgDay());
  const [cursor, setCursor] = useState(() => ({ year: today.year, month: today.month }));
  const [showMetrics, setShowMetrics] = useState(false);
  const [exported, setExported] = useState(false);
  useEffect(() => {
    const refresh = () => setToday((previous) => {
      const next = johannesburgDay();
      return previous.year === next.year && previous.month === next.month && previous.day === next.day ? previous : next;
    });
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  const monthly = useQuery(api.birthdays.getBirthdaysForMonth, { year: cursor.year, month: cursor.month });
  const allBirthdays = useQuery(api.birthdays.getAllDriverBirthdays, {});
  const monthlyRows = useMemo(() => (monthly ?? []).map((row) => ({ ...row, month: cursor.month, daysUntil: birthdayOffset(cursor.month, row.day, today, cursor.year) })).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name)), [monthly, cursor.month, cursor.year, today]);
  const calendarDays = useMemo(() => {
    const firstDay = new Date(cursor.year, cursor.month - 1, 1).getDay();
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    return Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  }, [cursor]);
  const birthdaysByDay = useMemo(() => {
    const grouped = new Map<number, typeof monthlyRows>();
    for (const birthday of monthlyRows) grouped.set(birthday.day, [...(grouped.get(birthday.day) ?? []), birthday]);
    return grouped;
  }, [monthlyRows]);
  const metrics = useMemo(() => {
    const birthdays = allBirthdays ?? [];
    const ageBands = [
      { label: "Under 30", count: 0 },
      { label: "30–39", count: 0 },
      { label: "40–49", count: 0 },
      { label: "50–59", count: 0 },
      { label: "60+", count: 0 },
    ];
    const quarterAge = [0, 0, 0, 0];
    const decadeCounts = new Map<number, number>();
    const birthdayQuarter = [0, 0, 0, 0];
    const monthWeekdays = [0, 0];
    const monthDays = new Set(monthlyRows.map((birthday) => birthday.day));
    let longestDrySpell = 0;
    let currentDrySpell = 0;
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      if (monthDays.has(day)) currentDrySpell = 0;
      else { currentDrySpell += 1; longestDrySpell = Math.max(longestDrySpell, currentDrySpell); }
    }
    for (const driver of birthdays) {
      const bandIndex = driver.age < 30 ? 0 : driver.age < 40 ? 1 : driver.age < 50 ? 2 : driver.age < 60 ? 3 : 4;
      ageBands[bandIndex].count += 1;
      quarterAge[Math.floor((driver.month - 1) / 3)] += 1;
      const decade = Math.floor((new Date().getFullYear() - driver.age) / 10) * 10;
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
      birthdayQuarter[Math.floor((driver.month - 1) / 3)] += 1;
    }
    for (const birthday of monthlyRows) {
      const weekday = new Date(cursor.year, cursor.month - 1, birthday.day).getDay();
      monthWeekdays[weekday === 0 || weekday === 6 ? 1 : 0] += 1;
    }
    const nextBirthdays = birthdays.map((driver) => {
      let daysUntil = birthdayOffset(driver.month, driver.day, today);
      if (daysUntil < 0) daysUntil = birthdayOffset(driver.month, driver.day, today, today.year + 1);
      return { ...driver, daysUntil };
    }).sort((a, b) => a.daysUntil - b.daysUntil);
    const milestones = birthdays.filter((driver) => {
      const birthdayThisYear = birthdayOffset(driver.month, driver.day, today, today.year);
      const ageOnBirthday = driver.age + (birthdayThisYear < 0 ? 1 : 0);
      return [30, 40, 50, 60].includes(ageOnBirthday);
    }).sort((a, b) => a.month - b.month || a.day - b.day).slice(0, 4);
    const clusters = [...new Set(monthlyRows.map((birthday) => birthday.day))].map((day) => ({ day, count: monthlyRows.filter((birthday) => birthday.day === day).length })).filter((cluster) => cluster.count > 1);
    const dominant = ageBands.reduce((best, band) => band.count > best.count ? band : best, ageBands[0]);
    return {
      ageBands, quarterAge, decadeCounts: [...decadeCounts.entries()].sort((a, b) => a[0] - b[0]), birthdayQuarter, monthWeekdays,
      longestDrySpell, milestones, clusters, dominant, nextBirthday: nextBirthdays[0],
      passed: monthlyRows.filter((birthday) => birthday.daysUntil < 0).length,
      monthTotal: monthlyRows.length,
      aging12: birthdays.filter((driver) => {
        let daysUntil = birthdayOffset(driver.month, driver.day, today);
        if (daysUntil < 0) daysUntil = birthdayOffset(driver.month, driver.day, today, today.year + 1);
        return driver.age % 10 === 9 && daysUntil <= 365;
      }).length,
      total: birthdays.length,
      dominantPct: birthdays.length ? Math.round((dominant.count / birthdays.length) * 100) : 0,
    };
  }, [allBirthdays, cursor, monthlyRows, today]);
  const shiftMonth = (delta: number) => {
    const date = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 });
  };

  return <div className={css.screen}><main className={css.content}>
    <header className={css.header}>
      <span className={css.headerIcon}><Cake size={27} /></span>
      <div className={css.headerCopy}><p className={css.eyebrow}>People &amp; culture</p><h1>Birthday dashboard</h1><p>Keep track of driver birthdays across your fleet.</p></div>
      <button type="button" className={css.ageStatsButton} aria-label="Open driver stats" title="Open driver stats" onClick={() => setShowMetrics(true)}><BarChart3 size={18} /></button>
      <button type="button" className={css.notifyButton} title="Birthday notifications will be added here"><BellRing size={17} />Enable notifications</button>
    </header>

    <section className={css.dashboardGrid}>
      <section className={css.calendarCard} aria-labelledby="birthday-month-heading">
        <div className={css.panelHeader}><button type="button" aria-label="Previous birthday month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><div><p className={css.panelEyebrow}>Birthday calendar</p><h2 id="birthday-month-heading">{MONTHS[cursor.month - 1]} {cursor.year}</h2></div><button type="button" aria-label="Next birthday month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></div>
        <div className={css.calendarGrid} aria-label={`${MONTHS[cursor.month - 1]} ${cursor.year} birthday calendar`}>
          {WEEKDAYS.map((day) => <span key={day} className={css.weekday}>{day}</span>)}
          {calendarDays.map((day, index) => day === null ? <span key={`empty-${index}`} className={`${css.calendarCell} ${css.emptyDay}`} aria-hidden="true" /> : <div key={day} className={css.calendarCell} data-today={cursor.year === today.year && cursor.month === today.month && day === today.day}><span className={css.dayNumber}>{day}</span><div className={css.calendarBirthdays}>{(birthdaysByDay.get(day) ?? []).slice(0, 2).map((birthday) => <span key={birthday.driverId} className={css.calendarBirthday} title={birthday.name}><Cake size={11} />{birthday.name.split(/\s+/)[0]}</span>)}</div></div>)}
        </div>
        <div className={css.calendarLegend}><span><i data-type="birthday" />Driver birthday</span><span><i data-type="today" />Today</span></div>
      </section>

      <section className={css.upcomingPanel} aria-labelledby="upcoming-birthdays-heading">
        <div className={css.panelTitle}><Cake size={21} /><div><p className={css.panelEyebrow}>Selected month</p><h2 id="upcoming-birthdays-heading">{MONTHS[cursor.month - 1]} birthdays</h2></div></div>
        <div className={css.upcomingList}>{monthlyRows.length ? monthlyRows.map((birthday) => { const timing = birthday.daysUntil === 0 ? "Today" : birthday.daysUntil > 0 ? `In ${birthday.daysUntil} days` : "Already passed"; return <article key={birthday.driverId} className={css.personCard}><DriverThumb name={birthday.name} photoUrl={birthday.photoUrl || undefined} photoOriginalUrl={birthday.photoOriginalUrl || undefined} size={40} /><div className={css.personDetails}><h3 title={birthday.name}>{birthday.name}</h3><p>{String(birthday.day).padStart(2, "0")} {MONTHS[birthday.month - 1].slice(0, 3)} <span>•</span> {timing}</p></div>{birthday.phoneNumber ? <a href={waWishLink(birthday.phoneNumber, birthday.name)} target="_blank" rel="noopener noreferrer" className={css.wish} aria-label={`Wish ${birthday.name} a happy birthday on WhatsApp`}><Send size={13} />Wish</a> : <span className={css.noPhone}>No phone</span>}</article>; }) : <div className={css.empty}><Cake size={28} /><h3>No birthdays this month</h3><p>Try another month to see more driver birthdays.</p></div>}</div>
      </section>
    </section>

    <p className={css.caption}>WhatsApp opens a birthday wish for you to review and send.</p>

    {showMetrics && <div className={css.metricsOverlay} role="dialog" aria-modal="true" aria-labelledby="metrics-heading">
      <section className={css.metricsScreen}>
        <header className={css.metricsHeader}><div className={css.metricsTitle}><div className={css.metricsBrandIcon}><Users size={27} /></div><div><p className={css.eyebrow}>People &amp; culture</p><h2 id="metrics-heading">Birthday metrics dashboard</h2></div><span className={css.activeDrivers}>{metrics.total} Active Drivers</span><p>Live workforce and calendar patterns from driver birthdates.</p></div><div className={css.metricsActions}><div className={css.monthPicker}><CalendarRange size={14} /><button type="button" aria-label="Previous metrics month" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} /></button><strong>{MONTHS[cursor.month - 1]} {cursor.year}</strong><button type="button" aria-label="Next metrics month" onClick={() => shiftMonth(1)}><ChevronRight size={14} /></button></div><button type="button" className={css.metricsClose} aria-label="Close driver stats" onClick={() => setShowMetrics(false)}><X size={20} /></button></div></header>
        <div className={css.metricsTop}>
          <article className={css.metricCard}><Users size={18} /><span>Dominant age group</span><strong>{metrics.dominant.label}</strong><small>{metrics.dominant.count} drivers</small></article>
          <article className={css.metricCard}><TrendingUp size={18} /><span>Aging within 12 months</span><strong>{metrics.total ? `${Math.round((metrics.aging12 / metrics.total) * 100)}%` : "—"}</strong><small>{metrics.aging12} drivers entering the next age band</small></article>
          <article className={css.metricCard}><CalendarRange size={18} /><span>{MONTHS[cursor.month - 1]} progress</span><strong>{metrics.passed} of {metrics.monthTotal}</strong><small>birthdays completed</small></article>
          <article className={`${css.metricCard} ${css.nextMetricCard}`}><Cake size={18} /><span>Next birthday countdown</span><strong>{metrics.nextBirthday ? `${metrics.nextBirthday.daysUntil} days` : "—"}</strong><small>{metrics.nextBirthday?.name ?? "No birthday data"}</small></article>
        </div>
        <div className={css.metricsColumns}>
          <section className={css.metricsPanel}><h3><BarChart3 size={16} />Age structure &amp; donut <small>Total: {metrics.total}</small></h3><div className={css.donutLayout}><div className={css.donutChart} style={{ background: `conic-gradient(#06b6a6 0 ${metrics.dominantPct}%, #0ea5e9 ${metrics.dominantPct}% 73%, #0284c7 73% 88%, #172554 88% 96%, #cbd5e1 96% 100%)` }}><div><strong>{metrics.dominantPct}%</strong><span>{metrics.dominant.label}</span></div></div><div className={css.donutLegend}>{metrics.ageBands.map((band, index) => <span key={band.label}><i data-color={index} />{band.label}<b>{band.count}</b></span>)}</div></div><div className={css.metricRows}><div><span>Birth quarter</span><MiniBars items={metrics.quarterAge.map((count, index) => ({ label: `Q${index + 1}`, value: count }))} /></div><div><span>Birth decade heatmap</span><b className={css.heatmap}>{metrics.decadeCounts.map(([decade, count]) => <em key={decade} style={{ opacity: Math.max(.35, count / Math.max(...metrics.decadeCounts.map((item) => item[1]), 1)) }}>{decade}s <i>{count}</i></em>)}</b></div></div></section>
          <section className={css.metricsPanel}><h3><CalendarRange size={16} />Quarterly &amp; day distribution <small>Peak: Q1 &amp; Q3</small></h3><div className={css.chartSection}><span>Birthdays by quarter · annual</span><div className={css.annualBars}>{metrics.birthdayQuarter.map((count, index) => <div className={css.annualBar} key={index}><strong>{count}</strong><b style={{ height: `${Math.max((count / Math.max(...metrics.birthdayQuarter, 1)) * 100, count ? 8 : 0)}%` }} /><span>Q{index + 1}</span></div>)}</div></div><div className={css.metricRows}><div><span>{MONTHS[cursor.month - 1]} day split</span><MiniBars items={[{ label: "Weekdays", value: metrics.monthWeekdays[0] }, { label: "Weekends", value: metrics.monthWeekdays[1] }]} /></div><div><span>Same-day clusters</span><b>{metrics.clusters.length ? metrics.clusters.map((cluster) => <em key={cluster.day}>{cluster.day} {MONTHS[cursor.month - 1].slice(0, 3)} · {cluster.count}</em>) : <em>No overlapping birthdays</em>}</b></div></div></section>
          <section className={css.metricsPanel}><h3><Target size={16} />Milestone radar <small>{metrics.milestones.length} Upcoming</small></h3><div className={css.milestoneList}>{metrics.milestones.length ? metrics.milestones.map((driver) => <div className={css.milestoneItem} key={driver.driverId}><strong>{driver.age + (birthdayOffset(driver.month, driver.day, today, today.year) < 0 ? 1 : 0)}</strong><span><b>{driver.name}</b><small>{String(driver.day).padStart(2, "0")} {MONTHS[driver.month - 1].slice(0, 3)}</small></span><em>Turning {driver.age + (birthdayOffset(driver.month, driver.day, today, today.year) < 0 ? 1 : 0)}</em></div>) : <p className={css.emptyMetric}>No landmark birthdays ahead.</p>}</div><div className={css.drySpell}><span>Longest dry spell</span><strong>{metrics.longestDrySpell} consecutive days</strong><small>No driver birthdays in {MONTHS[cursor.month - 1]}</small></div><button type="button" className={css.exportMetric} aria-label="Export fleet age and birthday data" onClick={() => { exportBirthdayMetrics(allBirthdays ?? []); setExported(true); window.setTimeout(() => setExported(false), 2400); }}><Download size={14} />{exported ? "Exported birthday data" : "Export fleet age & birthday"}<span>↗</span></button></section>
        </div>
        <footer className={css.metricsFooter}><Clock3 size={14} />Metrics update automatically from active driver birthdates. <span>Close to return to the calendar.</span></footer>
      </section>
    </div>}
  </main></div>;
}
