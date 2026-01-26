"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { calculateLoadAmount } from "../../../../convex/utils";

export default function DailyPlannerSheetsPage({ mode = "primary" }: { mode?: "primary" | "secondary" }) {
  return (
    <Suspense fallback={null}>
      <DailyPlannerSheetsContent mode={mode} />
    </Suspense>
  );
}

function DailyPlannerSheetsContent({ mode = "primary" }: { mode?: "primary" | "secondary" }) {
  // Mutations for lifecycle
  const markRouteCompleted = useMutation(api.dailyRoutes.markRouteCompleted);
  const lockRoute = useMutation(api.dailyRoutes.lockRoute);
  const unlockRoute = useMutation(api.dailyRoutes.unlockRoute);
  const deleteDailyRoute = useMutation(api.dailyRoutes.deleteDailyRoute);
  const deleteBulkDailyRoutes = useMutation(api.dailyRoutes.deleteBulkDailyRoutes);
  const undoBulkDelete = useMutation(api.dailyRoutes.undoBulkDelete);

  // State for loading actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Selection State
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());

  // Undo State
  const [showUndo, setShowUndo] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Id<"dailyRoutes">[]>([]);
  const [undoTimer, setUndoTimer] = useState<NodeJS.Timeout | null>(null);

  // Expand/Collapse State (progressive disclosure)
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  const toggleExpand = (routeId: string) => {
    setExpandedRouteId(prev => prev === routeId ? null : routeId);
  };

  // Sort and Filter State
  const [sortConfig, setSortConfig] = useState<{ column: string | null; direction: 'asc' | 'desc' }>({
    column: null,
    direction: 'asc',
  });

  const [filters, setFilters] = useState({
    date: '',
    truck: '',
    trailer: '',
    client: '',
    driver: '',
    from: '',
    to: '',
    status: [] as string[],
    amountMin: '',
    amountMax: '',
  });

  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null);

  // Sort handler
  const handleSort = (column: string) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Filter update handler
  const updateFilter = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      date: '',
      truck: '',
      trailer: '',
      client: '',
      driver: '',
      from: '',
      to: '',
      status: [],
      amountMin: '',
      amountMax: '',
    });
    setSortConfig({ column: null, direction: 'asc' });
  };

  // Apply filters and sorting
  const getFilteredAndSortedRoutes = (routesList: any[]) => {
    if (!routesList) return [];

    // Apply filters
    let filtered = routesList.filter(route => {
      // Date filter
      if (filters.date) {
        const dateStr = route.routeDate || '';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        const formatted = `${day}/${month}/${year}`;
        if (!formatted.toLowerCase().includes(filters.date.toLowerCase())) return false;
      }

      // Truck filter
      if (filters.truck && !(route.truckFleetNoStr || '').toLowerCase().includes(filters.truck.toLowerCase())) {
        return false;
      }

      // Trailer filter
      if (filters.trailer && !(route.trailerFleetNoStr || '').toLowerCase().includes(filters.trailer.toLowerCase())) {
        return false;
      }

      // Client filter
      if (filters.client && !(route.client || '').toLowerCase().includes(filters.client.toLowerCase())) {
        return false;
      }

      // Driver filter
      if (filters.driver && !(route.driverName || '').toLowerCase().includes(filters.driver.toLowerCase())) {
        return false;
      }

      // From filter
      if (filters.from) {
        const allFroms = route.loads?.flatMap((l: any) => l.fromLocations || []) || [];
        const fromDisplay = allFroms.join(' ');
        if (!fromDisplay.toLowerCase().includes(filters.from.toLowerCase())) return false;
      }

      // To filter
      if (filters.to) {
        const allTos = route.loads?.flatMap((l: any) => l.toLocations || []) || [];
        const toDisplay = allTos.join(' ');
        if (!toDisplay.toLowerCase().includes(filters.to.toLowerCase())) return false;
      }

      // Status filter
      if (filters.status.length > 0) {
        const riskStatus = getRouteRiskStatus(route);
        if (!filters.status.includes(riskStatus.label)) return false;
      }

      // Amount filter
      const amount = route.rate || 0;
      if (filters.amountMin && amount < parseFloat(filters.amountMin)) return false;
      if (filters.amountMax && amount > parseFloat(filters.amountMax)) return false;

      return true;
    });

    // Apply sorting
    if (sortConfig.column) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortConfig.column) {
          case 'date':
            aVal = a.routeDate || '';
            bVal = b.routeDate || '';
            break;
          case 'truck':
            aVal = a.truckFleetNoStr || '';
            bVal = b.truckFleetNoStr || '';
            break;
          case 'trailer':
            aVal = a.trailerFleetNoStr || '';
            bVal = b.trailerFleetNoStr || '';
            break;
          case 'client':
            aVal = a.client || '';
            bVal = b.client || '';
            break;
          case 'driver':
            aVal = a.driverName || '';
            bVal = b.driverName || '';
            break;
          case 'from':
            aVal = (a.loads?.flatMap((l: any) => l.fromLocations || []) || []).join(' ');
            bVal = (b.loads?.flatMap((l: any) => l.fromLocations || []) || []).join(' ');
            break;
          case 'to':
            aVal = (a.loads?.flatMap((l: any) => l.toLocations || []) || []).join(' ');
            bVal = (b.loads?.flatMap((l: any) => l.toLocations || []) || []).join(' ');
            break;
          case 'amount':
            aVal = a.rate || 0;
            bVal = b.rate || 0;
            break;
          case 'status':
            aVal = getRouteRiskStatus(a).label;
            bVal = getRouteRiskStatus(b).label;
            break;
          default:
            return 0;
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const comparison = String(aVal).localeCompare(String(bVal));
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  };

  const handleStatusChange = async (routeId: Id<"dailyRoutes">, action: "complete" | "lock" | "unlock") => {
    setActionLoading(routeId);
    try {
      if (action === "complete") {
        await markRouteCompleted({ id: routeId });
      } else if (action === "lock") {
        await lockRoute({ id: routeId });
      } else if (action === "unlock") {
        if (!window.confirm("Unlocking this route will allow edits and deletions. Are you sure?")) {
          return;
        }
        await unlockRoute({ id: routeId });
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (routeId: Id<"dailyRoutes">) => {
    if (!window.confirm("Are you sure you want to delete this route and all its loads?")) {
      return;
    }

    setActionLoading(routeId);
    try {
      await deleteDailyRoute({ id: routeId });
      setSelectedRouteIds(prev => {
        const next = new Set(prev);
        next.delete(routeId);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete route:", error);
      alert("Failed to delete route. It might be locked.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedRouteIds) as Id<"dailyRoutes">[];
    if (idsToDelete.length === 0) return;

    if (!window.confirm(`You are about to delete ${idsToDelete.length} routes and all associated loads.`)) {
      return;
    }

    try {
      await deleteBulkDailyRoutes({ ids: idsToDelete });
      setSelectedRouteIds(new Set());

      // Trigger Undo State
      setDeletedIds(idsToDelete);
      setShowUndo(true);

      // Clear previous timer if any
      if (undoTimer) clearTimeout(undoTimer);

      // Auto-hide after 15 seconds
      const timer = setTimeout(() => {
        setShowUndo(false);
        setDeletedIds([]);
      }, 15000);
      setUndoTimer(timer);

    } catch (error) {
      console.error("Failed to bulk delete:", error);
      alert("Failed to delete selected routes. Some might be locked.");
    }
  };

  const handleUndo = async () => {
    if (deletedIds.length === 0) return;

    try {
      await undoBulkDelete({ ids: deletedIds });
      setShowUndo(false);
      setDeletedIds([]);
      if (undoTimer) clearTimeout(undoTimer);
    } catch (error) {
      console.error("Failed to undo delete:", error);
      alert("Failed to undo deletion.");
    }
  };

  const toggleSelection = (routeId: string) => {
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) {
        next.delete(routeId);
      } else {
        next.add(routeId);
      }
      return next;
    });
  };

  const toggleSelectAll = (allRoutes: any[]) => {
    if (selectedRouteIds.size === allSelectableRoutes(allRoutes).length) {
      setSelectedRouteIds(new Set());
    } else {
      const selectable = allSelectableRoutes(allRoutes);
      setSelectedRouteIds(new Set(selectable.map(r => r._id)));
    }
  };

  const allSelectableRoutes = (allRoutes: any[]) => {
    return allRoutes.filter(r => (r.status || "planned") !== "locked");
  };

  // B. Date selector
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlDate = searchParams.get("date");

  // Date Mode State
  const [dateMode, setDateMode] = useState<"single" | "range">("single");

  // Single Date State (defaults to URL or today)
  const [singleDate, setSingleDate] = useState(() => {
    return urlDate || new Date().toISOString().split("T")[0];
  });

  // Range Date State (defaults to today)
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Sync state with URL changes (for single mode consistency)
  useEffect(() => {
    if (urlDate && urlDate !== singleDate) {
      setSingleDate(urlDate);
      setDateMode("single");
    }
  }, [urlDate]);

  const handleSingleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setSingleDate(newDate);

    // Update URL to keep Input screen in sync
    const params = new URLSearchParams(searchParams.toString());
    if (newDate) {
      params.set("date", newDate);
    } else {
      params.delete("date");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Normalize dates for query
  const startDate = dateMode === "single" ? singleDate : fromDate;
  const endDate = dateMode === "single" ? singleDate : toDate;
  const isRangeInvalid = dateMode === "range" && fromDate > toDate;

  // Fetch routes (using new range-capable query)
  const routes = useQuery(api.dailyRoutes.getForSheets, {
    startDate,
    endDate
  });

  // 1️⃣ Read reference data (queries)
  // Fetch all reference data to resolve names in-memory
  const trucks = useQuery(api.fleet.getTrucks);
  const trailers = useQuery(api.fleet.getTrailers);
  const drivers = useQuery(api.fleet.getDrivers);

  // Helper to resolve Truck
  const getTruckDisplay = (fleetNoStr?: string) => {
    if (!fleetNoStr) return "-";
    const truck = trucks?.find(t => t.truckFleetNo === fleetNoStr);
    if (!truck) return fleetNoStr; // Fallback to ID
    return (
      <span>
        <span className="font-medium text-gray-900">{truck.truckFleetNo}</span>
        <span className="text-gray-500 ml-1 text-xs">({truck.registration})</span>
      </span>
    );
  };

  // Helper to resolve Driver
  const getDriverDisplay = (driverName?: string) => {
    if (!driverName) return "-";
    // Currently dailyRoutes stores driverName directly, but if we had ID we would look it up.
    // The prompt says "Match route.driverId → drivers.driverId → driverName".
    // However, existing schema in dailyRoutes uses `driverName` field which stores the name directly (or ID?).
    // Checking dailyRoutes.ts schema: driverName: v.string().
    // Checking Input page: setDriverName(e.target.value) where value comes from drivers.map(d => d.value).
    // In fleet.ts listDrivers, value is d.driverName.
    // So dailyRoutes actually stores the Name directly right now based on previous steps.
    // BUT the prompt explicitly asks: "Match route.driverId → drivers.driverId → driverName".
    // AND "dailyRoutes fields: ... driverId ...".
    // My previous step wired Input to save `driverName` into `driverName` field.
    // Wait, let's check the schema again.
    // dailyRoutes schema has `driverName: v.string()`. It does NOT have `driverId`.
    // The prompt says "dailyRoutes fields: ... driverId ...".
    // This is a slight mismatch between Prompt's "Authoritative Schema" and Actual Schema.
    // ACTUAL SCHEMA (dailyRoutes.ts): driverName: v.string().
    // PROMPT SCHEMA: driverId: string.
    // 
    // If I strictly follow "Read dailyRoutes", I get `driverName`.
    // If I strictly follow "Match route.driverId", I might fail if the field is missing.
    // 
    // However, looking at the Input page I just wrote:
    // `const [driverName, setDriverName] = useState("");`
    // `createRoute({ ... driverName: driverName ... })`
    // 
    // So currently we are saving the Name, not the ID.
    // 
    // BUT, for trucks, we save `truckFleetNoStr`.
    // For trailers, we save `trailerFleetNoStr`.
    // 
    // To be safe and robust (and follow the "Resolve names" spirit), I will try to match whatever is in the field
    // against the driver list.
    // If `driverName` holds a name, it will display.
    // If it holds an ID (future refactor), we might need lookup.
    // 
    // Let's assume the field `driverName` in dailyRoutes IS the display value for now (as per Input wiring),
    // OR if it's an ID, we resolve it.
    // 
    // Actually, looking at `drivers` table schema in schema.ts:
    // `driverId`, `driverName`, `idNumber`, ...
    // 
    // If `dailyRoutes.driverName` holds "JONAS OLIFANT", then resolution is trivial (it's already resolved).
    // If `dailyRoutes.driverName` holds "drv-023", we need to resolve it.
    // 
    // Given the prompt says "Match route.driverId → drivers.driverId → driverName",
    // I will write a resolver that tries to find a driver where `driver.driverId === routeVal` OR `driver.driverName === routeVal`.
    // This covers both bases.

    const driver = drivers?.find(d => d.driverId === driverName || d.driverName === driverName);
    return driver ? driver.driverName : driverName;
  };

  // Helper to resolve Trailer
  const getTrailerDisplay = (fleetNoStr?: string) => {
    if (!fleetNoStr) return <span className="text-gray-300">-</span>;

    // fleetNoStr could be "114" string.
    // trailers table has trailerFleetNo (number) and trailerFleetNoStr (optional string).
    // We should match against either.
    const trailer = trailers?.find(t =>
      String(t.trailerFleetNo) === fleetNoStr || t.trailerFleetNoStr === fleetNoStr
    );

    if (!trailer) return <span className="text-gray-600">{fleetNoStr}</span>;

    // Resolve lengths
    // trailer.trailers is an array of objects { length, registration }
    const lengths = trailer.trailers?.map(t => t.length).join(" / ");

    return (
      <div className="flex flex-col">
        <span className="font-medium text-gray-900">
          {fleetNoStr} <span className="font-normal text-gray-500">({trailer.type})</span>
        </span>
        {lengths && (
          <span className="text-xs text-gray-400">
            {lengths}
          </span>
        )}
      </div>
    );
  };

  const formatZAR = (value: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Fleet-specific risk status computation (pure, no hooks/mutations)
  const getRouteRiskStatus = (route: any): { label: string; level: "red" | "yellow" | "green" | "blue" } => {
    const loads = route.loads || [];

    // Priority 1: 🔴 CRITICAL - Incomplete
    if (loads.length === 0) {
      return { label: "🔴 Incomplete", level: "red" };
    }

    const totalAmount = loads.reduce((sum: number, load: any) => {
      const qty = Number(load.quantity) || 0;
      const rate = Number(load.rate) || 0;
      const rateType = load.rateType || "per_unit";
      return sum + calculateLoadAmount(qty, rate, rateType);
    }, 0);

    const hasIncompleteLoad = loads.some((load: any) =>
      !load.client || !load.rate || !load.quantity
    );

    if (hasIncompleteLoad || totalAmount === 0) {
      return { label: "🔴 Incomplete", level: "red" };
    }

    // Priority 2: 🟡 WARNING - Missing KM
    const hasMissingKm = loads.some((load: any) => !load.kilometers || Number(load.kilometers) === 0);
    if (hasMissingKm) {
      return { label: "🟡 Missing KM", level: "yellow" };
    }

    // Priority 3: 🟡 WARNING - Multi-drop
    const allTos = loads.flatMap((load: any) => load.toLocations || []);
    const uniqueTos = new Set(allTos);
    if (uniqueTos.size > 1) {
      return { label: "🟡 Multi-drop", level: "yellow" };
    }

    // Priority 4: 🟡 WARNING - Multi-pick
    const allFroms = loads.flatMap((load: any) => load.fromLocations || []);
    const uniqueFroms = new Set(allFroms);
    if (uniqueFroms.size > 1) {
      return { label: "🟡 Multi-pick", level: "yellow" };
    }

    // Priority 5: 🔵 FINALIZED
    if (route.status === "locked") {
      return { label: "🔵 Finalized", level: "blue" };
    }

    // Priority 6: 🟢 CLEAN
    return { label: "🟢 Clean", level: "green" };
  };

  const unitMap: Record<string, string> = {
    tons: "t",
    pallets: "pallets",
    bales: "bales",
    bags: "bags",
  };

  const getStatusBadge = (status?: string, routeId?: Id<"dailyRoutes">) => {
    // Default to "planned" if no status (backward compatibility)
    const currentStatus = status || "planned";
    const isActionLoading = actionLoading === routeId;

    switch (currentStatus) {
      case "completed":
        return (
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              Completed
            </span>
            {routeId && (
              <button
                onClick={() => handleStatusChange(routeId, "lock")}
                disabled={isActionLoading}
                className="text-[10px] text-gray-500 hover:text-gray-900 underline disabled:opacity-50"
              >
                {isActionLoading ? "Locking..." : "Lock Route"}
              </button>
            )}
          </div>
        );
      case "locked":
        return (
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
              Locked
            </span>
            {routeId && (
              <button
                onClick={() => handleStatusChange(routeId, "unlock")}
                disabled={isActionLoading}
                className="text-[10px] text-gray-500 hover:text-gray-900 underline disabled:opacity-50"
              >
                {isActionLoading ? "Unlocking..." : "Unlock Route"}
              </button>
            )}
          </div>
        );
      case "planned":
      default:
        return (
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              Planned
            </span>
            {routeId && (
              <button
                onClick={() => handleStatusChange(routeId, "complete")}
                disabled={isActionLoading}
                className="text-[10px] text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
              >
                {isActionLoading ? "Saving..." : "Mark Completed"}
              </button>
            )}
          </div>
        );
    }
  };

  // RouteDetailsCard - Expanded view component (houses all load details + lifecycle actions)
  const RouteDetailsCard = ({
    route,
    isLocked,
    mode = "primary"
  }: {
    route: any;
    isLocked: boolean;
    mode?: "primary" | "secondary";
  }) => {
    const status = route.status || "planned";

    return (
      <div className={`px-3 pb-2 ${isLocked ? "opacity-75" : ""}`}>
        {/* Asset Details Section */}
        <div className="bg-gray-50/50 rounded-md border border-gray-100 p-3 mb-2">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-gray-500 font-medium block mb-1">Truck</span>
              <div>{getTruckDisplay(route.truckFleetNoStr)}</div>
            </div>
            <div>
              <span className="text-gray-500 font-medium block mb-1">Trailer</span>
              <div>{getTrailerDisplay(route.trailerFleetNoStr)}</div>
            </div>
            <div>
              <span className="text-gray-500 font-medium block mb-1">Driver</span>
              <div className="font-medium text-gray-900">{getDriverDisplay(route.driverName)}</div>
            </div>
          </div>
          {route.kilometers && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <span className="text-gray-500 font-medium text-xs">Route KM: </span>
              <span className="font-mono text-xs text-gray-900">{route.kilometers} km</span>
            </div>
          )}
          {route.notes && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <span className="text-gray-500 font-medium text-xs block mb-1">Notes</span>
              <p className="text-xs text-gray-700">{route.notes}</p>
            </div>
          )}
        </div>

        {/* Loads Table */}
        <div className="bg-gray-50/50 rounded-md border border-gray-100 overflow-hidden">
          {/* Loads Header */}
          <div className="grid grid-cols-12 gap-1 px-3 py-1 bg-gray-100/50 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-1">Client</div>
            <div className="col-span-2">From</div>
            <div className="col-span-2">To</div>
            <div className="col-span-1 text-right">KM</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-2 text-right">Amt</div>
          </div>

          {/* Loads Rows */}
          {route.loads && route.loads.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {route.loads.map((load: any, index: number) => {
                // Derived values for display
                const qty = Number(load.quantity) || 0;
                const rate = Number(load.rate) || 0;
                const rateType = load.rateType || "per_unit";
                const amount = calculateLoadAmount(qty, rate, rateType);
                const loadKm = Number(load.kilometers) || 0;
                const unit = unitMap[load.quantityType] || load.quantityType || "t";

                return (
                  <div key={index} className="grid grid-cols-12 gap-1 px-3 py-1 text-[10px] text-gray-600">
                    <div className="col-span-1 text-center font-mono text-gray-400">
                      {index + 1}
                    </div>
                    <div className="col-span-1 font-medium text-gray-900 truncate" title={load.client}>
                      {load.client}
                    </div>
                    <div className="col-span-2 flex flex-col justify-center min-h-[20px]">
                      {load.fromLocations && load.fromLocations.length > 0 ? (
                        load.fromLocations.map((loc: string, i: number) => (
                          <div key={i} className="truncate text-[10px] leading-tight" title={loc}>
                            • {loc}
                          </div>
                        ))
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                    <div className="col-span-2 flex flex-col justify-center min-h-[20px]">
                      {load.toLocations && load.toLocations.length > 0 ? (
                        load.toLocations.map((loc: string, i: number) => (
                          <div key={i} className="truncate text-[10px] leading-tight" title={loc}>
                            • {loc}
                          </div>
                        ))
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                    <div className="col-span-1 text-right font-mono text-gray-500">
                      {loadKm > 0 ? `${loadKm}km` : "-"}
                    </div>
                    <div className="col-span-1 text-right font-mono">
                      {qty} {unit}
                    </div>
                    <div className="col-span-2 text-right font-mono text-gray-500">
                      {rateType === "flat" ? (
                        <span className="text-[9px] bg-gray-100 px-1 py-0.5 rounded border border-gray-200">Flat</span>
                      ) : (
                        formatZAR(rate)
                      )}
                    </div>
                    <div className="col-span-2 text-right font-mono font-medium text-gray-900">
                      {formatZAR(amount)}
                    </div>
                  </div>
                );
              })}

              {/* Route KM Validation Footer */}
              {(() => {
                const totalLoadKm = route.loads.reduce((sum: number, l: any) => sum + (Number(l.kilometers) || 0), 0);
                const routeKm = route.kilometers || 0;
                const mismatch = totalLoadKm !== routeKm;

                if (mismatch && routeKm > 0) {
                  return (
                    <div className="px-3 py-1.5 bg-yellow-50 border-t border-yellow-100 text-[10px] text-yellow-800 flex items-center gap-2">
                      <span>⚠️</span>
                      <span className="font-medium">KM Mismatch:</span>
                      <span>Loads total {totalLoadKm} km ≠ Route total {routeKm} km</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ) : (
            <div className="px-3 py-2 text-center text-[10px] text-gray-400 italic">
              No loads
            </div>
          )}
        </div>

        {/* Lifecycle Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusBadge(status, route._id)}
          </div>
          {!isLocked && mode === "primary" && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/operations/daily-planner/edit/${route._id}`)}
                className="text-xs font-medium text-gray-600 hover:text-black hover:underline bg-transparent border-none p-0 cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(route._id)}
                disabled={actionLoading === route._id}
                className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const isLoading = routes === undefined || trucks === undefined || trailers === undefined || drivers === undefined;

  return (
    <div className="space-y-4">
      {/* A. Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Sheets</h1>
        <p className="text-gray-500 mt-1 text-xs">
          Read-only operational view
        </p>
      </div>

      {/* B. Date selector */}
      <div className="bg-white p-3 rounded-lg border shadow-sm w-fit">
        {/* Mode Selector */}
        <div className="flex gap-4 mb-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={dateMode === "single"}
              onChange={() => setDateMode("single")}
              className="h-3 w-3 text-black focus:ring-black"
            />
            <span className="text-xs font-medium text-gray-700">Single Date</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={dateMode === "range"}
              onChange={() => setDateMode("range")}
              className="h-3 w-3 text-black focus:ring-black"
            />
            <span className="text-xs font-medium text-gray-700">Date Range</span>
          </label>
        </div>

        {/* Single Mode Input */}
        {dateMode === "single" && (
          <div>
            <input
              type="date"
              value={singleDate}
              onChange={handleSingleDateChange}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>
        )}

        {/* Range Mode Inputs */}
        {dateMode === "range" && (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <div>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
              <span className="text-gray-400 text-xs">→</span>
              <div>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            </div>
            {isRangeInvalid && (
              <p className="text-xs text-red-600 font-medium animate-pulse">
                ⚠ From date cannot be after To date
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {mode === "primary" && selectedRouteIds.size > 0 && (
        <div className="bg-black text-white px-6 py-3 rounded-lg flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="font-medium text-sm">
            {selectedRouteIds.size} route{selectedRouteIds.size === 1 ? "" : "s"} selected
          </div>
          <button
            onClick={handleBulkDelete}
            className="bg-white text-black px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors"
          >
            Delete Selected
          </button>
        </div>
      )}

      {/* Undo Toast */}
      {showUndo && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-4 fade-in">
          <div>
            <p className="font-medium text-sm">Routes deleted</p>
            <p className="text-xs text-gray-400">Action can be undone for 15s</p>
          </div>
          <button
            onClick={handleUndo}
            className="bg-white text-black px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors"
          >
            Undo
          </button>
          <button
            onClick={() => setShowUndo(false)}
            className="text-gray-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Clear Filters Bar */}
      {(filters.date || filters.truck || filters.trailer || filters.driver || filters.from || filters.to || filters.status.length > 0 || filters.amountMin || filters.amountMax || sortConfig.column) && (
        <div className="bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="font-medium">Active filters:</span>
            {Object.entries(filters).filter(([key, val]) => Array.isArray(val) ? val.length > 0 : !!val).map(([key]) => (
              <span key={key} className="bg-white px-2 py-0.5 rounded border border-gray-300 capitalize">
                {key}
              </span>
            ))}
            {sortConfig.column && (
              <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Sorted: {sortConfig.column} {sortConfig.direction === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </div>
          <button
            onClick={clearFilters}
            className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* C. Route list (core) */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden relative">
        {/* Table Header */}
        <div className={`grid ${mode === "primary" ? "grid-cols-14" : "grid-cols-13"} gap-2 bg-gray-50 px-3 py-2 border-b text-[10px] font-semibold text-gray-500 uppercase tracking-wider items-center`}>
          {mode === "primary" && (
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                className="h-3 w-3 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                checked={
                  routes
                    ? selectedRouteIds.size === allSelectableRoutes(getFilteredAndSortedRoutes(routes)).length &&
                    allSelectableRoutes(getFilteredAndSortedRoutes(routes)).length > 0
                    : false
                }
                onChange={() => {
                  if (routes) toggleSelectAll(getFilteredAndSortedRoutes(routes));
                }}
                disabled={!routes || allSelectableRoutes(getFilteredAndSortedRoutes(routes)).length === 0}
              />
            </div>
          )}

          {/* Chevron header */}
          <div className="col-span-1">▸</div>

          {/* Date Column Header */}
          <div className="col-span-1 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('date')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Date
                {sortConfig.column === 'date' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'date' ? null : 'date');
                }}
                className={`text-gray-400 hover:text-black ${filters.date ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'date' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter date..."
                  value={filters.date}
                  onChange={(e) => updateFilter('date', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* Truck Column Header */}
          <div className="col-span-1 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('truck')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Truck
                {sortConfig.column === 'truck' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'truck' ? null : 'truck');
                }}
                className={`text-gray-400 hover:text-black ${filters.truck ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'truck' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter truck..."
                  value={filters.truck}
                  onChange={(e) => updateFilter('truck', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* Trailer Column Header */}
          <div className="col-span-1 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('trailer')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Trailer
                {sortConfig.column === 'trailer' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'trailer' ? null : 'trailer');
                }}
                className={`text-gray-400 hover:text-black ${filters.trailer ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'trailer' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter trailer..."
                  value={filters.trailer}
                  onChange={(e) => updateFilter('trailer', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* Client Column Header */}
          <div className="col-span-1 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('client')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Client
                {sortConfig.column === 'client' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'client' ? null : 'client');
                }}
                className={`text-gray-400 hover:text-black ${filters.client ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'client' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter client..."
                  value={filters.client}
                  onChange={(e) => updateFilter('client', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* Driver Column Header */}
          <div className="col-span-2 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('driver')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Driver
                {sortConfig.column === 'driver' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'driver' ? null : 'driver');
                }}
                className={`text-gray-400 hover:text-black ${filters.driver ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'driver' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter driver..."
                  value={filters.driver}
                  onChange={(e) => updateFilter('driver', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* From Column Header */}
          <div className="col-span-2 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('from')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                From
                {sortConfig.column === 'from' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'from' ? null : 'from');
                }}
                className={`text-gray-400 hover:text-black ${filters.from ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'from' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter from..."
                  value={filters.from}
                  onChange={(e) => updateFilter('from', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* To Column Header */}
          <div className="col-span-2 relative">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSort('to')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                To
                {sortConfig.column === 'to' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'to' ? null : 'to');
                }}
                className={`text-gray-400 hover:text-black ${filters.to ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'to' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  type="text"
                  placeholder="Filter to..."
                  value={filters.to}
                  onChange={(e) => updateFilter('to', e.target.value)}
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* Amount Column Header */}
          <div className="col-span-1 relative text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => handleSort('amount')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Amount
                {sortConfig.column === 'amount' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'amount' ? null : 'amount');
                }}
                className={`text-gray-400 hover:text-black ${(filters.amountMin || filters.amountMax) ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'amount' && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <div className="space-y-2">
                  <input
                    type="number"
                    placeholder="Min amount"
                    value={filters.amountMin}
                    onChange={(e) => updateFilter('amountMin', e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    type="number"
                    placeholder="Max amount"
                    value={filters.amountMax}
                    onChange={(e) => updateFilter('amountMax', e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Status Column Header */}
          <div className="col-span-1 relative text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => handleSort('status')}
                className="hover:text-black transition-colors flex items-center gap-0.5"
              >
                Status
                {sortConfig.column === 'status' && (
                  <span className="text-blue-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilterDropdown(showFilterDropdown === 'status' ? null : 'status');
                }}
                className={`text-gray-400 hover:text-black ${filters.status.length > 0 ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'status' && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                {['🔴 Incomplete', '🟡 Missing KM', '🟡 Multi-drop', '🟡 Multi-pick', '🔵 Finalized', '🟢 Clean'].map(status => (
                  <label key={status} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(status)}
                      onChange={(e) => {
                        const newStatus = e.target.checked
                          ? [...filters.status, status]
                          : filters.status.filter(s => s !== status);
                        updateFilter('status', newStatus);
                      }}
                      className="h-3 w-3 rounded border-gray-300"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{status}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Close dropdown when clicking outside */}
        {showFilterDropdown && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowFilterDropdown(null)}
          />
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-xs">
            Loading...
          </div>
        ) : getFilteredAndSortedRoutes(routes).length === 0 ? (
          /* Empty State */
          <div className="p-8 text-center">
            <p className="text-gray-500 font-medium text-sm">No routes</p>
            <p className="text-gray-400 text-xs mt-1">
              {routes.length > 0 ? 'No routes match your filters.' : 'Select a date or add routes.'}
            </p>
          </div>
        ) : (
          /* Route Rows */
          <div className="divide-y divide-gray-200">
            {getFilteredAndSortedRoutes(routes).map((route) => {
              const status = (route as any).status || "planned";
              const isLocked = status === "locked";
              const isSelected = selectedRouteIds.has(route._id);
              const isExpanded = expandedRouteId === route._id;
              const riskStatus = getRouteRiskStatus(route);

              // Derive From/To from loads
              const allFroms = route.loads?.flatMap((l: any) => l.fromLocations || []) || [];
              const uniqueFroms = [...new Set(allFroms)];
              const fromDisplay = uniqueFroms.join(" • ") || "-";

              const allTos = route.loads?.flatMap((l: any) => l.toLocations || []) || [];
              const uniqueTos = [...new Set(allTos)];
              const toDisplay = uniqueTos.join(" → ") || "-";

              // Status badge color mapping
              const statusBgColor = {
                red: "bg-red-100 text-red-800",
                yellow: "bg-yellow-100 text-yellow-800",
                green: "bg-green-100 text-green-800",
                blue: "bg-blue-100 text-blue-800",
              }[riskStatus.level];

              return (
                <div
                  key={route._id}
                  className={`group transition-colors ${isLocked ? "bg-gray-50/50 hover:bg-gray-50" : "hover:bg-gray-50"} ${isSelected ? "bg-blue-50/50" : ""}`}
                >
                  {/* Collapsed Summary Row */}
                  <div
                    className={`grid ${mode === "primary" ? "grid-cols-14" : "grid-cols-13"} gap-2 px-3 py-2 items-center text-xs cursor-pointer ${isLocked ? "opacity-75" : ""}`}
                    onClick={() => toggleExpand(route._id)}
                  >
                    {/* Checkbox */}
                    {mode === "primary" && (
                      <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-gray-300 text-black focus:ring-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          checked={Boolean(isSelected)}
                          onChange={() => toggleSelection(route._id)}
                          disabled={isLocked}
                        />
                      </div>
                    )}

                    {/* Chevron - Keep for expand/collapse but make subtle */}
                    <div className="col-span-1">
                      <button
                        className="text-gray-400 hover:text-black focus:outline-none transition-colors"
                        aria-expanded={isExpanded}
                        aria-label="Expand route details"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(route._id);
                        }}
                      >
                        {isExpanded ? "▾" : "▸"}
                      </button>
                    </div>

                    {/* Date */}
                    <div className="col-span-1 text-gray-600 text-[11px] font-mono truncate">
                      {route.routeDate ? (() => {
                        const date = new Date(route.routeDate);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = String(date.getFullYear()).slice(-2);
                        return `${day}/${month}/${year}`;
                      })() : "-"}
                    </div>

                    {/* Truck (Fleet Number Only) */}
                    <div className="col-span-1 font-medium text-gray-900 truncate">
                      {route.truckFleetNoStr || "-"}
                    </div>

                    {/* Trailer (Fleet Number Only) */}
                    <div className="col-span-1 text-gray-600 truncate">
                      {route.trailerFleetNoStr || "-"}
                    </div>

                    {/* Client */}
                    <div className="col-span-1 text-gray-700 font-medium truncate" title={route.client}>
                      {route.client || "-"}
                    </div>

                    {/* Driver */}
                    <div className="col-span-2 text-gray-700 font-medium truncate" title={route.driverName}>
                      {getDriverDisplay(route.driverName)}
                    </div>

                    {/* From */}
                    <div className="col-span-2 text-gray-600 truncate" title={fromDisplay}>
                      {fromDisplay}
                    </div>

                    {/* To */}
                    <div className="col-span-2 text-gray-600 truncate" title={toDisplay}>
                      {toDisplay}
                    </div>

                    {/* Amount */}
                    <div className="col-span-1 text-right font-mono font-medium text-gray-900">
                      {formatZAR(route.rate || 0)}
                    </div>

                    {/* Risk Status Badge */}
                    <div className="col-span-1 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusBgColor}`}>
                        {riskStatus.label}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail Card */}
                  {isExpanded && (
                    <RouteDetailsCard route={route} isLocked={isLocked} mode={mode} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
