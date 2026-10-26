"use client";

import { Package, Route, Truck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./MobilePerformance.module.css";

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("en-ZA").format(Math.round(value));

type Props = {
  summary: { totalRevenue: number; totalRoutes: number; totalLoads: number; totalKm: number; completionRate: number };
  days: { date: string; revenue: number }[];
  onPeriod: (label: string) => void;
  onCompleted: () => void;
};

export function MobilePerformance({ summary, days, onPeriod, onCompleted }: Props) {
  const completion = Math.min(100, Math.max(0, summary.completionRate));
  return <section className={styles.root} aria-label="Performance overview">
    <div className={styles.hero}>
      <button className={styles.completion} onClick={onCompleted} aria-label={`${Math.round(completion)}% completion: view completed routes`}>
        <span>Completion</span>
        <div className={styles.ring}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="49" className={styles.track} />
            <circle cx="60" cy="60" r="49" className={styles.progress} pathLength="100" strokeDasharray={`${completion} 100`} />
          </svg>
          <strong>{Math.round(completion)}%</strong>
        </div>
      </button>
      <button className={styles.revenue} onClick={() => onPeriod("Revenue — all routes")}>
        <span>Revenue</span><strong>{money(summary.totalRevenue)}</strong><small>View revenue details →</small>
      </button>
    </div>
    <div className={styles.metrics}>
      {[{ label: "Routes", value: summary.totalRoutes, Icon: Route }, { label: "Loads", value: summary.totalLoads, Icon: Package }, { label: "Total km", value: summary.totalKm, Icon: Truck }].map(({ label, value, Icon }) =>
        <button key={label} onClick={() => onPeriod(`${label} breakdown`)} className={styles.metric}>
          <Icon size={20} aria-hidden="true" /><span>{label}</span><strong>{number(value)}</strong>
        </button>)}
    </div>
    <div className={styles.chartCard}>
      <h2>Daily revenue</h2>
      {days.length ? <div className={styles.chart}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={days} margin={{ top: 8, right: 0, bottom: 0, left: -22 }} accessibilityLayer>
            <CartesianGrid stroke="var(--card-border)" strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} tick={{ fill: "var(--nav-text-color)", fontSize: 10 }} minTickGap={24} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(value: number) => Math.abs(value) >= 1000 ? `${Math.round(value / 1000)}k` : String(value)} tick={{ fill: "var(--nav-text-color)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(date) => String(date)} contentStyle={{ background: "var(--background)", border: "1px solid var(--card-border)", borderRadius: 12, color: "var(--foreground)" }} cursor={{ fill: "rgba(6,182,212,0.08)" }} />
            <Bar dataKey="revenue" name="Revenue" fill="#06B6D4" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div> : <p className={styles.empty}>No revenue recorded for this period.</p>}
    </div>
  </section>;
}
