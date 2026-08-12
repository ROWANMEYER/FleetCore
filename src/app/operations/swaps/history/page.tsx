"use client";

import { useMemo, useState} from"react";
import { useQuery} from"convex/react";
import { api} from"@/convex/_generated/api";
import { SkeletonPage} from"@/src/components/common/Skeleton";
import { EmptyState} from"@/src/components/common/EmptyState";
import { BarChart3, ArrowRight} from"lucide-react";
import { SwapsViewToggle} from"@/src/components/operations/SwapsViewToggle";
import CommitDateInput from"@/src/components/common/CommitDateInput";

type QuickFilter ="today" |"week" |"month";

const reasonColorMap: Record<string, string> = {
"Operational Requirement":"bg-blue-100 text-blue-800",
"Driver Request":"bg-yellow-100 text-yellow-800",
"Maintenance Swap":"bg-red-100 text-red-800",
 Other:"bg-[var(--card-bg)] text-[var(--foreground)]",
};

const kpiColor = (count: number) => {
 if (count <= 3) return"text-green-700";
 if (count <= 8) return"text-yellow-700";
 return"text-red-700";
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
 if (quickFilter ==="today") {
 return d >= startOfToday;
}
 if (quickFilter ==="week") {
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
 const key = s.truckNumber ||"";
 if (!key) return;
 counts[key] = (counts[key] || 0) + 1;
});
 return counts;
}, [swaps]);

 if (!swaps) {
 return <SkeletonPage />;
}

 return (
 <div className="h-full flex flex-col" style={{backgroundColor:"var(--background)"}}>
 <div className="flex items-center justify-between px-4 py-3" style={{borderBottom:"1px solid var(--card-border)", backgroundColor:"var(--card-bg)", backdropFilter:"blur(12px)"}}>
 <h1 className="text-xl font-bold tracking-tight" style={{color:"var(--foreground)"}}>Swap History</h1>
 <div className="flex items-center gap-2">
 <button
 onClick={() => {
 setShowSearch(s => !s);
 if (!showSearch) setShowFilter(false);
}}
 className="p-3 rounded-lg transition-colors" style={{color:"var(--nav-text-color)"}}
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
 className="p-3 rounded-lg transition-colors" style={{color:"var(--nav-text-color)"}}
 >
 <span className="sr-only">Filter</span>
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
 <path d="M4 4h16l-6 7v5l-4 4v-9z" />
 </svg>
 </button>
 </div>
 </div>

 <SwapsViewToggle />

 <div className="px-6 py-3 flex gap-2" style={{borderBottom:"1px solid var(--card-border)", backgroundColor:"var(--card-bg)", backdropFilter:"blur(12px)"}}>
 {(["today","week","month"] as QuickFilter[]).map(key => (
 <button
 key={key}
 onClick={() => setQuickFilter(key)}
 className={`px-3 py-2 rounded-full text-[13px] font-semibold transition-all ${
 quickFilter === key
 ?"text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-sm"
 :"glass-card"
}`}
 >
 {key ==="today" &&"Today"}
 {key ==="week" &&"Week"}
 {key ==="month" &&"Month"}
 </button>
))}
 </div>

 {showSearch && (
 <div className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2" style={{borderBottom:"1px solid var(--card-border)", backgroundColor:"var(--card-bg)"}}>
 <input
 value={truckSearch}
 onChange={e => setTruckSearch(e.target.value)}
 placeholder="Search Truck Number"
 className="settings-input rounded-lg px-3 py-2.5 text-sm w-full sm:w-48"
 />
 <input
 value={trailerSearch}
 onChange={e => setTrailerSearch(e.target.value)}
 placeholder="Search Trailer Number"
 className="settings-input rounded-lg px-3 py-2.5 text-sm w-full sm:w-48"
 />
 </div>
)}

 {showFilter && (
 <div className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-end gap-2" style={{borderBottom:"1px solid var(--card-border)", backgroundColor:"var(--card-bg)"}}>
 <div className="flex flex-col gap-1">
 <span className="text-[11px] font-medium" style={{color:"var(--nav-text-color)"}}>From Date</span>
 <CommitDateInput
 value={fromDate ??""}
 ariaLabel="From date"
 onChange={v => setFromDate(v || undefined)}
 className="settings-input rounded-lg px-3 py-2.5 text-sm"
 />
 </div>
 <div className="flex flex-col gap-1">
 <span className="text-[11px] font-medium" style={{color:"var(--nav-text-color)"}}>To Date</span>
 <CommitDateInput
 value={toDate ??""}
 ariaLabel="To date"
 onChange={v => setToDate(v || undefined)}
 className="settings-input rounded-lg px-3 py-2.5 text-sm"
 />
 </div>
 <button
 onClick={() => {}}
 className="ml-auto px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 shadow-sm"
 >
 Apply
 </button>
 </div>
)}

 <div className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-3 space-y-2" style={{backgroundColor:"var(--background)"}}>
 {filteredSwaps.map(swap => {
 const reason = swap.reason ||"Other";
 const badgeColor = reasonColorMap[reason] || reasonColorMap.Other;
 const monthCount = monthlyCountsByTruck[swap.truckNumber ||""] || 0;

 const dateLabel = swap.swapDate
 ? new Date(swap.swapDate).toLocaleDateString()
 : swap.createdAt
 ? new Date(swap.createdAt).toLocaleDateString()
 :"";

 return (    <div
      key={swap._id}
      className="glass-card rounded-xl px-3.5 py-2.5 flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span style={{color:"var(--nav-text-color)"}}>{dateLabel}</span>
        <span className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${badgeColor}`}>
          {reason}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-base font-bold min-w-0 truncate" style={{color:"var(--foreground)"}}>
          TRUCK {swap.truckNumber || ""}
        </div>
        <div className={`text-[11px] font-medium flex items-center gap-1 shrink-0 ${kpiColor(monthCount)}`}>
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{monthCount} swaps this month</span>
        </div>
      </div>

      <div className="text-[11px] flex items-center gap-1.5" style={{color:"var(--nav-text-color)"}}>
        <span className="font-medium">Old:</span>
        <span>{swap.oldTrailerNumber || "None"}</span>
        <ArrowRight className="w-3 h-3" style={{color:"var(--nav-text-color)"}} />
        <span className="font-medium">New:</span>
        <span>{swap.newTrailerNumber || "None"}</span>
      </div>
    </div>
);
})}

 {filteredSwaps.length === 0 && (
 <EmptyState icon="filter" title="No swaps match the current filters" description="Try changing your search or date range." />
)}
 </div>
 </div>
);
}