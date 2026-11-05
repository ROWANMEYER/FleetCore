"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Cake, ChevronLeft, ChevronRight, PartyPopper, Send } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { waWishLink } from "@/src/lib/birthdays";
import { birthdayOffset, johannesburgDay, timelinePage, upcomingTimeline } from "@/src/lib/birthdayTimeline";
import { DriverThumb } from "@/src/components/admin/DriverAvatar";
import css from "./timeline.module.css";

type Filter = "today" | "upcoming" | "month";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    const observer = new ResizeObserver(([entry]) => setPageSize(entry.contentRect.width >= 768 ? 6 : entry.contentRect.height < 560 ? 2 : 3));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
  const monthlyRows = useMemo(() => (monthly ?? [])
    .map((row) => ({ ...row, month: cursor.month, daysUntil: birthdayOffset(cursor.month, row.day, today, cursor.year) }))
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name)), [monthly, cursor.month, cursor.year, today]);
  const monthRows = filter === "today" && cursor.year === today.year && cursor.month === today.month
    ? monthlyRows.filter((row) => row.day === today.day)
    : monthlyRows;
  const monthLoading = monthly === undefined;
  const paged = timelinePage(monthRows, page, pageSize);
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

  const changeFilter = (next: Filter) => { setFilter(next); setPage(0); };
  const shiftMonth = (delta: number) => {
    const date = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 });
    setPage(0);
  };

  return <div className={css.screen} ref={screen}><main className={css.content}>
    <header className={css.header}>
      <span className={css.headerIcon}><Cake size={27} /></span>
      <div className={css.headerCopy}><p className={css.eyebrow}>People &amp; culture</p><h1>Driver birthdays</h1><p>Keep every birthday visible and make the wish in one click.</p></div>
      <button type="button" className={css.notifyButton} title="Birthday notifications will be added here"><BellRing size={17} />Enable notifications</button>
    </header>

    <section className={css.summary} aria-label="Birthday summary">
      <div className={css.stat}><span>Today</span><strong>{upcoming === undefined ? "—" : todayCount}</strong><p>{todayCount === 1 ? "birthday to celebrate" : "birthdays to celebrate"}</p></div>
      <div className={css.stat}><span>Next 30 days</span><strong>{upcoming === undefined ? "—" : orderedUpcoming.length}</strong><p>upcoming birthdays</p></div>
      <div className={css.stat}><span>This month</span><strong>{monthly === undefined ? "—" : monthly.length}</strong><p>{MONTHS[cursor.month - 1]} birthdays</p></div>
    </section>

    <div className={css.filterRow}><span className={css.filterLabel}>Filter:</span><div className={css.filters} role="group" aria-label="Birthday view">
      {([["today", "Today"], ["upcoming", "Next 30 days"], ["month", "This month"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)}>{label}{value === "today" && todayCount > 0 && <span>{todayCount}</span>}</button>)}
    </div></div>

    <section className={css.workspace}>
      <section className={css.calendarCard} aria-labelledby="birthday-month-heading">
        <div className={css.panelHeader}><button type="button" aria-label="Previous birthday month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button><div><p className={css.panelEyebrow}>Birthday calendar</p><h2 id="birthday-month-heading">{MONTHS[cursor.month - 1]} {cursor.year}</h2></div><button type="button" aria-label="Next birthday month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button></div>
        <div className={css.calendarGrid} aria-label={`${MONTHS[cursor.month - 1]} ${cursor.year} birthday calendar`}>
          {WEEKDAYS.map((day) => <span key={day} className={css.weekday}>{day}</span>)}
          {calendarDays.map((day, index) => {
            if (day === null) return <span key={`empty-${index}`} className={`${css.calendarCell} ${css.emptyDay}`} aria-hidden="true" />;
            const birthdays = birthdaysByDay.get(day) ?? [];
            const isToday = cursor.year === today.year && cursor.month === today.month && day === today.day;
            return <div key={day} className={css.calendarCell} data-today={isToday}><span className={css.dayNumber}>{day}</span><div className={css.calendarBirthdays}>{birthdays.slice(0, 2).map((birthday) => <span key={birthday.driverId} className={css.calendarBirthday} title={birthday.name}><Cake size={11} />{birthday.name.split(/\s+/)[0]}</span>)}{birthdays.length > 2 && <span className={css.moreBirthdays}>+{birthdays.length - 2} more</span>}</div></div>;
          })}
        </div>
        {monthly === undefined && <p className={css.calendarLoading}>Loading birthdays…</p>}
      </section>

      <section className={css.upcomingPanel} aria-labelledby="upcoming-birthdays-heading">
        <div className={css.panelTitle}><PartyPopper size={21} /><div><p className={css.panelEyebrow}>Stay ahead</p><h2 id="upcoming-birthdays-heading">Birthdays in {MONTHS[cursor.month - 1]}</h2></div></div>
        <div className={css.upcomingList} aria-busy={monthLoading}>
          {monthLoading ? <div className={css.empty}><p>Loading birthdays…</p></div> : !paged.rows.length ? <div className={css.empty}><Cake size={32} /><h3>{filter === "today" ? "No birthdays today" : `No birthdays in ${MONTHS[cursor.month - 1]}`}</h3><p>{filter === "today" ? "Choose another view to see this month's birthdays." : "Try another month."}</p></div> : paged.rows.map((birthday) => {
            const isToday = birthday.daysUntil === 0;
            const status = isToday ? "Today" : birthday.daysUntil > 0 ? `In ${birthday.daysUntil} days` : "Passed";
            const photoRecord = monthly?.find((row) => row.driverId === birthday.driverId);
            const photo = birthday.photoUrl || photoRecord?.photoUrl;
            const original = birthday.photoOriginalUrl || photoRecord?.photoOriginalUrl;
            return <article key={birthday.driverId} className={css.personCard} data-today={isToday}><DriverThumb name={birthday.name} photoUrl={typeof photo === "string" ? photo : undefined} photoOriginalUrl={typeof original === "string" ? original : undefined} size={48} /><div className={css.personDetails}><h3 title={birthday.name}>{birthday.name}</h3><p>Driver <span>•</span> {String(birthday.day).padStart(2, "0")} {MONTHS[birthday.month - 1].slice(0, 3)}</p></div><span className={css.statusPill} data-today={isToday}>{status}</span>{birthday.phoneNumber ? <a href={waWishLink(birthday.phoneNumber, birthday.name)} target="_blank" rel="noopener noreferrer" className={css.wish} aria-label={`Wish ${birthday.name} a happy birthday on WhatsApp`}><Send size={14} />Wish</a> : <span className={css.noPhone}>No phone</span>}</article>;
          })}
        </div>
      </section>
    </section>

    <nav className={css.pagination} aria-label="Birthday pages"><button type="button" aria-label="Previous birthday page" disabled={paged.current === 0 || monthLoading} onClick={() => setPage(paged.current - 1)}><ChevronLeft size={18} /></button><p aria-live="polite">{monthRows.length ? `Page ${paged.current + 1} of ${paged.pages}` : "No birthdays"}</p><button type="button" aria-label="Next birthday page" disabled={paged.current >= paged.pages - 1 || monthLoading} onClick={() => setPage(paged.current + 1)}><ChevronRight size={18} /></button></nav>
    <p className={css.caption}>WhatsApp opens a birthday wish for you to review and send.</p>
  </main></div>;
}
