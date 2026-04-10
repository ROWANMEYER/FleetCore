"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSearchParams, useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { calculateLoadAmount } from "@/convex/utils";
import { SheetExportRow } from "@/src/types/sheetExport";
import { exportCSV } from "@/src/lib/exports/exportCSV";
import { exportJSON } from "@/src/lib/exports/exportJSON";
import { exportExcelWithTemplate } from "@/src/lib/exports/exportExcelWithTemplate";
import { exportPDF } from "@/src/lib/exports/exportPDF";
import { generateInvoicePDF } from "@/src/pdf/invoiceTemplate";
import { buildInvoiceData } from "@/src/pdf/invoiceBuilder";
import { InvoiceData } from "@/src/pdf/types";
import InvoiceDeliveryPanel from "@/src/components/operations/invoice/InvoiceDeliveryPanel";
import ImportLoadsModal from "./ImportLoadsModal";

function parseNumberSafe(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

// --- Export Utilities ---

function mapSheetsToExportRows(sheets: any[]): SheetExportRow[] {
  return sheets.map((s) => {
    const routeKm = Number(s.kilometers) || 0;
    
    // Calculate total revenue from all loads (same as RouteDetailsCard)
    const totalRevenue = (s.loads ?? []).reduce((sum: number, l: any) => {
      const qty = parseNumberSafe(l.quantity);
      const rate = parseNumberSafe(l.rate);
      return sum + calculateLoadAmount(qty, rate, l.rateType || "per_unit");
    }, 0);
    
    const amount = totalRevenue; // Actual total revenue from all loads
    const ratePerKm = routeKm > 0 ? Number((amount / routeKm).toFixed(2)) : 0;
    
    // Flatten locations
    const allFroms = s.loads?.flatMap((l: any) => l.fromLocations || []) || [];
    const allTos = s.loads?.flatMap((l: any) => l.toLocations || []) || [];
    const uniqueFroms = Array.from(new Set(allFroms)).join(", ");
    const uniqueTos = Array.from(new Set(allTos)).join(", ");

    // Status: Capitalize or use mapped status
    const statusMap: Record<string, string> = {
      "planned": "Planned",
      "completed": "Completed",
      "locked": "Locked"
    };
    const status = statusMap[s.status] || s.status || "Planned";

    return {
      date: s.routeDate || "",
      truck: s.truckFleetNo?.toString() ?? s.truckFleetNoStr ?? "",
      trailer: s.trailerFleetNo?.toString() ?? s.trailerFleetNoStr ?? "",
      driver: s.driverName || "",
      client: s.client || "",
      from: uniqueFroms,
      to: uniqueTos,
      routeKm,
      amount,
      ratePerKm,
      status,
    };
  });
}

function ExportDropdown({ onExport }: { onExport: (type: 'csv' | 'excel' | 'json' | 'pdf') => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/0 backdrop-blur-lg border border-white/20 px-4 py-2 rounded-md text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-black shadow-sm transition-all"
      >
        <span>Export</span>
        <span className="text-xs text-gray-500">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white/80 backdrop-blur-lg border border-white/40 rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-2">
            <button
              onClick={() => { onExport('excel'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-white/20 flex items-center gap-2"
            >
              <span className="text-green-600 font-bold">xlsx</span> Excel
            </button>
            <button
              onClick={() => { onExport('csv'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-white/20 flex items-center gap-2"
            >
              <span className="text-blue-600 font-bold">csv</span> CSV
            </button>
            <button
              onClick={() => { onExport('json'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-white/20 flex items-center gap-2"
            >
              <span className="text-yellow-600 font-bold">json</span> JSON
            </button>
            <button
              onClick={() => { onExport('pdf'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 hover:bg-white/20 flex items-center gap-2"
            >
              <span className="text-red-600 font-bold">pdf</span> PDF (with KPIs & Charts)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- End Export Utilities ---

export default function DailyPlannerSheetsPage({ mode = "primary" }: { mode?: "primary" | "secondary" }) {
  return (
    <Suspense fallback={null}>
      <DailyPlannerSheetsContent mode={mode} />
    </Suspense>
  );
}

function DailyPlannerSheetsContent({ mode = "primary" }: { mode?: "primary" | "secondary" }) {
  // TRAE-FIX: Hydration Mismatch Fix
  // 1. Track mount state (client-only enhancement)
  const [isMounted, setIsMounted] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // TRAE-FIX: Remove conditional layout logic
  // "mode" is used for logic, but we must NOT change the grid structure based on it during render.
  // We force a 17-column layout always.

  // 3. Confirmation Dialog State (replacing window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isLoading?: boolean;
    confirmText?: string;
    confirmStyle?: "danger" | "primary" | "neutral";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isLoading: false,
    confirmText: "Confirm",
    confirmStyle: "primary"
  });

  const closeConfirm = () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  };

  // Mutations for lifecycle
  const markRouteCompleted = useMutation(api.dailyRoutes.markRouteCompleted);
  const lockRoute = useMutation(api.dailyRoutes.lockRoute);
  const unlockRoute = useMutation(api.dailyRoutes.unlockRoute);
  const deleteDailyRoute = useMutation(api.dailyRoutes.deleteDailyRoute);
  const deleteBulkDailyRoutes = useMutation(api.dailyRoutes.deleteBulkDailyRoutes);

  // State for loading actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Selection State
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());

  // Undo State

  // Side panel state (replaces inline expand/collapse)
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);

  const openPanel = (route: any) => setSelectedRoute(route);
  const closePanel = () => setSelectedRoute(null);

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
    // 1. Reset generic filters
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

    // 2. Reset Date Query to Defaults (Today)
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentMonth = today.slice(0, 7);
    setSingleDate(today);
    setFromDate(today);
    setToDate(today);
    setSelectedMonth(currentMonth);
    setDateMode("single");

    // 3. Clear URL params
    const params = new URLSearchParams(searchParams.toString());
    params.delete("date");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Apply filters and sorting
  const getFilteredAndSortedRoutes = (routesList: any[]) => {
    if (!routesList) return [];

    // Apply filters
    const filtered = routesList.filter(route => {
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
      if (filters.truck && !(route.truckFleetNo?.toString() ?? route.truckFleetNoStr ?? '').toLowerCase().includes(filters.truck.toLowerCase())) {
        return false;
      }

      // Trailer filter
      if (filters.trailer && !(route.trailerFleetNo?.toString() ?? route.trailerFleetNoStr ?? '').toLowerCase().includes(filters.trailer.toLowerCase())) {
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
            aVal = a.truckFleetNo?.toString() ?? a.truckFleetNoStr ?? '';
            bVal = b.truckFleetNo?.toString() ?? b.truckFleetNoStr ?? '';
            break;
          case 'trailer':
            aVal = a.trailerFleetNo?.toString() ?? a.trailerFleetNoStr ?? '';
            bVal = b.trailerFleetNo?.toString() ?? b.trailerFleetNoStr ?? '';
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
    if (action === "unlock") {
      setConfirmDialog({
        isOpen: true,
        title: "Unlock Route",
        message: "Unlocking this route will allow edits and deletions. Are you sure?",
        confirmText: "Unlock",
        confirmStyle: "neutral",
        onConfirm: async () => {
          setActionLoading(routeId);
          try {
            await unlockRoute({ id: routeId });
            closeConfirm();
          } catch (error) {
            console.error("Failed to update status:", error);
            alert("Failed to update status. Please try again.");
            closeConfirm();
          } finally {
            setActionLoading(null);
          }
        }
      });
      return;
    }

    setActionLoading(routeId);
    try {
      if (action === "complete") {
        await markRouteCompleted({ id: routeId });
      } else if (action === "lock") {
        await lockRoute({ id: routeId });
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update status. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (routeId: Id<"dailyRoutes">) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Route",
      message: "Are you sure you want to delete this route and all its loads?",
      confirmText: "Delete",
      confirmStyle: "danger",
      onConfirm: async () => {
        setActionLoading(routeId);
        try {
          await deleteDailyRoute({ id: routeId });
          setSelectedRouteIds(prev => {
            const next = new Set(prev);
            next.delete(routeId);
            return next;
          });
          closeConfirm();
        } catch (error) {
          console.error("Failed to delete route:", error);
          alert("Failed to delete route. It might be locked.");
          closeConfirm();
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedRouteIds) as Id<"dailyRoutes">[];
    if (idsToDelete.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: "Bulk Delete",
      message: `You are about to delete ${idsToDelete.length} routes and all associated loads.`,
      confirmText: "Delete All",
      confirmStyle: "danger",
      onConfirm: async () => {
        try {
          await deleteBulkDailyRoutes({ ids: idsToDelete });
          setSelectedRouteIds(new Set());
          closeConfirm();
        } catch (error) {
          console.error("Failed to bulk delete:", error);
          alert("Failed to delete selected routes. Some might be locked.");
          closeConfirm();
        }
      }
    });
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
  const [dateMode, setDateMode] = useState<"single" | "range" | "month">("single");

  // Single Date State (defaults to URL or today - SAFE INIT)
  const [singleDate, setSingleDate] = useState(""); 

  // Range Date State (defaults to today - SAFE INIT)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Month State (defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState("");

  // Sync state with URL changes and Init Defaults
  useEffect(() => {
    // Set defaults on mount (client-only)
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentMonth = today.slice(0, 7); // YYYY-MM
    
    if (urlDate && urlDate !== singleDate) {
      setSingleDate(urlDate);
      setDateMode("single");
    } else if (!singleDate) {
      setSingleDate(today);
    }

    if (!fromDate) setFromDate(today);
    if (!toDate) setToDate(today);
    if (!selectedMonth) setSelectedMonth(currentMonth);
  }, [urlDate]); // Run on mount and URL change

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
  // Wait for initialization
  const calculateDates = () => {
    if (dateMode === "single") {
      return { start: singleDate, end: singleDate };
    }
    if (dateMode === "range") {
      return { start: fromDate, end: toDate };
    }
    if (dateMode === "month" && selectedMonth) {
      const [year, month] = selectedMonth.split("-").map(Number);
      // Use UTC dates to avoid timezone offset issues
      const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().split("T")[0];
      const end = new Date(Date.UTC(year, month, 0)).toISOString().split("T")[0];
      return { start, end };
    }
    return { start: singleDate, end: singleDate };
  };

  const { start: startDate, end: endDate } = calculateDates();
  const isRangeInvalid = dateMode === "range" && fromDate > toDate;
  const isDatesReady = startDate && endDate; // Ensure dates are initialized

  // Fetch routes (using new range-capable query)
  const routes = useQuery(api.dailyRoutes.getForSheets, isDatesReady ? {
    startDate,
    endDate
  } : "skip");

  // Sync selectedRoute with updated data from routes query after edits
  useEffect(() => {
    if (selectedRoute && routes) {
      const updatedRoute = routes.find(r => r._id === selectedRoute._id);
      if (updatedRoute) {
        setSelectedRoute(updatedRoute);
      }
    }
  }, [routes, selectedRoute]);

  // 1️⃣ Read reference data (queries)
  // Fetch all reference data to resolve names in-memory
  const trucks = useQuery(api.fleet.getTrucks, {});
  const trailers = useQuery(api.fleet.getTrailers, {});
  const drivers = useQuery(api.fleet.getDrivers, {});
  const customers = useQuery(api.customers.list, {});

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

  const formatZAR = (value: number) => {
    // [HYDRATION SAFE] Use deterministic formatting
    const parts = value.toFixed(2).split(".");
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `R ${integerPart},${parts[1]}`;
  };

  // Fleet-specific risk status computation (pure, no hooks/mutations)
  const getRouteRiskStatus = (route: any): { label: string; level: "red" | "yellow" | "green" | "blue" } => {
    const loads = route.loads || [];

    // Priority 1: 🔴 CRITICAL - Incomplete
    if (loads.length === 0) {
      return { label: "🔴 Incomplete", level: "red" };
    }

    const totalAmount = loads.reduce((sum: number, load: any) => {
      const qty = parseNumberSafe(load.quantity);
      const rate = parseNumberSafe(load.rate);
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
    // Check effective route KM (stored in route.kilometers which respects Route KM > Max Load KM)
    const effectiveKm = Number(route.kilometers) || 0;
    if (effectiveKm === 0) {
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

  const RouteDetailsCard = ({
    route,
    isLocked,
    mode = "primary",
    onDrillDown
  }: {
    route: any;
    isLocked: boolean;
    mode?: "primary" | "secondary";
    onDrillDown?: (route: any) => void;
  }) => {
    const status = route.status || "planned";
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [currentPdfBlob, setCurrentPdfBlob] = useState<Blob | null>(null);
    const [currentInvoiceData, setCurrentInvoiceData] = useState<InvoiceData | null>(null);

    // Resolve assets
    const truck = trucks?.find(t => t.truckFleetNo === route.truckFleetNoStr);
    const truckReg = truck?.registration || "";
    const trailer = trailers?.find(t =>
      String(t.trailerFleetNo) === route.trailerFleetNoStr || t.trailerFleetNoStr === route.trailerFleetNoStr
    );
    const trailerType = trailer?.type || "";
    const trailerLength = (trailer as any)?.trailers?.[0]?.length || (trailer as any)?.length || "";

    // Derived metrics
    const routeKm = Number(route.kilometers) || 0;
    const totalRevenue = (route.loads ?? []).reduce((sum: number, l: any) => {
      const qty = parseNumberSafe(l.quantity);
      const rate = parseNumberSafe(l.rate);
      return sum + calculateLoadAmount(qty, rate, l.rateType || "per_unit");
    }, 0);
    const rPerKm = routeKm > 0 ? totalRevenue / routeKm : 0;
    const totalQty = (route.loads ?? []).reduce((sum: number, l: any) => sum + parseNumberSafe(l.quantity), 0);
    const qtyUnit = route.loads?.[0]?.quantityType || "t";
    const maxCapacity = qtyUnit === "bales" ? 490 : 34; // 490 bales or 34 tons
    const capacityLabel = qtyUnit === "bales" ? "bales" : "T";
    const allFroms = [...new Set((route.loads ?? []).flatMap((l: any) => l.fromLocations ?? []))];
    const allTos = [...new Set((route.loads ?? []).flatMap((l: any) => l.toLocations ?? []))];

    // Last 7 routes for this truck (revenue chart)
    const recentRoutes = useQuery(api.dailyRoutes.getRecentRoutesByTruck, {
      truckFleetNoStr: route.truckFleetNoStr ?? "",
      limit: 7,
    });
    const chartMax = recentRoutes ? Math.max(...recentRoutes.map((r: any) => Number(r.rate) || 0), 1) : 1;
    const avgRevenue = recentRoutes && recentRoutes.length > 0
      ? recentRoutes.reduce((s: number, r: any) => s + (Number(r.rate) || 0), 0) / recentRoutes.length
      : 0;

    // Invoice helpers
    const serializeInvoiceData = (data: any) => ({ ...data, date: data.date instanceof Date ? data.date.toISOString() : data.date });
    const deserializeInvoiceData = (data: any) => ({ ...data, date: new Date(data.date) });
    const saveInvoice = useMutation(api.invoices.getOrCreate);

    const handleGenerateProforma = async () => {
      const errors: string[] = [];
      if (!route.client) errors.push("Client");
      if (!route.rate || Number(route.rate) <= 0) errors.push("Rate");
      const hasFrom = route.loads?.some((l: any) => l.fromLocations?.length > 0) || route.fromLocation;
      const hasTo = route.loads?.some((l: any) => l.toLocations?.length > 0) || route.toLocations?.length > 0;
      if (!hasFrom) errors.push("From location");
      if (!hasTo) errors.push("To location");
      if (!route.driverName) errors.push("Driver");
      if (!route.truckFleetNoStr) errors.push("Truck");
      if (errors.length > 0) { alert(`Cannot generate invoice. Missing:\n- ${errors.join("\n- ")}`); return; }
      try {
        const finalSnapshot = await saveInvoice({ routeId: route._id, invoiceData: serializeInvoiceData(buildInvoiceData(route, customers)) });
        const finalData = deserializeInvoiceData(finalSnapshot);
        const doc = generateInvoicePDF(finalData);
        setCurrentInvoiceData(finalData);
        setCurrentPdfBlob(doc.output("blob"));
        setIsInvoiceModalOpen(true);
      } catch { alert("Failed to generate invoice."); }
    };

    const statusColour = status === "locked" ? "bg-gray-100 text-gray-700 border-gray-300"
      : status === "completed" ? "bg-green-50 text-green-700 border-green-300"
      : "bg-blue-50 text-blue-700 border-blue-300";
    const statusLabel = status === "locked" ? "● LOCKED" : status === "completed" ? "● COMPLETED" : "● PLANNED";

    return (
      <div className="p-5 space-y-5 text-gray-900">

        {/* ── Breadcrumb + status ── */}
        <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium uppercase tracking-wider">
          <span>Fleet › Routes › Truck {route.truckFleetNoStr} · {route.routeDate}</span>
          <span className={`px-3 py-1 rounded-full border text-[10px] font-bold ${statusColour}`}>{statusLabel}</span>
        </div>

        {/* ── Title + actions ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              Truck {route.truckFleetNoStr}
              <span className="text-gray-400 font-light ml-2">/ Route Detail</span>
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {[truckReg, trailerType, trailerLength ? `${trailerLength}m` : "", route.routeDate, route.client].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!isLocked && mode === "primary" && (
            <div className="flex gap-2 shrink-0">
              {status === "completed" && (
                <button onClick={() => handleStatusChange(route._id, "lock")}
                  className="px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50">
                  LOCK ROUTE
                </button>
              )}
              {status === "planned" && (
                <button onClick={() => handleStatusChange(route._id, "complete")}
                  className="px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50">
                  COMPLETE
                </button>
              )}
              <button onClick={() => { const p = new URLSearchParams(searchParams.toString()); p.set("editRouteId", route._id); router.push(`?${p.toString()}`); }}
                className="px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50">
                EDIT
              </button>
              <button onClick={() => handleDelete(route._id)} disabled={actionLoading === route._id}
                className="px-3 py-1.5 text-xs font-bold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40">
                DELETE
              </button>
            </div>
          )}
          {isLocked && (
            <button onClick={() => handleStatusChange(route._id, "unlock")}
              className="px-3 py-1.5 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50 shrink-0">
              UNLOCK
            </button>
          )}
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "TOTAL REVENUE", value: formatZAR(totalRevenue), sub: null, accent: "border-l-blue-500" },
            { label: "DISTANCE", value: `${routeKm} km`, sub: allFroms[0] && allTos[0] ? `${allFroms[0]} → ${allTos[0]}` : null, accent: "border-l-green-500" },
            { label: "LOAD WEIGHT", value: `${totalQty} ${unitMap[qtyUnit] || qtyUnit}`, sub: route.loads?.[0]?.rateType === "flat" ? "Flat rate" : null, accent: "border-l-orange-400" },
            { label: "R / KM", value: `R ${rPerKm.toFixed(2)}`, sub: rPerKm >= 30 ? "Efficient" : rPerKm > 0 ? "Below avg" : "—", accent: "border-l-purple-500" },
          ].map((k) => (
            <div key={k.label} className={`bg-white border border-gray-200 rounded-xl p-3 border-l-4 ${k.accent}`}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{k.label}</p>
              <p className="text-lg font-black mt-1">{k.value}</p>
              {k.sub && <p className="text-[10px] text-gray-500 mt-0.5">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Revenue chart + Load gauge ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue last 7 routes */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Revenue · Last {recentRoutes?.length ?? 0} Routes</p>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Truck {route.truckFleetNoStr}</span>
            </div>
            {!recentRoutes ? (
              <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
            ) : (
              <div className="flex items-end gap-1 h-24">
                {recentRoutes.map((r: any, i: number) => {
                  const rev = Number(r.rate) || 0;
                  const pct = (rev / chartMax) * 100;
                  const isThis = r._id === route._id;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end cursor-pointer group" style={{ height: "72px" }} onClick={() => onDrillDown?.(r)} title="Click to view route details">
                        <div
                          className={`w-full rounded-t transition-all ${isThis ? "bg-blue-600" : "bg-blue-200 group-hover:bg-blue-400"}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className="text-[8px] text-gray-400 truncate w-full text-center">
                        {r.routeDate?.slice(5)}
                      </span>
                    </div>
                  );
                })}
                {/* avg line overlay */}
              </div>
            )}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-600 inline-block" /> Revenue (R)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1 bg-yellow-400 inline-block" /> Avg {formatZAR(avgRevenue)}</span>
            </div>
          </div>

          {/* Load vs capacity gauge */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center">
            <div className="flex items-center justify-between w-full mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-700">Load vs Capacity</p>
              <span className="text-[10px] font-bold text-gray-500">{totalQty} {capacityLabel} / {maxCapacity} {capacityLabel}</span>
            </div>
            {/* Semicircle gauge */}
            <div className="relative w-28 h-14 overflow-hidden">
              <div className="absolute inset-0 rounded-t-full border-8 border-gray-100" style={{ borderBottomColor: "transparent" }} />
              <div
                className="absolute inset-0 rounded-t-full border-8 border-blue-600 transition-all"
                style={{
                  borderBottomColor: "transparent",
                  clipPath: `inset(0 ${100 - Math.min((totalQty / maxCapacity) * 100, 100)}% 0 0)`,
                }}
              />
            </div>
            <p className="text-2xl font-black text-blue-600 mt-1">{Math.round((totalQty / maxCapacity) * 100)}%</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {totalQty >= maxCapacity ? "Full load · optimal utilisation" : `${(maxCapacity - totalQty).toFixed(1)} ${capacityLabel} remaining capacity`}
            </p>
          </div>
        </div>

        {/* ── Route profile ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-700 mb-3">Route Profile</p>

          {/* Journey line */}
          <div className="relative mb-1">
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 bg-blue-600 rounded-full w-full" />
            </div>
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow" />
          </div>
          <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
            <span>{allFroms.join(", ") || "—"}</span>
            <span>{allTos.join(", ") || "—"}</span>
          </div>
          {routeKm > 0 && <p className="text-center text-[10px] text-gray-400 mb-3">{routeKm} km total</p>}

          {/* Loads table */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Client</div>
              <div className="col-span-2">From</div>
              <div className="col-span-2">To</div>
              <div className="col-span-1 text-right">Qty</div>
              <div className="col-span-1 text-right">Rate</div>
              <div className="col-span-2 text-right">Amount</div>
            </div>
            {(route.loads ?? []).length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4 italic">No loads</p>
            ) : (
              <>
                {(route.loads ?? []).map((load: any, i: number) => {
                  const qty = parseNumberSafe(load.quantity);
                  const rate = parseNumberSafe(load.rate);
                  const amount = calculateLoadAmount(qty, rate, load.rateType || "per_unit");
                  const unit = unitMap[load.quantityType] || load.quantityType || "t";
                  return (
                    <div key={i} className="grid grid-cols-12 gap-1 px-3 py-2.5 text-xs border-t border-gray-100 hover:bg-gray-50">
                      <div className="col-span-1 text-gray-400 font-mono">{String(i + 1).padStart(2, "0")}</div>
                      <div className="col-span-3 font-semibold truncate">{load.client}</div>
                      <div className="col-span-2 text-gray-600 truncate">{(load.fromLocations ?? []).join(", ")}</div>
                      <div className="col-span-2 text-gray-600 truncate">{(load.toLocations ?? []).join(", ")}</div>
                      <div className="col-span-1 text-right">{qty} {unit}</div>
                      <div className="col-span-1 text-right text-gray-500">{load.rateType === "flat" ? "Flat" : formatZAR(rate)}</div>
                      <div className="col-span-2 text-right font-bold text-blue-700">{formatZAR(amount)}</div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* ── Invoice + Asset card ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Invoice */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-bold mb-1">Invoice ready</p>
            <p className="text-[10px] text-gray-400 mb-3">{route.client || "—"}</p>
            <div className="flex gap-2">
              <button onClick={handleGenerateProforma}
                className="flex-1 py-2 text-xs font-bold border border-gray-300 rounded-lg hover:bg-gray-50">
                PDF
              </button>
            </div>
          </div>

          {/* Asset card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 text-lg">🚛</div>
              <div>
                <p className="text-sm font-bold">{truckReg || route.truckFleetNoStr}</p>
                <p className="text-[10px] text-gray-400">{[trailerType, trailerLength ? `${trailerLength} metre` : "", `Truck ${route.truckFleetNoStr}`].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Routes (30D)</p>
                <p className="text-base font-black">{recentRoutes?.length ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Total KM</p>
                <p className="text-base font-black">{recentRoutes ? recentRoutes.reduce((s: number, r: any) => s + (Number(r.kilometers) || 0), 0).toLocaleString() : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase">Utilisation</p>
                <p className="text-base font-black">{Math.round((totalQty / maxCapacity) * 100)}%</p>
              </div>
            </div>
          </div>
        </div>

        {route.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <span className="font-bold">Notes: </span>{route.notes}
          </div>
        )}

        {isInvoiceModalOpen && currentInvoiceData && currentPdfBlob && (
          <InvoiceDeliveryPanel
            invoiceData={currentInvoiceData}
            pdfBlob={currentPdfBlob}
            onClose={() => setIsInvoiceModalOpen(false)}
          />
        )}
      </div>
    );
  };

  const isLoading = routes === undefined || trucks === undefined || trailers === undefined || drivers === undefined;

  // TRAE-ADDED: Memoize filtered routes for KPIs and Table consistency
  // We use the existing getFilteredAndSortedRoutes function but memoize the result
  // to prevent recalculation and ensure KPIs match the table exactly.
  const filteredRoutes = useMemo(() => {
    return getFilteredAndSortedRoutes(routes || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, filters, sortConfig]); 

  // TRAE-ADDED: KPI Calculations
  const kpiStats = useMemo(() => {
    const data = filteredRoutes;
    const loadsDone = data.length;
    
    // Total Revenue: Sum of route rate/amount (using 'rate' field as per filter logic)
    // "Missing KM rows: Still count toward Total Revenue"
    const totalRevenue = data.reduce((sum, r: any) => sum + (Number(r.rate) || 0), 0);
    
    // Total Distance: Sum of kilometers (excluding missing/0)
    // "Missing KM rows: Must NOT be included in distance"
    const totalDistance = data.reduce((sum, r: any) => {
        const km = Number(r.kilometers) || 0;
        return sum + km;
    }, 0);
    
    // Avg R / KM: Revenue / Distance (if distance > 0)
    // "Formula: totalRevenue / totalDistance"
    const avgRPerKm = totalDistance > 0 ? totalRevenue / totalDistance : 0;
    
    return { loadsDone, totalRevenue, totalDistance, avgRPerKm };
  }, [filteredRoutes]);

  const BASE_CONTAINER_CLASS = "bg-white/10 backdrop-blur-xl rounded-lg border border-white/10 shadow-sm overflow-hidden relative";

  return (
    <div className="h-full min-h-0 flex flex-col relative">
      <div className="flex-shrink-0 space-y-4 relative">
        {/* Sticky Header Wrapper */}
        <div className="sticky top-0 z-10 bg-white/10 backdrop-blur-xl -mx-4 px-4 pt-4 pb-2 border-b border-white/10 shadow-sm mb-4 rounded-b-xl">
          {/* A. Header */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">Sheets</h1>
              <p className="text-gray-500 mt-1 text-xs">
                Read-only operational view
              </p>
            </div>
            <button
              onClick={() => setIsHeaderCompact(!isHeaderCompact)}
              className="p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-white/10 transition-colors"
              title={isHeaderCompact ? "Expand" : "Collapse"}
            >
              {isHeaderCompact ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              )}
            </button>
          </div>

          {/* B. Date selector & Export */}
          {!isHeaderCompact && (
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
            <div className="bg-white/0 backdrop-blur-lg p-3 rounded-lg border border-white/10 shadow-sm w-fit">
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dateMode === "month"}
                  onChange={() => setDateMode("month")}
                  className="h-3 w-3 text-black focus:ring-black"
                />
                <span className="text-xs font-medium text-gray-700">Month</span>
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

            {/* Month Mode Input */}
            {dateMode === "month" && (
              <div>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            )}
            </div>

            <div className="flex items-center gap-2">
               <button
                 onClick={clearFilters}
                 className="bg-white/0 backdrop-blur-lg border border-white/20 text-gray-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-black shadow-sm transition-all"
               >
                 Clear filters
               </button>

               <button
                 onClick={() => setIsImportModalOpen(true)}
                 className="bg-white/0 backdrop-blur-lg border border-white/20 px-4 py-2 rounded-md text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-black shadow-sm transition-all flex items-center gap-2"
               >
                 <span>Import</span>
               </button>

               <ExportDropdown onExport={(type) => {
              const rows = mapSheetsToExportRows(filteredRoutes);
              if (type === 'csv') exportCSV(rows);
              if (type === 'json') exportJSON(rows);
              if (type === 'excel') {
                 const rangeStr = (startDate && endDate) ? `${startDate} to ${endDate}` : (filters.date || "Single Day / All");
                 const timestamp = new Date().toLocaleString();
                 exportExcelWithTemplate(rows, { dateRange: rangeStr, generatedAt: timestamp });
              }
              if (type === 'pdf') {
                 const rangeStr = (startDate && endDate) ? `${startDate} to ${endDate}` : (filters.date || "Single Day / All");
                 const timestamp = new Date().toLocaleString();
                 exportPDF(rows, { dateRange: rangeStr, generatedAt: timestamp });
              }
            }} />
            </div>
          </div>
          )}

          {/* Bulk Action Bar */}
          <div className={selectedRouteIds.size > 0 ? "block mb-4" : "hidden"}>
             <div className="bg-black/40 backdrop-blur-lg text-white px-6 py-3 rounded-lg flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 border border-white/10">
                <div className="font-medium text-sm">
                  {selectedRouteIds.size} route{selectedRouteIds.size === 1 ? "" : "s"} selected
                </div>
                <button
                  onClick={handleBulkDelete}
                  className="bg-white/80 backdrop-blur text-black px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider hover:bg-white transition-colors"
                >
                  Delete Selected
                </button>
             </div>
          </div>

          {/* KPI Summary Bar (TRAE-ADDED) */}
          {isMounted && !isLoading && (
            <>
              {/* Expanded View */}
              {!isHeaderCompact && (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="bg-white/0 backdrop-blur-lg p-3 rounded-lg border border-white/10 shadow-sm">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Loads Done</div>
                    <div className="text-xl font-bold text-gray-900 mt-1">{kpiStats.loadsDone}</div>
                  </div>
                  <div className="bg-white/0 backdrop-blur-lg p-3 rounded-lg border border-white/10 shadow-sm">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Revenue</div>
                    <div className="text-xl font-bold text-gray-900 mt-1">{formatZAR(kpiStats.totalRevenue)}</div>
                  </div>
                  <div className="bg-white/0 backdrop-blur-lg p-3 rounded-lg border border-white/10 shadow-sm">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Total Distance</div>
                    <div className="text-xl font-bold text-gray-900 mt-1">
                      {/* [HYDRATION SAFE] Manual formatting */}
                      {kpiStats.totalDistance.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} km
                    </div>
                  </div>
                  <div className="bg-white/0 backdrop-blur-lg p-3 rounded-lg border border-white/10 shadow-sm">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Avg R / KM</div>
                    <div className="text-xl font-bold text-gray-900 mt-1">
                       {kpiStats.avgRPerKm > 0 ? formatZAR(kpiStats.avgRPerKm) : "—"}
                    </div>
                  </div>
                </div>
              )}

              {/* Compact View */}
              {isHeaderCompact && (
                <div className="bg-white/0 backdrop-blur-lg border border-white/10 rounded-lg p-2 mb-4">
                  {/* Date Range */}
                  <div className="text-[11px] text-gray-500 mb-2 px-2 flex items-center gap-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>
                      {dateMode === "single" && singleDate}
                      {dateMode === "range" && `${fromDate} → ${toDate}`}
                      {dateMode === "month" && selectedMonth}
                    </span>
                  </div>
                  
                  {/* KPI Mini Cards */}
                  <div className="grid grid-cols-4 gap-2">
                    {/* Loads Done */}
                    <div className="bg-white/5 p-1.5 rounded border border-white/5">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                          <path d="M9 11l3 3L22 4"></path>
                          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span className="text-[10px] text-gray-500">Loads</span>
                      </div>
                      <div className="text-xs font-bold text-gray-900 mt-0.5">{kpiStats.loadsDone}</div>
                    </div>

                    {/* Total Revenue */}
                    <div className="bg-white/5 p-1.5 rounded border border-white/5">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
                          <line x1="12" y1="1" x2="12" y2="23"></line>
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <span className="text-[10px] text-gray-500">Revenue</span>
                      </div>
                      <div className="text-xs font-bold text-gray-900 mt-0.5">{formatZAR(kpiStats.totalRevenue / 1000)}k</div>
                    </div>

                    {/* Total Distance */}
                    <div className="bg-white/5 p-1.5 rounded border border-white/5">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
                          <circle cx="12" cy="12" r="1"></circle>
                          <path d="M12 11v2"></path>
                          <path d="M4 3h16v16H4z"></path>
                        </svg>
                        <span className="text-[10px] text-gray-500">Km</span>
                      </div>
                      <div className="text-xs font-bold text-gray-900 mt-0.5">{(kpiStats.totalDistance / 1000).toFixed(1)}k</div>
                    </div>

                    {/* Avg R/KM */}
                    <div className="bg-white/5 p-1.5 rounded border border-white/5">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                          <polyline points="17 6 23 6 23 12"></polyline>
                        </svg>
                        <span className="text-[10px] text-gray-500">R/KM</span>
                      </div>
                      <div className="text-xs font-bold text-gray-900 mt-0.5">{kpiStats.avgRPerKm > 0 ? kpiStats.avgRPerKm.toFixed(0) : "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Clear Filters Bar */}
          {(filters.date || filters.truck || filters.trailer || filters.driver || filters.from || filters.to || filters.status.length > 0 || filters.amountMin || filters.amountMax || sortConfig.column) && (
            <div className="bg-white/0 backdrop-blur-lg border border-white/10 rounded-lg px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-medium">Active filters:</span>
                {Object.entries(filters).filter(([key, val]) => Array.isArray(val) ? val.length > 0 : !!val).map(([key]) => (
                  <span key={key} className="bg-white/0 px-2 py-0.5 rounded border border-white/20 capitalize">
                    {key}
                  </span>
                ))}
                {sortConfig.column && (
                  <span className="bg-white/0 px-2 py-0.5 rounded border border-white/20">
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
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-hidden">
        {/* C. Route list (core) */}
        <div className={BASE_CONTAINER_CLASS}>
        {/* Table Header */}
        <div className={`grid grid-cols-[repeat(17,minmax(0,1fr))] gap-2 bg-white/15 backdrop-blur-xl px-3 py-4 border-b border-white/10 text-[12px] font-bold text-gray-900 uppercase tracking-wider items-center`}>
          
          {/* Checkbox Column - Always Rendered, Hidden via CSS if needed (though we removed mode check for structure) */}
          <div className="col-span-1 flex items-center">
             <input
               type="checkbox"
               className="h-3 w-3 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
               checked={
                  routes
                    ? selectedRouteIds.size === allSelectableRoutes(filteredRoutes).length &&
                    allSelectableRoutes(filteredRoutes).length > 0
                    : false
                }
                onChange={() => {
                  if (routes) toggleSelectAll(filteredRoutes);
                }}
                disabled={!routes || allSelectableRoutes(filteredRoutes).length === 0}
             />
          </div>

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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.date ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'date' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter date..."
                  value={filters.date}
                  onChange={(e) => updateFilter('date', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.truck ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'truck' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter truck..."
                  value={filters.truck}
                  onChange={(e) => updateFilter('truck', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.trailer ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'trailer' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter trailer..."
                  value={filters.trailer}
                  onChange={(e) => updateFilter('trailer', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.client ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'client' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter client..."
                  value={filters.client}
                  onChange={(e) => updateFilter('client', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.driver ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'driver' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter driver..."
                  value={filters.driver}
                  onChange={(e) => updateFilter('driver', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.from ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'from' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter from..."
                  value={filters.from}
                  onChange={(e) => updateFilter('from', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.to ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'to' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <input
                  autoFocus
                  type="text"
                  placeholder="Filter to..."
                  value={filters.to}
                  onChange={(e) => updateFilter('to', e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>

          {/* Notes Column Header (TRAE-ADDED) */}
          <div className="col-span-2">Notes</div>

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
                className={`text-gray-400 hover:text-black text-base leading-none ${(filters.amountMin || filters.amountMax) ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'amount' && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                <div className="space-y-2">
                  <input
                    autoFocus
                    type="number"
                    placeholder="Min amount"
                    value={filters.amountMin}
                    onChange={(e) => updateFilter('amountMin', e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    type="number"
                    placeholder="Max amount"
                    value={filters.amountMax}
                    onChange={(e) => updateFilter('amountMax', e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
          </div>

          {/* R/KM Column Header (TRAE-ADDED) */}
          <div className="col-span-1 text-right">R / KM</div>

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
                className={`text-gray-400 hover:text-black text-base leading-none ${filters.status.length > 0 ? 'text-blue-600' : ''}`}
                title="Filter"
              >
                ⊙
              </button>
            </div>
            {showFilterDropdown === 'status' && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-50 min-w-[150px]">
                {['🔴 Incomplete', '🟡 Missing KM', '🟡 Multi-drop', '🟡 Multi-pick', '🔵 Finalized', '🟢 Clean'].map(status => (
                  <label key={status} className="flex items-center gap-2 text-sm py-1 cursor-pointer hover:bg-gray-50">
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
        {!isMounted || isLoading ? (
          <div className="p-8 text-center text-gray-500 text-xs">
            Loading...
          </div>
        ) : filteredRoutes.length === 0 ? (
          /* Empty State */
          <div className="p-8 text-center">
            <p className="text-gray-500 font-medium text-sm">No routes</p>
            <p className="text-gray-400 text-xs mt-1">
              {routes.length > 0 ? 'No routes match your filters.' : 'Select a date or add routes.'}
            </p>
          </div>
        ) : (
          /* Route Rows */
          <div className="divide-y divide-white/30">
            {filteredRoutes.map((route) => {
              const status = (route as any).status || "planned";
              const isLocked = status === "locked";
              const isSelected = selectedRouteIds.has(route._id);
              const isActive = selectedRoute?._id === route._id;
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
                  className={`group transition-colors ${isLocked ? "opacity-60" : "hover:bg-white/20"} ${isSelected ? "bg-white/30" : ""} ${isActive ? "bg-white/25 ring-1 ring-inset ring-white/30" : ""}`}
                >
                  {/* Summary Row */}
                  <div
                    className={`grid grid-cols-[repeat(17,minmax(0,1fr))] gap-2 px-3 py-2.5 items-center text-xs cursor-pointer ${isLocked ? "opacity-60" : ""}`}
                    onClick={() => isActive ? closePanel() : openPanel(route)}
                  >
                    {/* Checkbox */}
                    <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3 w-3 rounded border-gray-300 text-black focus:ring-black cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        checked={Boolean(isSelected)}
                        onChange={() => toggleSelection(route._id)}
                        disabled={isLocked}
                      />
                    </div>

                    {/* Panel indicator */}
                    <div className="col-span-1">
                      <button
                        className="text-gray-400 hover:text-black focus:outline-none transition-colors"
                        aria-label="Open route details"
                        onClick={(e) => { e.stopPropagation(); isActive ? closePanel() : openPanel(route); }}
                      >
                        {isActive ? "◂" : "▸"}
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

                    {/* Truck */}
                    <div className="col-span-1 font-medium text-gray-900 truncate">
                      {route.truckFleetNoStr || "-"}
                    </div>

                    {/* Trailer */}
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

                    {/* Notes */}
                    <div className="col-span-2 text-gray-500 text-[11px] italic truncate" title={route.notes}>
                      {route.notes ? (route.notes.length > 40 ? route.notes.slice(0, 40) + "..." : route.notes) : ""}
                    </div>

                    {/* Amount */}
                    <div className="col-span-1 text-right font-mono font-medium text-gray-900">
                      {formatZAR(route.rate || 0)}
                    </div>

                    {/* R/KM Badge */}
                    <div className="col-span-1 text-right flex justify-end">
                      {(() => {
                        const km = Number(route.kilometers) || 0;
                        const amount = Number(route.rate) || 0;
                        if (km === 0) return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 border border-gray-300">—</span>;
                        const val = amount / km;
                        let colorClass = "bg-red-100 text-red-800";
                        if (val >= 30) colorClass = "bg-green-100 text-green-800";
                        else if (val >= 25) colorClass = "bg-yellow-100 text-yellow-800";
                        return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${colorClass}`}>R {val.toFixed(2)}</span>;
                      })()}
                    </div>

                    {/* Risk Status Badge */}
                    <div className="col-span-1 text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusBgColor}`}>
                        {riskStatus.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {/* ── Route Detail Side Panel ── */}
      {selectedRoute && (
        <div className="fixed inset-0 z-50 flex pointer-events-none">
          {/* backdrop — blurs the background, click to close */}
          <div
            className="flex-1 pointer-events-auto backdrop-blur-sm bg-black/20"
            onClick={closePanel}
          />

          {/* panel — solid white background, matches app theme */}
          <div className="w-full max-w-xl bg-white border-l border-gray-200 flex flex-col h-full shadow-2xl pointer-events-auto overflow-hidden">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Route Detail</p>
                <h2 className="text-sm font-black text-gray-900 mt-0.5">
                  Truck {selectedRoute.truckFleetNoStr ?? "—"} · {selectedRoute.routeDate}
                </h2>
              </div>
              <button
                onClick={closePanel}
                className="text-gray-500 hover:text-gray-900 text-lg font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* scrollable body — reuse RouteDetailsCard */}
            <div className="flex-1 overflow-y-auto">
              <RouteDetailsCard route={selectedRoute} isLocked={(selectedRoute.status ?? "planned") === "locked"} mode="primary" onDrillDown={openPanel} />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 scale-100">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeConfirm}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                disabled={confirmDialog.isLoading}
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                disabled={confirmDialog.isLoading}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors flex items-center gap-2 ${
                  confirmDialog.confirmStyle === "danger" ? "bg-red-600 hover:bg-red-700 focus:ring-red-500" :
                  confirmDialog.confirmStyle === "neutral" ? "bg-gray-800 hover:bg-black focus:ring-gray-500" :
                  "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                }`}
              >
                {confirmDialog.isLoading && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {confirmDialog.isLoading ? "Processing..." : confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <ImportLoadsModal
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            setIsImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
