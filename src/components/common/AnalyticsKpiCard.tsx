"use client";

/**
 * AnalyticsKpiCard — the progress-bar KPI card used across analytics views
 * (dashboard Analytics Dashboard + route analytics). Extracted so both stay
 * visually identical: label + badge on top, big value, capped progress bar.
 */
export function AnalyticsKpiCard({
  label,
  badge,
  badgeClass = "text-emerald-400",
  value,
  valueClass = "text-[var(--foreground)]",
  labelClass = "text-[var(--nav-text-color)]",
  barClass = "bg-emerald-500",
  barPercent,
}: {
  label: string;
  badge?: string;
  badgeClass?: string;
  value: React.ReactNode;
  valueClass?: string;
  labelClass?: string;
  barClass?: string;
  /** 0–100 width for the progress bar (capped + floored internally). */
  barPercent: number;
}) {
  return (
    <div className="glass-card rounded-lg p-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className={`text-xs font-semibold ${labelClass} uppercase`}>{label}</h3>
        {badge && <span className={`text-xs font-bold ${badgeClass}`}>{badge}</span>}
      </div>
      <p className={`text-xl font-black ${valueClass}`}>{value}</p>
      <div className="mt-2 w-full bg-[var(--card-border)] rounded-full h-1.5">
        <div
          className={`${barClass} h-1.5 rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, barPercent))}%` }}
        />
      </div>
    </div>
  );
}
