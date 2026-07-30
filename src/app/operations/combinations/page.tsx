"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";

export default function CombinationsScreen() {
  const combinations = useQuery(api.trailerSwaps.getCurrentCombinations, {});

  if (!combinations) {
    return <SkeletonPage />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{backgroundColor:"var(--background)"}}>
      <div className="flex-none p-6" style={{borderBottom:"1px solid var(--card-border)", backgroundColor:"var(--card-bg)", backdropFilter:"blur(12px)"}}>
        <h1 className="text-2xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Combinations</h1>
        <p className="text-sm mt-1" style={{color:"var(--nav-text-color)"}}>Read-only view of current Truck-Trailer assignments</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{color:"var(--color-accent-emerald)"}}>Current Combinations</h2>
            <span className="text-sm font-medium rounded-full px-2.5 py-0.5" style={{backgroundColor:"var(--color-accent-emerald)", color:"#fff"}}>
              {combinations.length}
            </span>
          </div>

          <div className="glass-card rounded-xl overflow-hidden">
            {combinations.length === 0 ? (
              <EmptyState icon="empty" title="No current combinations" description="No trucks are currently assigned to trailers." />
            ) : (
              <ul style={{borderTop:"1px solid var(--card-border)"}}>
                {combinations.map(item => {
                  const last = item.lastSwapDate
                    ? new Date(item.lastSwapDate)
                    : null;
                  let lastLabel = "No swap history";
                  if (last) {
                    const now = new Date();
                    const diffMs = now.getTime() - last.getTime();
                    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    if (days <= 0) {
                      lastLabel = "Last swap: today";
                    } else if (days === 1) {
                      lastLabel = "Last swap: 1 day ago";
                    } else {
                      lastLabel = `Last swap: ${days} days ago`;
                    }
                  }

                  return (
                    <li
                      key={`${item.truckId}-${item.trailerId}`}
                      className="p-4 flex items-center gap-4 transition-colors"
                      style={{borderBottom:"1px solid var(--card-border)"}}
                    >
                      <div className="flex-1">
                        <div className="text-xs uppercase tracking-wider mb-0.5" style={{color:"var(--nav-text-color)"}}>
                          Truck
                        </div>
                        <div className="font-bold text-lg" style={{color:"var(--foreground)"}}>
                          {item.truckNumber}
                        </div>
                      </div>

                      <div className="flex-none" style={{color:"var(--nav-text-color)"}}>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.72 7.72a.75.75 0 011.06 0l3.75 3.75a.75.75 0 010 1.06l-3.75 3.75a.75.75 0 11-1.06-1.06l2.47-2.47H3a.75.75 0 010-1.5h16.19l-2.47-2.47a.75.75 0 010-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>

                      <div className="flex-1 text-right">
                        <div className="text-xs uppercase tracking-wider mb-0.5" style={{color:"var(--nav-text-color)"}}>
                          Trailer
                        </div>
                        <div className="font-bold text-lg" style={{color:"var(--foreground)"}}>
                          {item.trailerNumber}
                        </div>
                        <div className="text-xs mt-1" style={{color:"var(--nav-text-color)"}}>
                          {lastLabel}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
