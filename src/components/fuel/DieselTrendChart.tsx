"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay, formatRand, formatSignedPercent, movementText, DASH } from "@/src/lib/fuel/display";
/** The subset of a price record the chart needs. */
export type TrendPoint = {
  effectiveDate: string;
  pricePerLitre: number;
  percentChange: number | null;
};

const gridColor = "var(--chart-grid)";
const axisColor = "var(--chart-axis)";
// The app's primary cyan, matching nav-item-active, rather than a new token.
const lineColor = "#06B6D4";

/**
 * The diesel price over time.
 *
 * Fed points in date order and plotted in that order, because a line chart
 * read right to left says something different from the same line read left to
 * right. The page keeps its newest-first table as a display choice only; this
 * always gets the chronological sequence.
 */
function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        padding: "12px 14px",
        boxShadow: "var(--card-shadow-hover)",
        backdropFilter: "blur(8px)",
        minWidth: "180px",
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--nav-text-color)] m-0">Effective</p>
      <p className="text-sm font-semibold m-0 mt-1">{formatDay(point.effectiveDate)}</p>
      <p className="text-xs uppercase tracking-wider text-[var(--nav-text-color)] m-0 mt-3">Per litre</p>
      <p className="text-sm font-semibold m-0 mt-1">{formatRand(point.pricePerLitre)}</p>
      <p className={`text-xs m-0 mt-3 ${movementText(point.percentChange)}`}>
        {point.percentChange === null ? DASH : formatSignedPercent(point.percentChange)}
      </p>
    </div>
  );
}

/**
 * A single price is a point rather than a line, so the chart says so instead of
 * drawing a flat line that implies nothing moved.
 */
export function DieselTrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-[var(--nav-text-color)] py-8 text-center">No price recorded yet, so there is no trend to draw.</p>;
  }

  const single = points.length === 1;
  // A flat line from one reading would claim the price held steady, which is a
  // different statement from "we only know one price".
  const data = single ? [points[0], points[0]] : points;

  return (
    <div>
      {single && (
        <p className="text-xs text-[var(--nav-text-color)] mb-2">
          One price recorded, so there is nothing to compare it against yet.
        </p>
      )}
      <div
        role="img"
        aria-label={
          single
            ? `Diesel price trend. One price recorded: ${formatRand(points[0].pricePerLitre)} a litre, effective ${formatDay(points[0].effectiveDate)}.`
            : `Diesel price trend across ${points.length} recorded prices, from ${formatDay(points[0].effectiveDate)} at ${formatRand(points[0].pricePerLitre)} a litre to ${formatDay(points[points.length - 1].effectiveDate)} at ${formatRand(points[points.length - 1].pricePerLitre)} a litre. The full figures are in the price history table below.`
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="effectiveDate"
              tickFormatter={formatDay}
              stroke={axisColor}
              style={{ fontSize: "10px" }}
              minTickGap={24}
            />
            <YAxis
              stroke={axisColor}
              style={{ fontSize: "10px" }}
              width={58}
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => formatRand(value)}
            />
            <Tooltip content={<TrendTooltip />} wrapperStyle={{ outline: "none", zIndex: 999 }} />
            <Line
              type="monotone"
              dataKey="pricePerLitre"
              name="Per litre"
              stroke={lineColor}
              strokeWidth={2}
              dot={{ r: 2.5, fill: lineColor, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-[var(--nav-text-color)] mt-1 text-right">Rand per litre</p>
    </div>
  );
}
