import React from "react";

interface DashboardCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  children?: React.ReactNode;
  className?: string;
}

export default function DashboardCard({
  title,
  value,
  trend,
  children,
  className = "",
}: DashboardCardProps) {
  const trendColors = {
    up: "text-emerald-600",
    down: "text-red-500",
    neutral: "text-gray-500",
  };

  return (
    <div
      className={`glass-card-premium p-5 flex flex-col ${className}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-xs font-semibold text-[var(--nav-text-color)] uppercase tracking-wider">
          {title}
        </h3>
        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trendColors[trend.direction]}`}
            style={{
              background:
                trend.direction === "up"
                  ? "rgba(16,185,129,0.1)"
                  : trend.direction === "down"
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(107,114,128,0.1)",
            }}
          >
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "•"}{" "}
            {trend.value}
          </span>
        )}
      </div>

      <div className="text-3xl font-black text-[var(--foreground)] mb-4">{value}</div>

      {children && (
        <>
          <div className="h-px bg-[var(--card-border)] mb-3" />
          <div className="flex-1">{children}</div>
        </>
      )}
    </div>
  );
}
