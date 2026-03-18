"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type QuickFilter = "today" | "week" | "month";

const reasonColorMap: Record<string, string> = {
  "Operational Requirement": "bg-blue-100 text-blue-800",
  "Driver Request": "bg-yellow-100 text-yellow-800",
  "Maintenance Swap": "bg-red-100 text-red-800",
  Other: "bg-gray-100 text-gray-700",
};

const kpiColor = (count: number) => {
  if (count <= 3) return "text-green-700";
  if (count <= 8) return "text-yellow-700";
  return "text-red-700";
};

export default function SwapHistoryScreen() {
  const swaps = useQuery(api.trailerSwaps.getAllSwaps, {});
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("today");
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [truckSearch, setTruckSearch] = useState("");
  const [trailerSearch, setTrailerSearch] = useState("");
  const [fromDate, setFromDate] = useState<string | undefined>();
  const [toDate, setToDate] = useState<string | undefined>();

  const filteredSwaps = useMemo(() => {
    if (!swaps) return [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const quickFiltered = swaps.filter(s => {
      const base = s.swapDate || s.createdAt;
      if (!base) return false;
      const d = new Date(base);
      if (quickFilter === "today") {
        return d >= startOfToday;
      }
      if (quickFilter === "week") {
        return d >= startOfWeek;
      }
      return d >= startOfMonth;
    });

    const dateFiltered = quickFiltered.filter(s => {
      if (!fromDate && !toDate) return true;
      const base = s.swapDate || s.createdAt;
      if (!base) return false;
      const d = new Date(base);
      if (fromDate) {
        const f = new Date(fromDate);
        if (d < f) return false;
      }
      if (toDate) {
        const t = new Date(toDate);
        t.setHours(23, 59, 59, 999);
        if (d > t) return false;
      }
      return true;
    });

    const truckFiltered = dateFiltered.filter(s => {
      if (!truckSearch) return true;
      return s.truckNumber?.toLowerCase().includes(truckSearch.toLowerCase());
    });

    const trailerFiltered = truckFiltered.filter(s => {
      if (!trailerSearch) return true;
      const oldMatch = s.oldTrailerNumber?.toLowerCase().includes(trailerSearch.toLowerCase());
      const newMatch = s.newTrailerNumber?.toLowerCase().includes(trailerSearch.toLowerCase());
      return oldMatch || newMatch;
    });

    return trailerFiltered;
  }, [swaps, quickFilter, fromDate, toDate, truckSearch, trailerSearch]);

  const monthlyCountsByTruck = useMemo(() => {
    if (!swaps) return {};
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const counts: Record<string, number> = {};
    swaps.forEach(s => {
      const base = s.swapDate || s.createdAt;
      if (!base) return;
      const d = new Date(base);
      if (d < start || d >= end) return;
      const key = s.truckNumber || "";
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [swaps]);

  if (!swaps) {
    return <div className="p-6 text-sm text-gray-500">Loading swap history...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-900">Swap History</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowSearch(s => !s);
              if (!showSearch) setShowFilter(false);
            }}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
          >
            <span className="sr-only">Search</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <circle cx="11" cy="11" r="6" />
              <line x1="16" y1="16" x2="20" y2="20" />
            </svg>
          </button>
          <button
            onClick={() => {
              setShowFilter(f => !f);
              if (!showFilter) setShowSearch(false);
            }}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-600"
          >
            <span className="sr-only">Filter</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M4 4h16l-6 7v5l-4 4v-9z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-6 py-3 border-b bg-white flex gap-2">
        {(["today", "week", "month"] as QuickFilter[]).map(key => (
          <button
            key={key}
            onClick={() => setQuickFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              quickFilter === key
                ? "bg-black text-white border-black"
                : "bg-gray-50 text-gray-700 border-gray-200"
            }`}
          >
            {key === "today" && "Today"}
            {key === "week" && "Week"}
            {key === "month" && "Month"}
          </button>
        ))}
      </div>

      {showSearch && (
        <div className="px-6 py-3 border-b bg-white flex gap-3 items-center">
          <input
            value={truckSearch}
            onChange={e => setTruckSearch(e.target.value)}
            placeholder="Search Truck Number"
            className="border rounded px-3 py-1.5 text-xs w-48"
          />
          <input
            value={trailerSearch}
            onChange={e => setTrailerSearch(e.target.value)}
            placeholder="Search Trailer Number"
            className="border rounded px-3 py-1.5 text-xs w-48"
          />
        </div>
      )}

      {showFilter && (
        <div className="px-6 py-3 border-b bg-white flex gap-3 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">From Date</span>
            <input
              type="date"
              value={fromDate ?? ""}
              onChange={e => setFromDate(e.target.value || undefined)}
              className="border rounded px-3 py-1.5 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">To Date</span>
            <input
              type="date"
              value={toDate ?? ""}
              onChange={e => setToDate(e.target.value || undefined)}
              className="border rounded px-3 py-1.5 text-xs"
            />
          </div>
          <button
            onClick={() => {}}
            className="ml-auto px-4 py-1.5 rounded-md bg-black text-white text-xs font-medium"
          >
            Apply
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-gray-50 px-6 py-4 space-y-3">
        {filteredSwaps.map(swap => {
          const reason = swap.reason || "Other";
          const badgeColor = reasonColorMap[reason] || reasonColorMap.Other;
          const monthCount = monthlyCountsByTruck[swap.truckNumber || ""] || 0;

          const dateLabel = swap.swapDate
            ? new Date(swap.swapDate).toLocaleDateString()
            : swap.createdAt
            ? new Date(swap.createdAt).toLocaleDateString()
            : "";

          return (
            <div
              key={swap._id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">{dateLabel}</span>
                <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${badgeColor}`}>
                  {reason}
                </span>
              </div>

              <div className="text-lg font-semibold text-gray-900">
                TRUCK {swap.truckNumber || ""}
              </div>

              <div className="text-xs text-gray-700 flex items-center gap-2">
                <span className="font-medium">Old:</span>
                <span>{swap.oldTrailerNumber || "None"}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium">New:</span>
                <span>{swap.newTrailerNumber || "None"}</span>
              </div>

              <div className={`mt-1 text-xs font-medium flex items-center gap-1 ${kpiColor(monthCount)}`}>
                <span>📊</span>
                <span>{monthCount} swaps this month</span>
              </div>
            </div>
          );
        })}

        {filteredSwaps.length === 0 && (
          <div className="text-xs text-gray-500 italic mt-8">No swaps match the current filters.</div>
        )}
      </div>
    </div>
  );
}