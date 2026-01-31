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
    up: "text-green-600",
    down: "text-red-600",
    neutral: "text-gray-500",
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col ${className}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          {title}
        </h3>
        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-50 ${trendColors[trend.direction]}`}
          >
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "•"}{" "}
            {trend.value}
          </span>
        )}
      </div>

      <div className="text-3xl font-bold text-gray-900 mb-4">{value}</div>

      {children && (
        <>
          <div className="h-px bg-gray-100 mb-3" />
          <div className="flex-1">
            {children}
          </div>
        </>
      )}
    </div>
  );
}
