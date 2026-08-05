"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { BarChart3 } from "lucide-react";

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
    return <SkeletonPage />;
  }

  return (
    <div className="h-full flex flex-col" style={{backgroundColor:"var(--background)"}}>
      <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:"1px solid var(--card-border)", backgroundColor:"var(--card-bg)", backdropFilter:"blur(12px)"}}>
        <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Trailer Activity</h1>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-3" style={{backgroundColor:"var(--background)"}}>
        {trailerCounts.map(item => (
          <div
            key={item.number}
            className="glass-card rounded-xl px-5 py-4 flex flex-col gap-1"
          >
            <div className="text-xs font-medium" style={{color:"var(--nav-text-color)"}}>TRAILER</div>
            <div className="text-lg font-bold" style={{color:"var(--foreground)"}}>
              {item.number}
            </div>
            <div className={`mt-1 text-xs font-medium flex items-center gap-1 ${kpiColor(item.count)}`}>
              <BarChart3 className="w-4 h-4" />
              <span>{item.count} swaps this month</span>
            </div>
          </div>
        ))}

        {trailerCounts.length === 0 && (
          <div className="text-xs italic mt-8" style={{color:"var(--nav-text-color)"}}>No trailer swaps this month.</div>
        )}
      </div>
    </div>
  );
}
