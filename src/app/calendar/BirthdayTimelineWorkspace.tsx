"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Cake, ChevronLeft, ChevronRight, Send, CalendarDays, Search, X } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { waWishLink } from "@/src/lib/birthdays";
import { birthdayOffset, johannesburgDay, timelinePage, upcomingTimeline, type TimelineBirthday } from "@/src/lib/birthdayTimeline";
import { DriverThumb } from "@/src/components/admin/DriverAvatar";
import css from "./timelineWorkspace.module.css";

type Filter = "today" | "upcoming" | "month";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function BirthdayTimelineWorkspace() {
  const [today, setToday] = useState(() => johannesburgDay());
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [cursor, setCursor] = useState(() => ({ year: today.year, month: today.month }));
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(3);
  const [search, setSearch] = useState("");
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const measure = (height: number) => setPageSize(desktop.matches ? 0 : height < 560 ? 2 : 3);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.height));
    const onBreakpoint = () => measure(element.clientHeight);
    observer.observe(element);
    desktop.addEventListener("change", onBreakpoint);
    onBreakpoint();
    return () => { observer.disconnect(); desktop.removeEventListener("change", onBreakpoint); };
  }, []);
  // Refresh relative dates after midnight or returning to the app.
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
  const upcoming = useQuery(api.birthdays.upcomingBirthdays, { windowDays: 30 });
  const monthly = useQuery(api.birthdays.getBirthdaysForMonth, { year: cursor.year, month: cursor.month });
  const orderedUpcoming = upcomingTimeline(upcoming ?? [], today);
  const todayCount = orderedUpcoming.filter((row) => row.daysUntil === 0).length;
  const weekCount = orderedUpcoming.filter((row) => row.daysUntil <= 7).length;
  const monthlyRows = (monthly ?? []).map((row) => ({ ...row, month: cursor.month, daysUntil: birthdayOffset(cursor.month, row.day, today, cursor.year) }))
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  const rows: (TimelineBirthday & { daysUntil: number })[] = filter === "month" ? monthlyRows : filter === "today" ? orderedUpcoming.filter((row) => row.daysUntil === 0) : orderedUpcoming;
  const loading = filter === "month" ? monthly === undefined : upcoming === undefined;
  const term = search.trim().toLowerCase();
  const displayedRows = term ? rows.filter((row) => row.name.toLowerCase().includes(term)) : rows;
  const paged = timelinePage(displayedRows, page, pageSize || Math.max(1, displayedRows.length));
  const todayLabel = `${WEEKDAYS[new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()]}, ${today.day} ${MONTHS[today.month - 1]} ${today.year}`;
  const changeFilter = (next: Filter) => { setFilter(next); setPage(0); };
  const changeSearch = (value: string) => { setSearch(value); setPage(0); };
  const shiftMonth = (delta: number) => {
    const date = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 }); setPage(0);
  };

  return <div className={css.screen} ref={screen}><main className={css.content}>
    <header className={css.header}><span><Cake size={25} /></span><div><h1>Birthdays</h1><p>Celebrate your people, one wish at a time.</p></div>
      <div className={css.headerRight}><CalendarDays size={17} /><span>{todayLabel}</span></div>
    </header>
    <div className={css.filters} role="group" aria-label="Birthday view">
      {([ ["today", "Today"], ["upcoming", "Upcoming"], ["month", "This month"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}{value === "today" && todayCount > 0 && <span>{todayCount}</span>}</button>)}
    </div>
    <div className={css.search}>
      <Search size={16} aria-hidden="true" />
      <input type="search" value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Search birthdays by name" aria-label="Search birthdays by name" />
      {search && <button type="button" aria-label="Clear birthday search" onClick={() => changeSearch("")}><X size={15} /></button>}
    </div>
    <section className={css.stats} aria-label="Birthday summary">
      <div data-accent="today"><strong>{todayCount}</strong><span>Today</span></div>
      <div><strong>{weekCount}</strong><span>Next 7 days</span></div>
      <div><strong>{orderedUpcoming.length}</strong><span>Next 30 days</span></div>
    </section>
    <section className={css.period} aria-label="Birthday period">
      {filter === "month" ? <><button type="button" aria-label="Previous birthday month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><h2>{MONTHS[cursor.month - 1]} {cursor.year}</h2><button type="button" aria-label="Next birthday month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></>
        : <><CalendarDays size={18} /><h2>{filter === "today" ? `${today.day} ${MONTHS[today.month - 1]} ${today.year}` : "Next 30 days"}</h2><span>{loading ? "…" : `${displayedRows.length} ${displayedRows.length === 1 ? "birthday" : "birthdays"}`}</span></>}
    </section>
    <section className={`${css.timeline} scrollbar-fleet`} style={{ "--page-rows": pageSize || 1 } as CSSProperties} aria-label="Birthday timeline" aria-busy={loading}>
      {loading ? <div className={css.empty} role="status">Loading birthdays…</div> : !displayedRows.length ? <div className={css.empty}><Cake size={36} /><h2>{term ? "No matching birthdays" : filter === "today" ? "No birthdays today" : "No birthdays in this period"}</h2><p>{term ? `No one matches “${search.trim()}”. Try another name.` : filter === "today" ? "Check Upcoming to see who's next." : "Choose another month or view."}</p></div> : paged.rows.map((birthday) => {
        const isToday = birthday.daysUntil === 0;
        const status = isToday ? "Today" : birthday.daysUntil > 0 ? `In ${birthday.daysUntil} ${birthday.daysUntil === 1 ? "day" : "days"}` : birthday.month === today.month && cursor.year === today.year ? "Earlier this month" : `${birthday.day} ${MONTHS[birthday.month - 1].slice(0,3)}`;
        const photoRecord = monthly?.find((row) => row.driverId === birthday.driverId);
        const photo = birthday.photoUrl || photoRecord?.photoUrl;
        const original = birthday.photoOriginalUrl || photoRecord?.photoOriginalUrl;
        const occurrenceYear = filter === "month" ? cursor.year : birthdayOffset(birthday.month, birthday.day, today) < 0 ? today.year + 1 : today.year;
        const weekday = WEEKDAYS[new Date(Date.UTC(occurrenceYear, birthday.month - 1, birthday.day)).getUTCDay()];
        const age = typeof birthday.birthYear === "number" ? occurrenceYear - birthday.birthYear : null;
        return <article key={birthday.driverId} className={css.entry} data-today={isToday}>
          <div className={css.date}><strong>{String(birthday.day).padStart(2,"0")}</strong><span>{MONTHS[birthday.month - 1].slice(0,3)}</span></div>
          <div className={css.card}><div className={css.person}>
            <DriverThumb name={birthday.name} photoUrl={typeof photo === "string" ? photo : undefined} photoOriginalUrl={typeof original === "string" ? original : undefined} size={40} />
            <div><h2 title={birthday.name}>{birthday.name}</h2><p>{status}</p></div>
          </div>
          <p className={css.desktopMeta}>{weekday} · {birthday.day} {MONTHS[birthday.month - 1]}{age !== null ? ` · Turns ${age}` : ""}</p>
          {birthday.phoneNumber ? <a href={waWishLink(birthday.phoneNumber, birthday.name)} target="_blank" rel="noopener noreferrer" className={css.wish} aria-label={`Wish ${birthday.name} a happy birthday on WhatsApp`}><Send size={15} />Wish on WhatsApp</a> : <p className={css.noPhone}>No phone number recorded</p>}
          </div>
        </article>;
      })}
    </section>
    <nav className={css.pagination} aria-label="Birthday pages"><button type="button" aria-label="Previous birthday page" disabled={paged.current === 0 || loading} onClick={() => setPage(paged.current - 1)}><ChevronLeft size={19} /></button><p aria-live="polite">{displayedRows.length ? `Page ${paged.current + 1} of ${paged.pages}` : "No birthdays"}</p><button type="button" aria-label="Next birthday page" disabled={paged.current >= paged.pages - 1 || loading} onClick={() => setPage(paged.current + 1)}><ChevronRight size={19} /></button></nav>
    <p className={css.caption}>WhatsApp opens a birthday wish for you to review and send.</p>
  </main></div>;
}
