"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function CombinationsScreen() {
  const combinations = useQuery(api.trailerSwaps.getCurrentCombinations, {});

  if (!combinations) {
    return <div className="p-8 text-gray-500">Loading combinations...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <div className="flex-none p-6 border-b bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Combinations</h1>
        <p className="text-sm text-gray-500 mt-1">Read-only view of current Truck-Trailer assignments</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-green-800">Current Combinations</h2>
            <span className="text-sm font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
              {combinations.length}
            </span>
          </div>

          <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
            {combinations.length === 0 ? (
              <div className="p-8 text-center text-gray-500 italic">
                No trucks are currently assigned to trailers.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
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
                      className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">
                          Truck
                        </div>
                        <div className="font-semibold text-gray-900 text-lg">
                          {item.truckNumber}
                        </div>
                      </div>

                      <div className="flex-none text-gray-300">
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
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">
                          Trailer
                        </div>
                        <div className="font-semibold text-gray-900 text-lg">
                          {item.trailerNumber}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
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
