"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const kpiColor = (count: number) => {
  if (count <= 3) return "text-green-700";
  if (count <= 8) return "text-yellow-700";
  return "text-red-700";
};

export default function TrailerActivityScreen() {
  const swaps = useQuery(api.trailerSwaps.getAllSwaps, {});

  const trailerCounts = useMemo(() => {
    if (!swaps) return [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const counts: Record<string, { number: string; count: number }> = {};

    swaps.forEach(s => {
      const base = s.swapDate || s.createdAt;
      if (!base) return;
      const d = new Date(base);
      if (d < start || d >= end) return;

      if (s.oldTrailerNumber) {
        const key = s.oldTrailerNumber;
        if (!counts[key]) counts[key] = { number: key, count: 0 };
        counts[key].count += 1;
      }
      if (s.newTrailerNumber) {
        const key = s.newTrailerNumber;
        if (!counts[key]) counts[key] = { number: key, count: 0 };
        counts[key].count += 1;
      }
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [swaps]);

  if (!swaps) {
    return <div className="p-6 text-sm text-gray-500">Loading trailer activity...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-900">Trailer Activity</h1>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 px-6 py-4 space-y-3">
        {trailerCounts.map(item => (
          <div
            key={item.number}
            className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-col gap-1"
          >
            <div className="text-xs font-medium text-gray-500">TRAILER</div>
            <div className="text-lg font-semibold text-gray-900">
              {item.number}
            </div>
            <div className={`mt-1 text-xs font-medium flex items-center gap-1 ${kpiColor(item.count)}`}>
              <span>📊</span>
              <span>{item.count} swaps this month</span>
            </div>
          </div>
        ))}

        {trailerCounts.length === 0 && (
          <div className="text-xs text-gray-500 italic mt-8">No trailer swaps this month.</div>
        )}
      </div>
    </div>
  );
}
