"use client";

import { useEffect, useRef, useState } from "react";
import { Cake, ChevronLeft, ChevronRight, Send, CalendarDays } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { waWishLink } from "@/src/lib/birthdays";
import { birthdayOffset, johannesburgDay, timelinePage, upcomingTimeline, type TimelineBirthday } from "@/src/lib/birthdayTimeline";
import { DriverThumb } from "@/src/components/admin/DriverAvatar";
import css from "./timeline.module.css";

type Filter = "today" | "upcoming" | "month";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function BirthdayTimelinePage() {
  const [today, setToday] = useState(() => johannesburgDay());
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [cursor, setCursor] = useState(() => ({ year: today.year, month: today.month }));
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(3);
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setPageSize(entry.contentRect.height < 560 ? 2 : 3));
    observer.observe(element);
    return () => observer.disconnect();
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
  const monthlyRows = (monthly ?? []).map((row) => ({ ...row, month: cursor.month, daysUntil: birthdayOffset(cursor.month, row.day, today, cursor.year) }))
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  const rows: (TimelineBirthday & { daysUntil: number })[] = filter === "month" ? monthlyRows : filter === "today" ? orderedUpcoming.filter((row) => row.daysUntil === 0) : orderedUpcoming;
  const loading = filter === "month" ? monthly === undefined : upcoming === undefined;
  const paged = timelinePage(rows, page, pageSize);
  const changeFilter = (next: Filter) => { setFilter(next); setPage(0); };
  const shiftMonth = (delta: number) => {
    const date = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 }); setPage(0);
  };

  return <div className={css.screen} ref={screen}><main className={css.content}>
    <header className={css.header}><span><Cake size={25} /></span><div><h1>Birthdays</h1><p>Celebrate your people, one wish at a time.</p></div></header>
    <div className={css.filters} role="group" aria-label="Birthday view">
      {([ ["today", "Today"], ["upcoming", "Upcoming"], ["month", "This month"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}{value === "today" && todayCount > 0 && <span>{todayCount}</span>}</button>)}
    </div>
    <section className={css.period} aria-label="Birthday period">
      {filter === "month" ? <><button type="button" aria-label="Previous birthday month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><h2>{MONTHS[cursor.month - 1]} {cursor.year}</h2><button type="button" aria-label="Next birthday month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></>
        : <><CalendarDays size={18} /><h2>{filter === "today" ? `${today.day} ${MONTHS[today.month - 1]} ${today.year}` : "Next 30 days"}</h2><span>{loading ? "…" : `${rows.length} ${rows.length === 1 ? "birthday" : "birthdays"}`}</span></>}
    </section>
    <section className={css.timeline} style={{ gridTemplateRows: `repeat(${pageSize},minmax(0,1fr))` }} aria-label="Birthday timeline" aria-busy={loading}>
      {loading ? <div className={css.empty} role="status">Loading birthdays…</div> : !rows.length ? <div className={css.empty}><Cake size={36} /><h2>{filter === "today" ? "No birthdays today" : "No birthdays in this period"}</h2><p>{filter === "today" ? "Check Upcoming to see who's next." : "Choose another month or view."}</p></div> : paged.rows.map((birthday) => {
        const isToday = birthday.daysUntil === 0;
        const status = isToday ? "Today" : birthday.daysUntil > 0 ? `In ${birthday.daysUntil} ${birthday.daysUntil === 1 ? "day" : "days"}` : birthday.month === today.month && cursor.year === today.year ? "Earlier this month" : `${birthday.day} ${MONTHS[birthday.month - 1].slice(0,3)}`;
        const photoRecord = monthly?.find((row) => row.driverId === birthday.driverId);
        const photo = birthday.photoUrl || photoRecord?.photoUrl;
        const original = birthday.photoOriginalUrl || photoRecord?.photoOriginalUrl;
        return <article key={birthday.driverId} className={css.entry} data-today={isToday}>
          <div className={css.date}><strong>{String(birthday.day).padStart(2,"0")}</strong><span>{MONTHS[birthday.month - 1].slice(0,3)}</span></div>
          <div className={css.card}><div className={css.person}>
            <DriverThumb name={birthday.name} photoUrl={typeof photo === "string" ? photo : undefined} photoOriginalUrl={typeof original === "string" ? original : undefined} size={40} />
            <div><h2 title={birthday.name}>{birthday.name}</h2><p>{status}</p></div>
          </div>
          {birthday.phoneNumber ? <a href={waWishLink(birthday.phoneNumber, birthday.name)} target="_blank" rel="noopener noreferrer" className={css.wish} aria-label={`Wish ${birthday.name} a happy birthday on WhatsApp`}><Send size={15} />Wish on WhatsApp</a> : <p className={css.noPhone}>No phone number recorded</p>}
          </div>
        </article>;
      })}
    </section>
    <nav className={css.pagination} aria-label="Birthday pages"><button type="button" aria-label="Previous birthday page" disabled={paged.current === 0 || loading} onClick={() => setPage(paged.current - 1)}><ChevronLeft size={19} /></button><p aria-live="polite">{rows.length ? `Page ${paged.current + 1} of ${paged.pages}` : "No birthdays"}</p><button type="button" aria-label="Next birthday page" disabled={paged.current >= paged.pages - 1 || loading} onClick={() => setPage(paged.current + 1)}><ChevronRight size={19} /></button></nav>
    <p className={css.caption}>WhatsApp opens a birthday wish for you to review and send.</p>
  </main></div>;
}
