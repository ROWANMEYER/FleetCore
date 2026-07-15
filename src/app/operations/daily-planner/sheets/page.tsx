"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
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
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

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

function ExportDropdown({
  onExport,
  compact = false,
}: {
  onExport: (type: 'csv' | 'excel' | 'json' | 'pdf') => void;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Export"
        className={compact
          ? "flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-gray-700 dark:text-slate-200 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-blue-500"
          : "flex items-center gap-2 bg-white dark:bg-slate-900/60 border border-gray-300 dark:border-slate-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-900/80 dark:text-slate-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-black shadow-sm transition-all"}
      >
        {compact ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12"></path>
            <path d="M7 10l5 5 5-5"></path>
            <path d="M5 21h14"></path>
          </svg>
        ) : (
          <>
            <span>Export</span>
            <span className="text-xs text-gray-500">▼</span>
          </>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-48 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border border-gray-200 dark:border-slate-800 rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-2">
            <button
              onClick={() => { onExport('excel'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 flex items-center gap-2"
            >
              <span className="text-green-600 font-bold">xlsx</span> Excel
            </button>
            <button
              onClick={() => { onExport('csv'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 flex items-center gap-2"
            >
              <span className="text-blue-600 font-bold">csv</span> CSV
            </button>
            <button
              onClick={() => { onExport('json'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 flex items-center gap-2"
            >
              <span className="text-yellow-600 font-bold">json</span> JSON
            </button>
            <button
              onClick={() => { onExport('pdf'); setIsOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 flex items-center gap-2"
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

type TableColumnKey =
  | "select"
  | "expand"
  | "date"
  | "truck"
  | "trailer"
  | "client"
  | "driver"
  | "from"
  | "to"
  | "notes"
  | "amount"
  | "rkm"
  | "status";

type ResizableTableColumnKey = Exclude<TableColumnKey, "select" | "expand">;

const TABLE_WIDTHS_STORAGE_KEY = "dailyPlannerSheets.tableColumnWidths";
const TABLE_VISIBILITY_STORAGE_KEY = "dailyPlannerSheets.tableColumnVisibility";

const TABLE_COLUMN_LABELS: Record<ResizableTableColumnKey, string> = {
  date: "Date",
  truck: "Truck",
  trailer: "Trailer",
  client: "Client",
  driver: "Driver",
  from: "From",
  to: "To",
  notes: "Notes",
  amount: "Amount",
  rkm: "R / KM",
  status: "Status",
};

const DEFAULT_TABLE_COLUMN_WIDTHS: Record<TableColumnKey, number> = {
  select: 42,
  expand: 34,
  date: 96,
  truck: 92,
  trailer: 92,
  client: 122,
  driver: 170,
  from: 170,
  to: 170,
  notes: 170,
  amount: 120,
  rkm: 94,
  status: 112,
};

const MIN_TABLE_COLUMN_WIDTHS: Record<ResizableTableColumnKey, number> = {
  date: 82,
  truck: 72,
  trailer: 72,
  client: 96,
  driver: 120,
  from: 120,
  to: 120,
  notes: 120,
  amount: 96,
  rkm: 84,
  status: 100,
};

const DEFAULT_TABLE_COLUMN_VISIBILITY: Record<ResizableTableColumnKey, boolean> = {
  date: true,
  truck: true,
  trailer: true,
  client: true,
  driver: true,
  from: true,
  to: true,
  notes: true,
  amount: true,
  rkm: true,
  status: true,
};

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
  const [dashboardDrilldown, setDashboardDrilldown] = useState({
    date: null as { label: string; date: string } | null,
    truck: null as { label: string; value: string } | null,
    client: null as { label: string; value: string } | null,
    status: null as { label: string; values: string[] } | null,
    sort: null as { label: string; column: string; direction: 'asc' | 'desc' } | null,
  });

  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showTableGrid, setShowTableGrid] = useState(false);
  const [tableColumnWidths, setTableColumnWidths] = useState<Record<TableColumnKey, number>>(DEFAULT_TABLE_COLUMN_WIDTHS);
  const [tableColumnVisibility, setTableColumnVisibility] = useState<Record<ResizableTableColumnKey, boolean>>(DEFAULT_TABLE_COLUMN_VISIBILITY);
  const resizingColumnRef = useRef<{ key: ResizableTableColumnKey; startX: number; startWidth: number } | null>(null);
  const tableHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const tableBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingTableScrollRef = useRef<"header" | "body" | null>(null);

  const getEffectiveTableColumnWidth = (key: TableColumnKey) => {
    if (key === "select" || key === "expand") return tableColumnWidths[key];
    return tableColumnVisibility[key] ? tableColumnWidths[key] : 0;
  };

  const tableGridTemplateColumns = useMemo(() => {
    const widths = {
      select: getEffectiveTableColumnWidth("select"),
      expand: getEffectiveTableColumnWidth("expand"),
      date: getEffectiveTableColumnWidth("date"),
      truck: getEffectiveTableColumnWidth("truck"),
      trailer: getEffectiveTableColumnWidth("trailer"),
      client: getEffectiveTableColumnWidth("client"),
      driver: getEffectiveTableColumnWidth("driver"),
      from: getEffectiveTableColumnWidth("from"),
      to: getEffectiveTableColumnWidth("to"),
      notes: getEffectiveTableColumnWidth("notes"),
      amount: getEffectiveTableColumnWidth("amount"),
      rkm: getEffectiveTableColumnWidth("rkm"),
      status: getEffectiveTableColumnWidth("status"),
    };
    return [
      `${widths.select}px`,
      `${widths.expand}px`,
      `${widths.date}px`,
      `${widths.truck}px`,
      `${widths.trailer}px`,
      `${widths.client}px`,
      `${widths.driver / 2}px`,
      `${widths.driver / 2}px`,
      `${widths.from / 2}px`,
      `${widths.from / 2}px`,
      `${widths.to / 2}px`,
      `${widths.to / 2}px`,
      `${widths.notes / 2}px`,
      `${widths.notes / 2}px`,
      `${widths.amount}px`,
      `${widths.rkm}px`,
      `${widths.status}px`,
    ].join(" ");
  }, [tableColumnVisibility, tableColumnWidths]);

  const startColumnResize = (key: ResizableTableColumnKey, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = {
      key,
      startX: e.clientX,
      startWidth: tableColumnWidths[key],
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const resetTableColumnWidths = () => {
    setTableColumnWidths(DEFAULT_TABLE_COLUMN_WIDTHS);
  };

  const getColumnVisibilityClass = (key: ResizableTableColumnKey) =>
    tableColumnVisibility[key]
      ? ""
      : "overflow-hidden opacity-0 pointer-events-none !px-0 !border-r-0";

  const toggleTableColumnVisibility = (key: ResizableTableColumnKey) => {
    setTableColumnVisibility((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const estimateColumnAutoFitWidth = (key: ResizableTableColumnKey) => {
    const rowsToMeasure = filteredRoutes.slice(0, 100);
    const samples = rowsToMeasure.map((route: any) => {
      if (key === "date") {
        if (!route.routeDate) return "-";
        const date = new Date(route.routeDate);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = String(date.getFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
      }
      if (key === "truck") return route.truckFleetNoStr || "-";
      if (key === "trailer") return route.trailerFleetNoStr || "-";
      if (key === "client") return route.client || "-";
      if (key === "driver") return getDriverDisplay(route.driverName);
      if (key === "from") {
        const allFroms = route.loads?.flatMap((l: any) => l.fromLocations || []) || [];
        return [...new Set(allFroms)].join(" • ") || "-";
      }
      if (key === "to") {
        const allTos = route.loads?.flatMap((l: any) => l.toLocations || []) || [];
        return [...new Set(allTos)].join(" → ") || "-";
      }
      if (key === "notes") return route.notes || "";
      if (key === "amount") return formatZAR(route.rate || 0);
      if (key === "rkm") {
        const km = Number(route.kilometers) || 0;
        const amount = Number(route.rate) || 0;
        return km === 0 ? "—" : `R ${(amount / km).toFixed(2)}`;
      }
      if (key === "status") return getRouteRiskStatus(route).label;
      return "";
    });

    const maxLength = Math.max(
      TABLE_COLUMN_LABELS[key].length,
      ...samples.map((sample) => String(sample).length)
    );

    return Math.max(MIN_TABLE_COLUMN_WIDTHS[key], Math.min(360, Math.ceil(maxLength * 7.4) + 28));
  };

  const autoFitTableColumn = (key: ResizableTableColumnKey) => {
    setTableColumnWidths((prev) => ({
      ...prev,
      [key]: estimateColumnAutoFitWidth(key),
    }));
  };

  const syncTableHorizontalScroll = (source: "header" | "body") => {
    const sourceEl = source === "header" ? tableHeaderScrollRef.current : tableBodyScrollRef.current;
    const targetEl = source === "header" ? tableBodyScrollRef.current : tableHeaderScrollRef.current;
    if (!sourceEl || !targetEl) return;
    syncingTableScrollRef.current = source;
    targetEl.scrollLeft = sourceEl.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingTableScrollRef.current = null;
    });
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      const { key, startX, startWidth } = resizingColumnRef.current;
      const delta = e.clientX - startX;
      const nextWidth = Math.max(MIN_TABLE_COLUMN_WIDTHS[key], startWidth + delta);
      setTableColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    };

    const onMouseUp = () => {
      resizingColumnRef.current = null;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    try {
      const savedWidthsRaw = window.localStorage.getItem(TABLE_WIDTHS_STORAGE_KEY);
      if (savedWidthsRaw) {
        const savedWidths = JSON.parse(savedWidthsRaw) as Partial<Record<TableColumnKey, number>>;
        setTableColumnWidths((prev) => ({ ...prev, ...savedWidths }));
      }
      const savedVisibilityRaw = window.localStorage.getItem(TABLE_VISIBILITY_STORAGE_KEY);
      if (savedVisibilityRaw) {
        const savedVisibility = JSON.parse(savedVisibilityRaw) as Partial<Record<ResizableTableColumnKey, boolean>>;
        setTableColumnVisibility((prev) => ({ ...prev, ...savedVisibility }));
      }
    } catch {
      // Ignore malformed local storage values and keep defaults.
    }
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    window.localStorage.setItem(TABLE_WIDTHS_STORAGE_KEY, JSON.stringify(tableColumnWidths));
  }, [isMounted, tableColumnWidths]);

  useEffect(() => {
    if (!isMounted) return;
    window.localStorage.setItem(TABLE_VISIBILITY_STORAGE_KEY, JSON.stringify(tableColumnVisibility));
  }, [isMounted, tableColumnVisibility]);

  // Sort handler
  const handleSort = (column: string) => {
    setDashboardDrilldown(prev => ({ ...prev, sort: null }));
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Filter update handler
  const updateFilter = (key: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const dashboardStatusMap: Record<string, string> = {
    "Incomplete": "🔴 Incomplete",
    "Missing KM": "🟡 Missing KM",
    "Multi-drop": "🟡 Multi-drop",
    "Multi-pick": "🟡 Multi-pick",
    "Finalized": "🔵 Finalized",
    "Clean": "🟢 Clean",
  };
  const attentionStatuses = [
    "🔴 Incomplete",
    "🟡 Missing KM",
    "🟡 Multi-drop",
    "🟡 Multi-pick",
  ];

  const syncDateToUrl = (newDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newDate) {
      params.set("date", newDate);
    } else {
      params.delete("date");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const focusDate = (date: string, label: string) => {
    setDateMode("single");
    setSingleDate(date);
    setFromDate(date);
    setToDate(date);
    syncDateToUrl(date);
    setDashboardDrilldown(prev => ({ ...prev, date: { label, date } }));
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
    setDashboardDrilldown({
      date: null,
      truck: null,
      client: null,
      status: null,
      sort: null,
    });

    // 3. Clear URL params
    syncDateToUrl("");
  };

  const summarizeRoutes = (routesList: any[]) => {
    const truckCount = new Set(routesList.map((route: any) => route.truckFleetNoStr || route.truckFleetNo || "Unassigned")).size;
    const clientCount = new Set(routesList.map((route: any) => route.client || "Unassigned")).size;
    return {
      routes: routesList.length,
      loads: routesList.reduce((sum: number, route: any) => sum + (route.loads?.length || 0), 0),
      revenue: routesList.reduce((sum: number, route: any) => sum + (Number(route.rate) || 0), 0),
      distance: routesList.reduce((sum: number, route: any) => sum + (Number(route.kilometers) || 0), 0),
      trucks: truckCount,
      clients: clientCount,
    };
  };

  // Apply filters and sorting
  const getFilteredAndSortedRoutes = (
    routesList: any[],
    options?: { includeDashboard?: boolean; applySorting?: boolean }
  ) => {
    if (!routesList) return [];
    const includeDashboard = options?.includeDashboard ?? true;
    const applySorting = options?.applySorting ?? true;

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
      if (includeDashboard && dashboardDrilldown.date && (route.routeDate || '') !== dashboardDrilldown.date.date) {
        return false;
      }

      // Truck filter
      if (filters.truck && !(route.truckFleetNo?.toString() ?? route.truckFleetNoStr ?? '').toLowerCase().includes(filters.truck.toLowerCase())) {
        return false;
      }
      if (includeDashboard && dashboardDrilldown.truck && !(route.truckFleetNo?.toString() ?? route.truckFleetNoStr ?? '').toLowerCase().includes(dashboardDrilldown.truck.value.toLowerCase())) {
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
      if (includeDashboard && dashboardDrilldown.client && !(route.client || '').toLowerCase().includes(dashboardDrilldown.client.value.toLowerCase())) {
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
      if (includeDashboard && dashboardDrilldown.status) {
        const riskStatus = getRouteRiskStatus(route);
        if (!dashboardDrilldown.status.values.includes(riskStatus.label)) return false;
      }

      // Amount filter
      const amount = route.rate || 0;
      if (filters.amountMin && amount < parseFloat(filters.amountMin)) return false;
      if (filters.amountMax && amount > parseFloat(filters.amountMax)) return false;

      return true;
    });

    // Apply sorting
    const effectiveSortConfig = includeDashboard ? (dashboardDrilldown.sort ?? sortConfig) : sortConfig;
    if (applySorting && effectiveSortConfig.column) {
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (effectiveSortConfig.column) {
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
          return effectiveSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const comparison = String(aVal).localeCompare(String(bVal));
        return effectiveSortConfig.direction === 'asc' ? comparison : -comparison;
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
    syncDateToUrl(newDate);
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
                className="text-[10px] text-gray-500 hover:text-gray-900 dark:text-gray-100 underline disabled:opacity-50"
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
                className="text-[10px] text-gray-500 hover:text-gray-900 dark:text-gray-100 underline disabled:opacity-50"
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
      <div className="p-5 space-y-5 text-gray-900 dark:text-gray-100">

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
            <div key={k.label} className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 border-l-4 ${k.accent}`}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{k.label}</p>
              <p className="text-lg font-black mt-1">{k.value}</p>
              {k.sub && <p className="text-[10px] text-gray-500 mt-0.5">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* ── Revenue chart + Load gauge ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue last 7 routes */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
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
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center">
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
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
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
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
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
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
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
  }, [routes, filters, sortConfig, dashboardDrilldown]);

  const baseRoutes = useMemo(() => {
    return getFilteredAndSortedRoutes(routes || [], { includeDashboard: false, applySorting: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, filters]);

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

  const BASE_CONTAINER_CLASS = "bg-white dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden relative";
  const compactDateInputClass = "h-8 rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  const formatCompactCurrency = (value: number) => {
    if (value >= 1000) return `${formatZAR(value / 1000)}k`;
    return formatZAR(value);
  };

  const formatCompactDistance = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toFixed(0);
  };

  const formatCompactNumber = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toFixed(0);
  };

  const renderCompactDateControls = () => (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <div className="flex items-center rounded-md border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-0.5">
        {[
          { id: "single", label: "Date" },
          { id: "range", label: "Range" },
          { id: "month", label: "Month" },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setDateMode(option.id as "single" | "range" | "month")}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
              dateMode === option.id
                ? "bg-white text-gray-900 dark:bg-slate-800 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {dateMode === "single" && (
        <input
          type="date"
          value={singleDate}
          onChange={handleSingleDateChange}
          className={compactDateInputClass}
        />
      )}

      {dateMode === "range" && (
        <>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={compactDateInputClass}
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={compactDateInputClass}
          />
        </>
      )}

      {dateMode === "month" && (
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className={compactDateInputClass}
        />
      )}

      {isRangeInvalid && (
        <span className="text-[11px] font-medium text-red-600">Invalid range</span>
      )}
    </div>
  );

  const dashboardData = useMemo(() => {
    const totalRoutes = filteredRoutes.length;
    const totalLoads = filteredRoutes.reduce((sum, route: any) => sum + (route.loads?.length || 0), 0);
    const cleanRoutes = filteredRoutes.filter((route: any) => getRouteRiskStatus(route).level === "green").length;
    const riskRoutes = filteredRoutes.filter((route: any) => {
      const level = getRouteRiskStatus(route).level;
      return level === "red" || level === "yellow";
    }).length;
    const finalizedRoutes = filteredRoutes.filter((route: any) => {
      const status = (route.status || "planned").toLowerCase();
      return status === "completed" || status === "locked";
    }).length;
    const avgRevenuePerRoute = totalRoutes > 0 ? kpiStats.totalRevenue / totalRoutes : 0;
    const avgLoadsPerRoute = totalRoutes > 0 ? totalLoads / totalRoutes : 0;
    const cleanRate = totalRoutes > 0 ? (cleanRoutes / totalRoutes) * 100 : 0;
    const finalizationRate = totalRoutes > 0 ? (finalizedRoutes / totalRoutes) * 100 : 0;

    const dateMap = new Map<string, { date: string; label: string; revenue: number; distance: number; routes: number; loads: number }>();
    const truckMap = new Map<string, number>();
    const clientMap = new Map<string, number>();
    const riskMap = new Map<string, { label: string; count: number; color: string }>([
      ["Incomplete", { label: "Incomplete", count: 0, color: "#ef4444" }],
      ["Missing KM", { label: "Missing KM", count: 0, color: "#f59e0b" }],
      ["Multi-drop", { label: "Multi-drop", count: 0, color: "#fbbf24" }],
      ["Multi-pick", { label: "Multi-pick", count: 0, color: "#fcd34d" }],
      ["Finalized", { label: "Finalized", count: 0, color: "#3b82f6" }],
      ["Clean", { label: "Clean", count: 0, color: "#22c55e" }],
    ]);

    filteredRoutes.forEach((route: any) => {
      const revenue = Number(route.rate) || 0;
      const distance = Number(route.kilometers) || 0;
      const routeLoads = route.loads?.length || 0;
      const dateKey = route.routeDate || "Unknown";
      const dateLabel = route.routeDate ? route.routeDate.slice(5) : "N/A";
      const existingDate = dateMap.get(dateKey) || {
        date: dateKey,
        label: dateLabel,
        revenue: 0,
        distance: 0,
        routes: 0,
        loads: 0,
      };
      existingDate.revenue += revenue;
      existingDate.distance += distance;
      existingDate.routes += 1;
      existingDate.loads += routeLoads;
      dateMap.set(dateKey, existingDate);

      const truckKey = route.truckFleetNoStr || "Unassigned";
      truckMap.set(truckKey, (truckMap.get(truckKey) || 0) + revenue);

      const clientKey = route.client || "Unassigned";
      clientMap.set(clientKey, (clientMap.get(clientKey) || 0) + revenue);

      const riskLabel = getRouteRiskStatus(route).label.replace(/^[^\w]+/, "").trim();
      const riskEntry = riskMap.get(riskLabel);
      if (riskEntry) riskEntry.count += 1;
    });

    const timeline = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const topTrucks = Array.from(truckMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const topClients = Array.from(clientMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const riskDistribution = Array.from(riskMap.values()).filter((item) => item.count > 0);

    const bestDay = timeline.reduce<{ date: string; label: string; revenue: number } | null>((best, day) => {
      if (!best || day.revenue > best.revenue) return { date: day.date, label: day.label, revenue: day.revenue };
      return best;
    }, null);
    const topTruck = topTrucks[0] || null;
    const topClient = topClients[0] || null;
    const splitIndex = Math.max(Math.ceil(timeline.length / 2), 1);
    const firstWindow = timeline.slice(0, splitIndex);
    const secondWindow = timeline.slice(splitIndex);
    const sumMetric = (items: typeof timeline, key: "revenue" | "distance" | "routes" | "loads") =>
      items.reduce((sum, item) => sum + item[key], 0);
    const calculateDelta = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };
    const revenueDelta = calculateDelta(sumMetric(secondWindow, "revenue"), sumMetric(firstWindow, "revenue"));
    const distanceDelta = calculateDelta(sumMetric(secondWindow, "distance"), sumMetric(firstWindow, "distance"));
    const routesDelta = calculateDelta(sumMetric(secondWindow, "routes"), sumMetric(firstWindow, "routes"));
    const loadsDelta = calculateDelta(sumMetric(secondWindow, "loads"), sumMetric(firstWindow, "loads"));
    const riskToCleanRatio = cleanRoutes > 0 ? riskRoutes / cleanRoutes : riskRoutes > 0 ? riskRoutes : 0;
    const coverageScore = totalRoutes > 0 ? ((cleanRoutes + finalizedRoutes) / (totalRoutes * 2)) * 100 : 0;

    const riskSeries = timeline.map((item) => {
      const matchingRoutes = filteredRoutes.filter((route: any) => route.routeDate === item.date);
      const attention = matchingRoutes.filter((route: any) => {
        const level = getRouteRiskStatus(route).level;
        return level === "red" || level === "yellow";
      }).length;
      return {
        label: item.label,
        value: attention,
      };
    });

    const kpiTiles = [
      {
        label: "Routes",
        value: dashboardDataValue(totalRoutes),
        subtext: `${totalLoads} loads`,
        delta: routesDelta,
        deltaGoodWhenPositive: true,
        accent: "from-slate-500/20 to-slate-100/10",
        line: "#334155",
        data: timeline.map((item) => ({ label: item.label, value: item.routes })),
      },
      {
        label: "Revenue",
        value: formatCompactCurrency(kpiStats.totalRevenue),
        subtext: `${formatCompactCurrency(avgRevenuePerRoute)} avg`,
        delta: revenueDelta,
        deltaGoodWhenPositive: true,
        accent: "from-blue-500/20 to-cyan-100/10",
        line: "#2563eb",
        data: timeline.map((item) => ({ label: item.label, value: item.revenue })),
      },
      {
        label: "Distance",
        value: `${formatCompactDistance(kpiStats.totalDistance)} km`,
        subtext: kpiStats.avgRPerKm > 0 ? `R ${kpiStats.avgRPerKm.toFixed(0)}/km` : "No km",
        delta: distanceDelta,
        deltaGoodWhenPositive: true,
        accent: "from-emerald-500/20 to-green-100/10",
        line: "#059669",
        data: timeline.map((item) => ({ label: item.label, value: item.distance })),
      },
      {
        label: "Loads / Route",
        value: avgLoadsPerRoute.toFixed(1),
        subtext: `${totalLoads} total loads`,
        delta: loadsDelta,
        deltaGoodWhenPositive: true,
        accent: "from-violet-500/20 to-fuchsia-100/10",
        line: "#7c3aed",
        data: timeline.map((item) => ({ label: item.label, value: item.loads })),
      },
      {
        label: "Coverage",
        value: `${coverageScore.toFixed(0)}%`,
        subtext: `${cleanRoutes} clean | ${finalizedRoutes} final`,
        delta: cleanRate - (100 - finalizationRate),
        deltaGoodWhenPositive: true,
        accent: "from-amber-500/20 to-yellow-100/10",
        line: "#d97706",
        data: timeline.map((item) => ({ label: item.label, value: item.routes > 0 ? (item.loads / item.routes) * 10 : 0 })),
      },
      {
        label: "Risk Ratio",
        value: `${riskToCleanRatio.toFixed(2)}x`,
        subtext: `${riskRoutes} need review`,
        delta: -riskRoutes,
        deltaGoodWhenPositive: true,
        accent: "from-rose-500/20 to-red-100/10",
        line: "#dc2626",
        data: riskSeries,
      },
    ];

    const insights = [
      {
        title: "Best Day",
        value: bestDay ? `${bestDay.label} · ${formatCompactCurrency(bestDay.revenue)}` : "No revenue yet",
        tone: "text-emerald-700",
        badge: revenueDelta >= 0 ? `+${revenueDelta.toFixed(0)}%` : `${revenueDelta.toFixed(0)}%`,
      },
      {
        title: "Top Truck",
        value: topTruck ? `${topTruck.name} · ${formatCompactCurrency(topTruck.value)}` : "No truck data",
        tone: "text-blue-700",
        badge: topTrucks.length > 1 ? `${(((topTruck?.value || 0) / (topTrucks[1]?.value || 1)) * 100).toFixed(0)} idx` : "Leader",
      },
      {
        title: "Top Client",
        value: topClient ? `${topClient.name} · ${formatCompactCurrency(topClient.value)}` : "No client data",
        tone: "text-violet-700",
        badge: topClients.length > 0 ? `${((topClient?.value || 0) / Math.max(kpiStats.totalRevenue, 1) * 100).toFixed(0)}% mix` : "No mix",
      },
      {
        title: "Attention",
        value: `${riskRoutes} route${riskRoutes === 1 ? "" : "s"} need attention`,
        tone: riskRoutes > 0 ? "text-amber-700" : "text-gray-700",
        badge: cleanRate.toFixed(0) + "% clean",
      },
    ];

    return {
      totalRoutes,
      totalLoads,
      cleanRoutes,
      riskRoutes,
      finalizedRoutes,
      avgRevenuePerRoute,
      avgLoadsPerRoute,
      cleanRate,
      finalizationRate,
      timeline,
      topTrucks,
      topClients,
      riskDistribution,
      kpiTiles,
      insights,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRoutes, kpiStats]);

  function dashboardDataValue(value: number) {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString();
  }

  const handleExport = (type: 'csv' | 'excel' | 'json' | 'pdf') => {
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
  };

  const renderColumnResizeHandle = (key: ResizableTableColumnKey) => (
    <div
      onMouseDown={(e) => startColumnResize(key, e)}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        autoFitTableColumn(key);
      }}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none"
      title="Drag to resize, double-click to auto-fit"
    >
      <div className="absolute right-0 top-1/2 h-5 w-px -translate-y-1/2 bg-gray-300 group-hover:bg-blue-400" />
    </div>
  );

  const isDashboardFocusActive = (label: string) => {
    return [
      dashboardDrilldown.date?.label,
      dashboardDrilldown.truck?.label,
      dashboardDrilldown.client?.label,
      dashboardDrilldown.status?.label,
      dashboardDrilldown.sort?.label,
    ].includes(label);
  };

  const clearDashboardTextFocus = (key: "truck" | "client", label: string) => {
    if (!isDashboardFocusActive(label)) return false;
    setDashboardDrilldown(prev => ({ ...prev, [key]: null }));
    return true;
  };

  const clearDashboardStatusFocus = (label: string) => {
    if (!isDashboardFocusActive(label)) return false;
    setDashboardDrilldown(prev => ({ ...prev, status: null }));
    return true;
  };

  const clearDashboardDateFocus = (label: string) => {
    if (!isDashboardFocusActive(label)) return false;
    setDashboardDrilldown(prev => ({ ...prev, date: null }));
    return true;
  };

  const clearDashboardSortFocus = (label: string) => {
    if (!isDashboardFocusActive(label)) return false;
    setDashboardDrilldown(prev => ({ ...prev, sort: null }));
    return true;
  };

  const dashboardDrilldownChips = [
    dashboardDrilldown.date ? { key: "date", label: dashboardDrilldown.date.label } : null,
    dashboardDrilldown.truck ? { key: "truck", label: dashboardDrilldown.truck.label } : null,
    dashboardDrilldown.client ? { key: "client", label: dashboardDrilldown.client.label } : null,
    dashboardDrilldown.status ? { key: "status", label: dashboardDrilldown.status.label } : null,
    dashboardDrilldown.sort ? { key: "sort", label: dashboardDrilldown.sort.label } : null,
  ].filter(Boolean) as Array<{ key: "date" | "truck" | "client" | "status" | "sort"; label: string }>;

  const dashboardChipMeta: Record<"date" | "truck" | "client" | "status" | "sort", { short: string; className: string }> = {
    date: { short: "DAY", className: "bg-blue-50 text-blue-700 border-blue-200" },
    truck: { short: "TRK", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    client: { short: "CLI", className: "bg-violet-50 text-violet-700 border-violet-200" },
    status: { short: "RISK", className: "bg-amber-50 text-amber-700 border-amber-200" },
    sort: { short: "SORT", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };

  const removeDashboardChip = (key: "date" | "truck" | "client" | "status" | "sort") => {
    setDashboardDrilldown(prev => ({ ...prev, [key]: null }));
  };

  const clearDashboardLayer = () => {
    setDashboardDrilldown({
      date: null,
      truck: null,
      client: null,
      status: null,
      sort: null,
    });
  };

  const dashboardSnapshot = useMemo(() => summarizeRoutes(filteredRoutes), [filteredRoutes]);
  const baseSnapshot = useMemo(() => summarizeRoutes(baseRoutes), [baseRoutes]);
  const dashboardCompareStats = useMemo(() => {
    const buildShare = (current: number, base: number) => {
      if (base <= 0) return 0;
      return (current / base) * 100;
    };

    return [
      {
        key: "routes",
        label: "Routes",
        current: dashboardSnapshot.routes,
        base: baseSnapshot.routes,
        share: buildShare(dashboardSnapshot.routes, baseSnapshot.routes),
      },
      {
        key: "loads",
        label: "Loads",
        current: dashboardSnapshot.loads,
        base: baseSnapshot.loads,
        share: buildShare(dashboardSnapshot.loads, baseSnapshot.loads),
      },
      {
        key: "revenue",
        label: "Revenue",
        current: dashboardSnapshot.revenue,
        base: baseSnapshot.revenue,
        share: buildShare(dashboardSnapshot.revenue, baseSnapshot.revenue),
      },
      {
        key: "distance",
        label: "KM",
        current: dashboardSnapshot.distance,
        base: baseSnapshot.distance,
        share: buildShare(dashboardSnapshot.distance, baseSnapshot.distance),
      },
    ];
  }, [dashboardSnapshot, baseSnapshot]);
  const dashboardIntel = useMemo(() => {
    const topClientValue = dashboardData.topClients[0]?.value || 0;
    const topTruckValue = dashboardData.topTrucks[0]?.value || 0;
    const revenueBase = Math.max(dashboardSnapshot.revenue, 1);
    const routeBase = Math.max(dashboardSnapshot.routes, 1);
    const riskRate = (dashboardData.riskRoutes / routeBase) * 100;
    const topClientShare = (topClientValue / revenueBase) * 100;
    const topTruckShare = (topTruckValue / revenueBase) * 100;
    const revenueDensity = dashboardSnapshot.distance > 0 ? dashboardSnapshot.revenue / dashboardSnapshot.distance : 0;

    return [
      {
        key: "risk-pressure",
        label: "Risk Pressure",
        value: `${riskRate.toFixed(0)}%`,
        detail: `${dashboardData.riskRoutes} of ${dashboardSnapshot.routes} routes`,
        tone: riskRate >= 40 ? "text-rose-700 border-rose-200 bg-rose-50/70" : riskRate >= 20 ? "text-amber-700 border-amber-200 bg-amber-50/70" : "text-emerald-700 border-emerald-200 bg-emerald-50/70",
      },
      {
        key: "client-concentration",
        label: "Client Concentration",
        value: `${topClientShare.toFixed(0)}%`,
        detail: dashboardData.topClients[0]?.name || "No client leader",
        tone: topClientShare >= 50 ? "text-violet-700 border-violet-200 bg-violet-50/70" : "text-indigo-700 border-indigo-200 bg-indigo-50/70",
      },
      {
        key: "truck-concentration",
        label: "Truck Concentration",
        value: `${topTruckShare.toFixed(0)}%`,
        detail: dashboardData.topTrucks[0]?.name || "No truck leader",
        tone: topTruckShare >= 40 ? "text-blue-700 border-blue-200 bg-blue-50/70" : "text-sky-700 border-sky-200 bg-sky-50/70",
      },
      {
        key: "revenue-density",
        label: "Revenue Density",
        value: revenueDensity > 0 ? `R ${revenueDensity.toFixed(2)}/km` : "--",
        detail: `${dashboardSnapshot.loads} loads in slice`,
        tone: "text-emerald-700 border-emerald-200 bg-emerald-50/70",
      },
    ];
  }, [dashboardData, dashboardSnapshot]);
  const dashboardAlerts = useMemo(() => {
    const riskBuckets = [...dashboardData.riskDistribution].sort((a, b) => b.count - a.count);
    const topRiskBucket = riskBuckets[0] || null;
    const topClient = dashboardData.topClients[0] || null;
    const topTruck = dashboardData.topTrucks[0] || null;
    const missingKmCount = filteredRoutes.filter((route: any) => getRouteRiskStatus(route).label === "🟡 Missing KM").length;
    const incompleteCount = filteredRoutes.filter((route: any) => getRouteRiskStatus(route).label === "🔴 Incomplete").length;
    const clientShare = dashboardSnapshot.revenue > 0 ? ((topClient?.value || 0) / dashboardSnapshot.revenue) * 100 : 0;
    const truckShare = dashboardSnapshot.revenue > 0 ? ((topTruck?.value || 0) / dashboardSnapshot.revenue) * 100 : 0;

    return [
      {
        key: "exception-leader",
        title: "Exception Leader",
        value: topRiskBucket ? `${topRiskBucket.label} ${topRiskBucket.count}` : "No open exceptions",
        detail: topRiskBucket ? "Click to isolate this risk bucket" : "No risk bucket active",
        className: "border-amber-200 bg-amber-50/70 text-amber-800",
      },
      {
        key: "client-exposure",
        title: "Client Exposure",
        value: topClient ? `${topClient.name} ${clientShare.toFixed(0)}%` : "No client leader",
        detail: topClient ? "Click to isolate top client exposure" : "No client concentration",
        className: clientShare >= 50 ? "border-violet-200 bg-violet-50/70 text-violet-800" : "border-indigo-200 bg-indigo-50/70 text-indigo-800",
      },
      {
        key: "truck-exposure",
        title: "Truck Exposure",
        value: topTruck ? `${topTruck.name} ${truckShare.toFixed(0)}%` : "No truck leader",
        detail: topTruck ? "Click to isolate top truck exposure" : "No truck concentration",
        className: truckShare >= 40 ? "border-blue-200 bg-blue-50/70 text-blue-800" : "border-sky-200 bg-sky-50/70 text-sky-800",
      },
      {
        key: "data-gaps",
        title: "Data Gaps",
        value: `${missingKmCount + incompleteCount} open`,
        detail: `${missingKmCount} missing km · ${incompleteCount} incomplete`,
        className: missingKmCount + incompleteCount > 0 ? "border-rose-200 bg-rose-50/70 text-rose-800" : "border-emerald-200 bg-emerald-50/70 text-emerald-800",
      },
    ];
  }, [dashboardData, dashboardSnapshot, filteredRoutes]);

  const handleAlertClick = (key: string) => {
    if (key === "exception-leader") {
      const topRiskBucket = [...dashboardData.riskDistribution].sort((a, b) => b.count - a.count)[0];
      if (topRiskBucket) handleRiskDistributionClick(topRiskBucket.label);
      return;
    }
    if (key === "client-exposure" && dashboardData.topClients[0]) {
      const label = `Dashboard: Client ${dashboardData.topClients[0].name}`;
      if (clearDashboardTextFocus("client", label)) return;
      setDashboardDrilldown(prev => ({ ...prev, client: { label, value: dashboardData.topClients[0]!.name } }));
      return;
    }
    if (key === "truck-exposure" && dashboardData.topTrucks[0]) {
      const label = `Dashboard: Truck ${dashboardData.topTrucks[0].name}`;
      if (clearDashboardTextFocus("truck", label)) return;
      setDashboardDrilldown(prev => ({ ...prev, truck: { label, value: dashboardData.topTrucks[0]!.name } }));
      return;
    }
    if (key === "data-gaps") {
      const label = "Dashboard: Data gaps";
      if (clearDashboardStatusFocus(label)) return;
      setDashboardDrilldown(prev => ({
        ...prev,
        status: { label, values: ["🔴 Incomplete", "🟡 Missing KM"] },
      }));
    }
  };

  const handleTimelineFocus = (point?: { date?: string; label?: string }, source: "Revenue Pulse" | "Throughput" = "Revenue Pulse") => {
    if (!point?.date) return;
    const label = `Dashboard: ${source} ${point.label ?? point.date}`;
    if (clearDashboardDateFocus(label)) return;
    setDashboardDrilldown(prev => ({ ...prev, date: { label, date: point.date! } }));
  };

  const handleInsightClick = (title: string) => {
    if (title === "Best Day" && dashboardData.timeline.length > 0) {
      const bestDay = dashboardData.timeline.reduce((best, day) => (day.revenue > best.revenue ? day : best), dashboardData.timeline[0]);
      const label = `Dashboard: Best day ${bestDay.label}`;
      if (clearDashboardDateFocus(label)) return;
      setDashboardDrilldown(prev => ({ ...prev, date: { label, date: bestDay.date } }));
      return;
    }
    if (title === "Top Truck" && dashboardData.topTrucks[0]) {
      const label = `Dashboard: Truck ${dashboardData.topTrucks[0].name}`;
      if (clearDashboardTextFocus("truck", label)) return;
      setDashboardDrilldown(prev => ({ ...prev, truck: { label, value: dashboardData.topTrucks[0]!.name } }));
      return;
    }
    if (title === "Top Client" && dashboardData.topClients[0]) {
      const label = `Dashboard: Client ${dashboardData.topClients[0].name}`;
      if (clearDashboardTextFocus("client", label)) return;
      setDashboardDrilldown(prev => ({ ...prev, client: { label, value: dashboardData.topClients[0]!.name } }));
      return;
    }
    if (title === "Attention") {
      const label = "Dashboard: Attention routes";
      if (clearDashboardStatusFocus(label)) return;
      setDashboardDrilldown(prev => ({ ...prev, status: { label, values: attentionStatuses } }));
    }
  };

  const handleKpiTileClick = (label: string) => {
    if (label === "Revenue") {
      if (isDashboardFocusActive("Dashboard: Top revenue routes")) {
        clearDashboardSortFocus("Dashboard: Top revenue routes");
        return;
      }
      setDashboardDrilldown(prev => ({
        ...prev,
        sort: { label: "Dashboard: Top revenue routes", column: "amount", direction: "desc" },
      }));
      return;
    }
    if (label === "Coverage") {
      const focusLabel = "Dashboard: Clean + finalized";
      if (clearDashboardStatusFocus(focusLabel)) return;
      setDashboardDrilldown(prev => ({ ...prev, status: { label: focusLabel, values: ["🟢 Clean", "🔵 Finalized"] } }));
      return;
    }
    if (label === "Risk Ratio") {
      const focusLabel = "Dashboard: Risk routes";
      if (clearDashboardStatusFocus(focusLabel)) return;
      setDashboardDrilldown(prev => ({ ...prev, status: { label: focusLabel, values: attentionStatuses } }));
    }
  };

  const handleRiskDistributionClick = (label: string) => {
    const mapped = dashboardStatusMap[label];
    if (!mapped) return;
    const focusLabel = `Dashboard: ${label}`;
    if (clearDashboardStatusFocus(focusLabel)) return;
    setDashboardDrilldown(prev => ({ ...prev, status: { label: focusLabel, values: [mapped] } }));
  };

  return (
    <div className="h-full min-h-0 flex flex-col relative">
      <div className="flex-shrink-0 space-y-4 relative">
        {/* Sticky Header Wrapper */}
        <div className={`${isHeaderCompact ? "sticky top-0 z-10" : "relative"} bg-white dark:bg-slate-950/60 -mx-4 px-4 pt-4 pb-2 border-b border-gray-200 dark:border-slate-800 shadow-sm mb-4 rounded-b-xl`}>
          {/* A. Header */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Sheets</h1>
              <p className="text-gray-500 dark:text-slate-400 mt-1 text-xs">
                Read-only operational view
              </p>
            </div>
            <button
              onClick={() => setIsHeaderCompact(!isHeaderCompact)}
              className="p-2 rounded-md text-gray-500 hover:text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-900/80 transition-colors"
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
          <div className="mb-3 overflow-x-auto pb-1">
            <div className="grid min-w-[1180px] grid-cols-12 gap-3">
            <div className="col-span-3 bg-gray-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-gray-200 dark:border-slate-800 shadow-sm">
            {/* Mode Selector */}
            <div className="flex gap-3 mb-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dateMode === "single"}
                  onChange={() => setDateMode("single")}
                  className="h-3 w-3 text-black focus:ring-black"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-slate-200">Date</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dateMode === "range"}
                  onChange={() => setDateMode("range")}
                  className="h-3 w-3 text-black focus:ring-black"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-slate-200">Range</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dateMode === "month"}
                  onChange={() => setDateMode("month")}
                  className="h-3 w-3 text-black focus:ring-black"
                />
                <span className="text-xs font-medium text-gray-700 dark:text-slate-200">Month</span>
              </label>
            </div>

            {/* Single Mode Input */}
            {dateMode === "single" && (
              <div>
                <input
                  type="date"
                  value={singleDate}
                  onChange={handleSingleDateChange}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            )}

            {/* Range Mode Inputs */}
            {dateMode === "range" && (
              <div className="space-y-1.5">
                <div className="flex gap-2 items-center">
                  <div>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="border border-gray-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                  </div>
                  <span className="text-gray-400 text-xs">→</span>
                  <div>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="border border-gray-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
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
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
            )}
            </div>

            <div className="col-span-8 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-3 py-2 shadow-sm">
              <div className="grid h-full grid-cols-4 gap-2">
                {dashboardData.insights.map((item) => (
                  (() => {
                    const focusLabel =
                      item.title === "Top Truck" && dashboardData.topTrucks[0]
                        ? `Dashboard: Truck ${dashboardData.topTrucks[0].name}`
                        : item.title === "Top Client" && dashboardData.topClients[0]
                          ? `Dashboard: Client ${dashboardData.topClients[0].name}`
                          : item.title === "Attention"
                            ? "Dashboard: Attention routes"
                            : item.title === "Best Day" && dashboardData.timeline.length > 0
                              ? `Dashboard: Best day ${dashboardData.timeline.reduce((best, day) => (day.revenue > best.revenue ? day : best), dashboardData.timeline[0]).label}`
                              : null;
                    const isActive = focusLabel ? isDashboardFocusActive(focusLabel) : false;
                    return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => handleInsightClick(item.title)}
                    title={item.title === "Best Day" ? "Focus this day" : "Click to focus, click again to clear"}
                    className={`flex min-w-0 flex-col justify-center rounded-md border px-2 py-1.5 text-left transition ${
                      isActive
                        ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-300"
                        : "border-gray-200 dark:border-slate-800 bg-white hover:bg-gray-100 dark:bg-slate-950/40 dark:hover:bg-slate-900/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] uppercase tracking-[0.18em] text-gray-500 dark:text-slate-400">{item.title}</div>
                      <div className="rounded-full border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-gray-600 dark:text-slate-200">
                        {item.badge}
                      </div>
                    </div>
                    <div className={`mt-1 truncate text-xs font-semibold ${item.tone}`}>{item.value}</div>
                  </button>
                    );
                  })()
                ))}
              </div>
            </div>

            <div className="col-span-1 flex flex-col items-end gap-2">
               <button
                 onClick={clearFilters}
                 title="Clear filters"
                 className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-gray-700 dark:text-slate-200 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-blue-500"
               >
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <path d="M3 6h18"></path>
                   <path d="M7 12h10"></path>
                   <path d="M10 18h4"></path>
                 </svg>
               </button>

               <button
                 onClick={() => setIsImportModalOpen(true)}
                 title="Import"
                 className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-gray-700 dark:text-slate-200 shadow-sm transition-all hover:bg-gray-50 dark:hover:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-blue-500"
               >
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <path d="M12 21V9"></path>
                   <path d="M7 14l5-5 5 5"></path>
                   <path d="M5 3h14"></path>
                 </svg>
               </button>

               <ExportDropdown compact onExport={handleExport} />
            </div>
            </div>
          </div>
          )}

          {/* Bulk Action Bar */}
          <div className={selectedRouteIds.size > 0 ? "block mb-4" : "hidden"}>
             <div className="bg-slate-950/60 backdrop-blur-sm text-white px-6 py-3 rounded-lg flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 border border-slate-800">
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
                <div className="mb-4">
                  <div className="overflow-auto rounded-lg pb-1">
                    <div className="grid min-h-[164px] min-w-[1240px] grid-cols-12 gap-2">
                    <div className="col-span-3 grid min-h-[164px] grid-cols-2 gap-1.5">
                      {dashboardData.kpiTiles.map((card) => {
                        const isPositive = card.delta >= 0;
                        const deltaGood = card.deltaGoodWhenPositive ? isPositive : !isPositive;
                        const deltaClass = deltaGood ? "text-emerald-700 bg-emerald-50 border border-emerald-200/80" : "text-rose-700 bg-rose-50 border border-rose-200/80";
                        const isInteractive = ["Revenue", "Coverage", "Risk Ratio"].includes(card.label);
                        const isActive =
                          (card.label === "Revenue" && isDashboardFocusActive("Dashboard: Top revenue routes")) ||
                          (card.label === "Coverage" && isDashboardFocusActive("Dashboard: Clean + finalized")) ||
                          (card.label === "Risk Ratio" && isDashboardFocusActive("Dashboard: Risk routes"));
                        return (
                        <button
                          key={card.label}
                          type="button"
                          onClick={() => isInteractive && handleKpiTileClick(card.label)}
                          title={isInteractive ? "Click to focus, click again to clear" : undefined}
                          className={`flex flex-col justify-between rounded-lg border bg-gradient-to-br ${card.accent} p-1.5 text-left shadow-sm ${
                            isActive
                              ? "border-blue-300 ring-1 ring-blue-300"
                              : "border-gray-200 dark:border-slate-800"
                          } ${isInteractive ? "transition hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-900/80" : "cursor-default"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-slate-400">{card.label}</div>
                            <div className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${deltaClass}`}>
                              {isPositive ? "+" : ""}{card.delta.toFixed(0)}%
                            </div>
                          </div>
                          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">{card.value}</div>
                          <div className="text-[10px] text-gray-500 dark:text-slate-400 truncate">{card.subtext}</div>
                          <div className="h-5">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={card.data}>
                                <Line
                                  type="monotone"
                                  dataKey="value"
                                  stroke={card.line}
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </button>
                      )})}
                    </div>

                    <div className="col-span-5 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 p-2.5 shadow-sm">
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200">Revenue Pulse</h3>
                          <p className="text-[10px] text-gray-500 dark:text-slate-400">Trend in current selection</p>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-400">Best Day</div>
                          <button
                            type="button"
                            onClick={() => handleInsightClick("Best Day")}
                            className="text-xs font-bold text-emerald-700 hover:underline"
                          >
                            {dashboardData.insights[0]?.value ?? "No data"}
                          </button>
                        </div>
                      </div>
                      <div className="h-[118px] cursor-pointer">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={dashboardData.timeline}
                            onClick={(state: any) => handleTimelineFocus(state?.activePayload?.[0]?.payload, "Revenue Pulse")}
                          >
                            <defs>
                              <linearGradient id="sheetsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip formatter={((value: number | undefined) => formatZAR(Number(value ?? 0))) as any} />
                            <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#sheetsRevenueFill)" strokeWidth={2} activeDot={{ r: 5, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-1 grid grid-cols-3 gap-1.5">
                        <div className="rounded border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400">Net</div>
                          <div className="text-[10px] font-semibold text-gray-900 dark:text-gray-100">{formatCompactCurrency(kpiStats.totalRevenue)}</div>
                        </div>
                        <div className="rounded border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400">Avg</div>
                          <div className="text-[10px] font-semibold text-blue-700">{formatCompactCurrency(dashboardData.avgRevenuePerRoute)}</div>
                        </div>
                        <div className="rounded border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 px-2 py-1">
                          <div className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400">R/KM</div>
                          <div className="text-[10px] font-semibold text-emerald-700">{kpiStats.avgRPerKm > 0 ? `R ${kpiStats.avgRPerKm.toFixed(2)}` : "--"}</div>
                        </div>
                      </div>
                      <div className="mt-1 text-[9px] uppercase tracking-wider text-gray-400">Click chart points to focus that day</div>
                    </div>

                    <div className="col-span-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 p-2.5 shadow-sm">
                      <div className="mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200">Throughput</h3>
                        <p className="text-[10px] text-gray-500 dark:text-slate-400">Daily km moved</p>
                      </div>
                      <div className="h-[118px] cursor-pointer">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={dashboardData.timeline}
                            onClick={(state: any) => handleTimelineFocus(state?.activePayload?.[0]?.payload, "Throughput")}
                          >
                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip formatter={((value: number | undefined) => `${Number(value ?? 0).toFixed(0)} km`) as any} />
                            <Bar dataKey="distance" fill="#10b981" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-1 rounded border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 px-2 py-1">
                        <div className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400">Distance Delta</div>
                        <div className={`text-[10px] font-semibold ${dashboardData.kpiTiles[2].delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {dashboardData.kpiTiles[2].delta >= 0 ? "+" : ""}{dashboardData.kpiTiles[2].delta.toFixed(0)}%
                        </div>
                      </div>
                      <div className="mt-1 text-[9px] uppercase tracking-wider text-gray-400">Click bars to focus that day</div>
                    </div>

                    <div className="col-span-2 grid min-h-[164px] grid-rows-2 gap-1.5">
                      <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 p-2.5 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200">Leaders</h3>
                            <p className="text-[10px] text-gray-500 dark:text-slate-400">Top performers</p>
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!dashboardData.topTrucks[0]) return;
                              const label = `Dashboard: Truck ${dashboardData.topTrucks[0].name}`;
                              if (clearDashboardTextFocus("truck", label)) return;
                              setDashboardDrilldown(prev => ({ ...prev, truck: { label, value: dashboardData.topTrucks[0]!.name } }));
                            }}
                            title="Click to focus, click again to clear"
                            className={`w-full rounded-md border px-2 py-1 text-left transition ${
                              dashboardData.topTrucks[0] && isDashboardFocusActive(`Dashboard: Truck ${dashboardData.topTrucks[0].name}`)
                                ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-300"
                                : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 hover:bg-gray-50 dark:hover:bg-slate-900/80"
                            }`}
                          >
                            <div className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400">Truck</div>
                            <div className="truncate text-xs font-semibold text-blue-700">
                              {dashboardData.topTrucks[0] ? `${dashboardData.topTrucks[0].name} · ${formatCompactCurrency(dashboardData.topTrucks[0].value)}` : "No data"}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!dashboardData.topClients[0]) return;
                              const label = `Dashboard: Client ${dashboardData.topClients[0].name}`;
                              if (clearDashboardTextFocus("client", label)) return;
                              setDashboardDrilldown(prev => ({ ...prev, client: { label, value: dashboardData.topClients[0]!.name } }));
                            }}
                            title="Click to focus, click again to clear"
                            className={`w-full rounded-md border px-2 py-1 text-left transition ${
                              dashboardData.topClients[0] && isDashboardFocusActive(`Dashboard: Client ${dashboardData.topClients[0].name}`)
                                ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-300"
                                : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 hover:bg-gray-50 dark:hover:bg-slate-900/80"
                            }`}
                          >
                            <div className="text-[9px] uppercase tracking-wider text-gray-500 dark:text-slate-400">Client</div>
                            <div className="truncate text-xs font-semibold text-violet-700">
                              {dashboardData.topClients[0] ? `${dashboardData.topClients[0].name} · ${formatCompactCurrency(dashboardData.topClients[0].value)}` : "No data"}
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 p-2.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-slate-200">Health Mix</h3>
                            <p className="text-[10px] text-gray-500 dark:text-slate-400">Status balance</p>
                          </div>
                          <div className="text-xs font-bold text-amber-700">{dashboardData.riskRoutes}</div>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-[66px] w-[66px] shrink-0">
                            {dashboardData.riskDistribution.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={dashboardData.riskDistribution} dataKey="count" innerRadius={16} outerRadius={28} paddingAngle={2}>
                                    {dashboardData.riskDistribution.map((entry) => (
                                      <Cell key={entry.label} fill={entry.color} onClick={() => handleRiskDistributionClick(entry.label)} style={{ cursor: "pointer" }} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={((_value: number | undefined, _name: string, props: any) => [`${_value ?? 0} routes`, props?.payload?.label || ""]) as any} />
                                </PieChart>
                              </ResponsiveContainer>
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            {dashboardData.riskDistribution.slice(0, 3).map((entry) => (
                              <button
                                key={entry.label}
                                type="button"
                                onClick={() => handleRiskDistributionClick(entry.label)}
                                title="Click to focus, click again to clear"
                                className={`flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-[10px] transition ${
                                  isDashboardFocusActive(`Dashboard: ${entry.label}`)
                                    ? "bg-blue-50 ring-1 ring-blue-300"
                                    : "hover:bg-gray-100 dark:hover:bg-slate-800/60"
                                }`}
                              >
                                <div className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-slate-300">
                                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                  <span className="truncate">{entry.label}</span>
                                </div>
                                <span className="font-semibold text-gray-900 dark:text-gray-100">{entry.count}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact View */}
              {isHeaderCompact && (
                <div className="mb-4 overflow-x-auto">
                  <div className="flex min-w-max items-stretch gap-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/40 p-2">
                    <div className="flex items-center rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-2 py-1.5">
                      {renderCompactDateControls()}
                    </div>

                    <div className="min-w-[112px] rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                          <path d="M9 11l3 3L22 4"></path>
                          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">Loads</span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{kpiStats.loadsDone}</div>
                    </div>

                    <div className="min-w-[132px] rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
                          <line x1="12" y1="1" x2="12" y2="23"></line>
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">Revenue</span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{formatCompactCurrency(kpiStats.totalRevenue)}</div>
                    </div>

                    <div className="min-w-[112px] rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
                          <circle cx="12" cy="12" r="1"></circle>
                          <path d="M12 11v2"></path>
                          <path d="M4 3h16v16H4z"></path>
                        </svg>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">Km</span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{formatCompactDistance(kpiStats.totalDistance)} km</div>
                    </div>

                    <div className="min-w-[112px] rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                          <polyline points="17 6 23 6 23 12"></polyline>
                        </svg>
                        <span className="text-[10px] text-gray-500 dark:text-slate-400">R/KM</span>
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{kpiStats.avgRPerKm > 0 ? kpiStats.avgRPerKm.toFixed(0) : "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Clear Filters Bar */}
          {(filters.date || filters.truck || filters.trailer || filters.driver || filters.from || filters.to || filters.status.length > 0 || filters.amountMin || filters.amountMax || sortConfig.column || dashboardDrilldownChips.length > 0) && (
            <div className="bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-800 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                {dashboardDrilldownChips.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700 dark:text-slate-200">Dashboard layer:</span>
                      {dashboardDrilldownChips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => removeDashboardChip(chip.key)}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${dashboardChipMeta[chip.key].className}`}
                          title="Clear dashboard drill-down"
                        >
                          <span className="text-[9px] font-bold tracking-wider">{dashboardChipMeta[chip.key].short}</span>
                          <span>{chip.label}</span>
                          <span className="text-[10px]">x</span>
                        </button>
                      ))}
                      <div className="ml-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-200">{dashboardSnapshot.routes} routes</span>
                        <span className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-200">{dashboardSnapshot.loads} loads</span>
                        <span className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-200">{formatCompactCurrency(dashboardSnapshot.revenue)}</span>
                        <span className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-200">{formatCompactDistance(dashboardSnapshot.distance)} km</span>
                        <span className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-200">{dashboardSnapshot.trucks} trucks</span>
                        <span className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-[11px] text-gray-700 dark:text-slate-200">{dashboardSnapshot.clients} clients</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-medium text-gray-700 dark:text-slate-200">Slice vs base:</span>
                      {dashboardCompareStats.map((stat) => (
                        <span key={stat.key} className="rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-950/40 px-2 py-0.5 text-gray-700 dark:text-slate-200">
                          {stat.label} {stat.key === "revenue"
                            ? formatCompactCurrency(stat.current)
                            : stat.key === "distance"
                              ? `${formatCompactDistance(stat.current)} km`
                              : stat.current}
                          {" / "}
                          {stat.key === "revenue"
                            ? formatCompactCurrency(stat.base)
                            : stat.key === "distance"
                              ? `${formatCompactDistance(stat.base)} km`
                              : stat.base}
                          {" · "}
                          {stat.share.toFixed(0)}%
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-medium text-gray-700">Intelligence:</span>
                      {dashboardIntel.map((item) => (
                        <div
                          key={item.key}
                          className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 ${item.tone}`}
                          title={item.detail}
                        >
                          <span className="font-semibold">{item.label}</span>
                          <span>{item.value}</span>
                          <span className="max-w-[180px] truncate text-[10px] opacity-80">{item.detail}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-medium text-gray-700">Alerts:</span>
                      {dashboardAlerts.map((alert) => (
                        <button
                          key={alert.key}
                          type="button"
                          onClick={() => handleAlertClick(alert.key)}
                          title={alert.detail}
                          className={`inline-flex items-center gap-2 rounded border px-2 py-0.5 transition hover:opacity-85 ${alert.className}`}
                        >
                          <span className="font-semibold">{alert.title}</span>
                          <span>{alert.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="font-medium">Active filters:</span>
                  {Object.entries(filters).filter(([key, val]) => Array.isArray(val) ? val.length > 0 : !!val).map(([key]) => (
                    <span key={key} className="bg-transparent px-2 py-0.5 rounded border border-gray-300 dark:border-slate-700 capitalize">
                      {key}
                    </span>
                  ))}
                  {sortConfig.column && (
                    <span className="bg-transparent px-2 py-0.5 rounded border border-gray-300 dark:border-slate-700">
                      Sorted: {sortConfig.column} {sortConfig.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {dashboardDrilldownChips.length > 0 && (
                  <button
                    onClick={clearDashboardLayer}
                    className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    Clear Dashboard
                  </button>
                )}
                
                <button
                  onClick={clearFilters}
                  className="text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scrollbar-hidden">
        {/* C. Route list (core) */}
        <div className={`${BASE_CONTAINER_CLASS} overflow-visible`}>
        <div className="sticky top-0 z-30 bg-white/90 dark:bg-slate-950/70 backdrop-blur-sm shadow-sm border-b border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/40 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Table Controls</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPicker((prev) => !prev)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  showColumnPicker
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900/80"
                }`}
              >
                Columns
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xl">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Show / Hide Columns</div>
                  <div className="space-y-1.5">
                    {(Object.keys(TABLE_COLUMN_LABELS) as ResizableTableColumnKey[]).map((key) => (
                      <label key={key} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-slate-800/60">
                        <span className="text-gray-700 dark:text-slate-200">{TABLE_COLUMN_LABELS[key]}</span>
                        <input
                          type="checkbox"
                          checked={tableColumnVisibility[key]}
                          onChange={() => toggleTableColumnVisibility(key)}
                          className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-700"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowTableGrid((prev) => !prev)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                showTableGrid
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-900/80"
              }`}
            >
              {showTableGrid ? "Grid On" : "Grid Off"}
            </button>
            <button
              type="button"
              onClick={resetTableColumnWidths}
              className="rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-slate-200 transition-colors hover:bg-gray-50 dark:hover:bg-slate-900/80"
            >
              Reset Widths
            </button>
          </div>
        </div>
        <div
          ref={tableHeaderScrollRef}
          className="overflow-x-auto overflow-y-hidden scrollbar-hidden"
          onScroll={() => {
            if (syncingTableScrollRef.current === "body") return;
            syncTableHorizontalScroll("header");
          }}
        >
        {/* Table Header */}
        <div
          className={`grid min-w-max bg-gray-100/80 dark:bg-slate-950/40 px-3 py-4 border-b border-gray-200 dark:border-slate-800 text-[12px] font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider items-center ${
            showTableGrid
              ? "gap-0 [&>*]:border-r [&>*]:border-gray-300 dark:[&>*]:border-slate-800 [&>*:last-child]:border-r-0 [&>*]:px-2"
              : "gap-2"
          }`}
          style={{ gridTemplateColumns: tableGridTemplateColumns }}
        >
          
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
          <div className={`group col-span-1 relative pr-3 ${getColumnVisibilityClass("date")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("date")}
          </div>

          {/* Truck Column Header */}
          <div className={`group col-span-1 relative pr-3 ${getColumnVisibilityClass("truck")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("truck")}
          </div>

          {/* Trailer Column Header */}
          <div className={`group col-span-1 relative pr-3 ${getColumnVisibilityClass("trailer")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("trailer")}
          </div>

          {/* Client Column Header */}
          <div className={`group col-span-1 relative pr-3 ${getColumnVisibilityClass("client")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("client")}
          </div>

          {/* Driver Column Header */}
          <div className={`group col-span-2 relative pr-3 ${getColumnVisibilityClass("driver")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("driver")}
          </div>

          {/* From Column Header */}
          <div className={`group col-span-2 relative pr-3 ${getColumnVisibilityClass("from")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("from")}
          </div>

          {/* To Column Header */}
          <div className={`group col-span-2 relative pr-3 ${getColumnVisibilityClass("to")}`}>
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
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("to")}
          </div>

          {/* Notes Column Header (TRAE-ADDED) */}
          <div className={`group col-span-2 relative pr-3 ${getColumnVisibilityClass("notes")}`}>
            Notes
            {renderColumnResizeHandle("notes")}
          </div>

          {/* Amount Column Header */}
          <div className={`group col-span-1 relative pr-3 text-right ${getColumnVisibilityClass("amount")}`}>
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
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("amount")}
          </div>

          {/* R/KM Column Header (TRAE-ADDED) */}
          <div className={`group col-span-1 relative pr-3 text-right ${getColumnVisibilityClass("rkm")}`}>
            R / KM
            {renderColumnResizeHandle("rkm")}
          </div>

          {/* Status Column Header */}
          <div className={`group col-span-1 relative pr-3 text-right ${getColumnVisibilityClass("status")}`}>
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
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg p-2 z-50 min-w-[150px]">
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
            {renderColumnResizeHandle("status")}
          </div>
        </div>
        </div>
        </div>

        {/* Close dropdown when clicking outside */}
        {(showFilterDropdown || showColumnPicker) && (
          <div
            className="fixed inset-0 z-20"
            onClick={() => {
              setShowFilterDropdown(null);
              setShowColumnPicker(false);
            }}
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
          <div
            ref={tableBodyScrollRef}
            className="overflow-x-auto overflow-y-visible scrollbar-hidden"
            onScroll={() => {
              if (syncingTableScrollRef.current === "header") return;
              syncTableHorizontalScroll("body");
            }}
          >
          <div className={showTableGrid ? "divide-y divide-gray-200 dark:divide-white/10" : "divide-y divide-gray-100 dark:divide-white/5"}>
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
                  className={`group transition-colors ${isLocked ? "opacity-60" : "hover:bg-gray-50 dark:hover:bg-slate-900/70"} ${isSelected ? "bg-gray-200 dark:bg-slate-900/80" : ""} ${isActive ? "bg-gray-100 dark:bg-slate-950/40 ring-1 ring-inset ring-gray-300 dark:ring-slate-700" : ""}`}
                >
                  {/* Summary Row */}
                  <div
                    className={`grid min-w-max px-3 py-2.5 items-center text-xs cursor-pointer ${
                      showTableGrid
                        ? "gap-0 [&>*]:border-r [&>*]:border-gray-200 dark:[&>*]:border-slate-800 [&>*:last-child]:border-r-0 [&>*]:px-2"
                        : "gap-2"
                    } ${isLocked ? "opacity-60" : ""}`}
                    style={{ gridTemplateColumns: tableGridTemplateColumns }}
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
                    <div className={`col-span-1 text-gray-600 text-[11px] font-mono truncate ${getColumnVisibilityClass("date")}`}>
                      {route.routeDate ? (() => {
                        const date = new Date(route.routeDate);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = String(date.getFullYear()).slice(-2);
                        return `${day}/${month}/${year}`;
                      })() : "-"}
                    </div>

                    {/* Truck */}
                    <div className={`col-span-1 font-medium text-gray-900 dark:text-gray-100 truncate ${getColumnVisibilityClass("truck")}`}>
                      {route.truckFleetNoStr || "-"}
                    </div>

                    {/* Trailer */}
                    <div className={`col-span-1 text-gray-600 truncate ${getColumnVisibilityClass("trailer")}`}>
                      {route.trailerFleetNoStr || "-"}
                    </div>

                    {/* Client */}
                    <div className={`col-span-1 text-gray-700 font-medium truncate ${getColumnVisibilityClass("client")}`} title={route.client}>
                      {route.client || "-"}
                    </div>

                    {/* Driver */}
                    <div className={`col-span-2 text-gray-700 font-medium truncate ${getColumnVisibilityClass("driver")}`} title={route.driverName}>
                      {getDriverDisplay(route.driverName)}
                    </div>

                    {/* From */}
                    <div className={`col-span-2 text-gray-600 truncate ${getColumnVisibilityClass("from")}`} title={fromDisplay}>
                      {fromDisplay}
                    </div>

                    {/* To */}
                    <div className={`col-span-2 text-gray-600 truncate ${getColumnVisibilityClass("to")}`} title={toDisplay}>
                      {toDisplay}
                    </div>

                    {/* Notes */}
                    <div className={`col-span-2 text-gray-500 text-[11px] italic truncate ${getColumnVisibilityClass("notes")}`} title={route.notes}>
                      {route.notes ? (route.notes.length > 40 ? route.notes.slice(0, 40) + "..." : route.notes) : ""}
                    </div>

                    {/* Amount */}
                    <div className={`col-span-1 text-right font-mono font-medium text-gray-900 dark:text-gray-100 ${getColumnVisibilityClass("amount")}`}>
                      {formatZAR(route.rate || 0)}
                    </div>

                    {/* R/KM Badge */}
                    <div className={`col-span-1 text-right flex justify-end ${getColumnVisibilityClass("rkm")}`}>
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
                    <div className={`col-span-1 text-right ${getColumnVisibilityClass("status")}`}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${statusBgColor}`}>
                        {riskStatus.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
          <div className="w-full max-w-xl bg-white dark:bg-slate-950 border-l border-gray-200 dark:border-slate-800 flex flex-col h-full shadow-2xl pointer-events-auto overflow-hidden">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 shrink-0">
              <div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-semibold">Route Detail</p>
                <h2 className="text-sm font-black text-gray-900 dark:text-gray-100 mt-0.5">
                  Truck {selectedRoute.truckFleetNoStr ?? "—"} · {selectedRoute.routeDate}
                </h2>
              </div>
              <button
                onClick={closePanel}
                className="text-gray-500 hover:text-gray-900 dark:text-gray-100 text-lg font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
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
          <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 scale-100">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeConfirm}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                disabled={confirmDialog.isLoading}
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                disabled={confirmDialog.isLoading}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 ${
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
