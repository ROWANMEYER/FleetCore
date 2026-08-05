"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calculateLoadAmount } from "@/convex/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SpreadsheetRow {
  routeId: string;
  loadIndex: number;
  truckNo: string;
  trailerNo: string;
  loadNo: string;
  date: string;
  driverName: string;
  origin: string;
  destination: string;
  customer: string;
  amount: number;
  notes: string;
}

interface EditingCell {
  routeId: string;
  loadIndex: number;
  field: keyof Pick<SpreadsheetRow, "customer" | "origin" | "destination">;
}

interface Props {
  routes: any[];
  updateLoadFields: (args: {
    routeId: string;
    loadIndex: number;
    patch: Record<string, any>;
  }) => Promise<any>;
  onTruckClick?: (truckNo: string) => void;
  onLoadClick?: (routeId: string, loadNo: string) => void;
  density?: 'comfortable' | 'compact';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNumberSafe(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value)
    .replace(/[A-Za-z]/g, "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function formatZAR(value: number): string {
  const parts = value.toFixed(2).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R ${integerPart},${parts[1]}`;
}

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).padStart(4, "0");
  return `${day} ${month} ${year}`;
}

function isShipmentRef(notes: string): boolean {
  if (!notes) return false;
  return /SHIP(?:MENT)?\s*SH?\d+/i.test(notes) || /SHIP(?:MENT)?\s*\w+/i.test(notes) || /SH\d{5,}/i.test(notes);
}

function isMtoForestry(customer: string): boolean {
  if (!customer) return false;
  return customer.toUpperCase() === "MTO FORESTRY";
}

// ─── Column configuration ───────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  align: "left" | "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "truckNo", label: "Truck", defaultWidth: 92, minWidth: 72, sortable: true, align: "left" },
  { key: "trailerNo", label: "Trailer", defaultWidth: 92, minWidth: 72, sortable: false, align: "left" },
  { key: "loadNo", label: "Load No", defaultWidth: 100, minWidth: 72, sortable: false, align: "left" },
  { key: "date", label: "Date", defaultWidth: 120, minWidth: 82, sortable: true, align: "left" },
  { key: "driverName", label: "Driver", defaultWidth: 160, minWidth: 100, sortable: false, align: "left" },
  { key: "origin", label: "Origin", defaultWidth: 140, minWidth: 96, sortable: false, align: "left" },
  { key: "destination", label: "Dest", defaultWidth: 140, minWidth: 96, sortable: false, align: "left" },
  { key: "customer", label: "Client", defaultWidth: 160, minWidth: 96, sortable: false, align: "left" },
  { key: "amount", label: "Amount", defaultWidth: 130, minWidth: 96, sortable: false, align: "right" },
  { key: "notes", label: "Notes", defaultWidth: 280, minWidth: 120, sortable: false, align: "left" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const STORAGE_KEY = "fleetcore.spreadsheetColumnWidths";
const VISIBILITY_STORAGE_KEY = "fleetcore.spreadsheetColumnVisibility";
const ORDER_STORAGE_KEY = "fleetcore.spreadsheetColumnOrder";
const PROFILES_STORAGE_KEY = "fleetcore.spreadsheetLayoutProfiles";

interface LayoutProfile {
  name: string;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  columnVisibility: Record<string, boolean>;
}

const MIN_COLUMN_WIDTH = 60;

const DEFAULT_COLUMN_ORDER = COLUMNS.map((c) => c.key);

// ─── Component ───────────────────────────────────────────────────────────────

export default function SpreadsheetDataTable({ routes, updateLoadFields, onTruckClick, onLoadClick, density = 'comfortable' }: Props) {
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Column width state with localStorage persistence ───────────────────────
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") {
      const initial: Record<string, number> = {};
      for (const col of COLUMNS) initial[col.key] = col.defaultWidth;
      return initial;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, number>;
        // Merge saved with defaults to ensure all columns exist
        const merged: Record<string, number> = {};
        for (const col of COLUMNS) {
          merged[col.key] = parsed[col.key] ?? col.defaultWidth;
        }
        return merged;
      }
    } catch { /* ignore */ }
    const initial: Record<string, number> = {};
    for (const col of COLUMNS) initial[col.key] = col.defaultWidth;
    return initial;
  });

  // Persist widths on change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columnWidths));
    } catch { /* ignore quota errors */ }
  }, [columnWidths]);

  // ── Column visibility state with localStorage persistence ─────────────────
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      const initial: Record<string, boolean> = {};
      for (const col of COLUMNS) initial[col.key] = true;
      return initial;
    }
    try {
      const saved = window.localStorage.getItem(VISIBILITY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        const merged: Record<string, boolean> = {};
        for (const col of COLUMNS) {
          merged[col.key] = parsed[col.key] ?? true;
        }
        return merged;
      }
    } catch { /* ignore */ }
    const initial: Record<string, boolean> = {};
    for (const col of COLUMNS) initial[col.key] = true;
    return initial;
  });

  // Persist visibility on change
  useEffect(() => {
    try {
      window.localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch { /* ignore quota errors */ }
  }, [columnVisibility]);

  // Close column menu on outside click
  useEffect(() => {
    if (!showColumnMenu) return;
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColumnMenu]);

  // ── Column order state with localStorage persistence ──────────────────────
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...DEFAULT_COLUMN_ORDER];
    try {
      const saved = window.localStorage.getItem(ORDER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        // Ensure all columns are present, append any missing at the end
        const existing = new Set(parsed);
        for (const key of DEFAULT_COLUMN_ORDER) {
          if (!existing.has(key)) parsed.push(key);
        }
        // Filter out any invalid keys
        const valid = new Set(DEFAULT_COLUMN_ORDER);
        return parsed.filter((k) => valid.has(k));
      }
    } catch { /* ignore */ }
    return [...DEFAULT_COLUMN_ORDER];
  });

  // Persist order on change
  useEffect(() => {
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch { /* ignore quota errors */ }
  }, [columnOrder]);

  // ── Layout profiles state ─────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<LayoutProfile[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(PROFILES_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as LayoutProfile[];
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* ignore */ }
    return [];
  });

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");

  // Persist profiles on change
  useEffect(() => {
    try {
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch { /* ignore quota errors */ }
  }, [profiles]);

  // Close layout menu on outside click
  useEffect(() => {
    if (!showLayoutMenu) return;
    const handler = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) {
        setShowLayoutMenu(false);
        setLayoutSaving(false);
        setNewLayoutName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLayoutMenu]);

  const saveCurrentLayout = useCallback(() => {
    const name = newLayoutName.trim();
    if (!name) return;
    const profile: LayoutProfile = {
      name,
      columnOrder: [...columnOrder],
      columnWidths: { ...columnWidths },
      columnVisibility: { ...columnVisibility },
    };
    setProfiles((prev) => {
      const idx = prev.findIndex((p) => p.name === name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = profile;
        return next;
      }
      return [...prev, profile];
    });
    setLayoutSaving(false);
    setNewLayoutName("");
    setShowLayoutMenu(false);
  }, [newLayoutName, columnOrder, columnWidths, columnVisibility]);

  const loadLayout = useCallback((profile: LayoutProfile) => {
    setColumnOrder([...profile.columnOrder]);
    setColumnWidths({ ...profile.columnWidths });
    setColumnVisibility({ ...profile.columnVisibility });
    setShowLayoutMenu(false);
  }, []);

  const deleteLayout = useCallback((name: string) => {
    setProfiles((prev) => prev.filter((p) => p.name !== name));
  }, []);

  const resetToDefaults = useCallback(() => {
    setColumnOrder([...DEFAULT_COLUMN_ORDER]);
    const defaultWidths: Record<string, number> = {};
    const defaultVisibility: Record<string, boolean> = {};
    for (const col of COLUMNS) {
      defaultWidths[col.key] = col.defaultWidth;
      defaultVisibility[col.key] = true;
    }
    setColumnWidths(defaultWidths);
    setColumnVisibility(defaultVisibility);
    setShowLayoutMenu(false);
  }, []);

  // ── Column drag-and-drop state ────────────────────────────────────────────
  const draggedColumnRef = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDragStart = useCallback((key: string, e: React.DragEvent) => {
    draggedColumnRef.current = key;
    e.dataTransfer.effectAllowed = "move";
    // Slightly transparent drag image
    if (e.dataTransfer.setDragImage && e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.dataTransfer.setDragImage(e.currentTarget, rect.width / 2, rect.height / 2);
    }
  }, []);

  const handleDragOver = useCallback((key: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (key !== draggedColumnRef.current) {
      setDragOverKey(key);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverKey(null);
  }, []);

  const handleDrop = useCallback((targetKey: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceKey = draggedColumnRef.current;
    if (!sourceKey || sourceKey === targetKey) {
      setDragOverKey(null);
      return;
    }

    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== sourceKey);
      const targetIdx = next.indexOf(targetKey);
      if (targetIdx === -1) {
        next.push(sourceKey);
      } else {
        next.splice(targetIdx, 0, sourceKey);
      }
      return next;
    });
    setDragOverKey(null);
    draggedColumnRef.current = null;
  }, []);

  const handleDragEnd = useCallback(() => {
    draggedColumnRef.current = null;
    setDragOverKey(null);
  }, []);

  // ── Column resize state ────────────────────────────────────────────────────
  const resizingColumnRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const startColumnResize = useCallback((key: string, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key],
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [columnWidths]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizingColumnRef.current) return;
      const { key, startX, startWidth } = resizingColumnRef.current;
      const delta = e.clientX - startX;
      const col = COLUMNS.find((c) => c.key === key);
      const minW = col?.minWidth ?? MIN_COLUMN_WIDTH;
      const nextWidth = Math.max(minW, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    };

    const onMouseUp = () => {
      if (!resizingColumnRef.current) return;
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

  // Auto-fit a column to content (double-click on handle)
  const autoFitColumn = useCallback((key: string) => {
    // Simple auto-fit: set to default width
    const col = COLUMNS.find((c) => c.key === key);
    if (col) {
      setColumnWidths((prev) => ({ ...prev, [key]: col.defaultWidth }));
    }
  }, []);

  // Render resize handle
  const renderResizeHandle = useCallback((key: string) => (
    <div
      onMouseDown={(e) => startColumnResize(key, e)}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        autoFitColumn(key);
      }}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none z-10 group"
      title="Drag to resize, double-click to auto-fit"
    >
      <div className="absolute right-0 top-1/2 h-6 w-px -translate-y-1/2 bg-[var(--card-border)] group-hover:bg-[#06B6D4] transition-colors" />
    </div>
  ), [startColumnResize, autoFitColumn]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Flatten routes into per-load rows
  const rows: SpreadsheetRow[] = useMemo(() => {
    if (!routes || routes.length === 0) return [];

    const result: SpreadsheetRow[] = [];

    for (const route of routes) {
      const loads = route.loads || [];
      if (loads.length === 0) {
        // Route with no loads — show as one row
        result.push({
          routeId: route._id,
          loadIndex: -1,
          truckNo: route.truckFleetNoStr || String(route.truckFleetNo || ""),
          trailerNo: route.trailerFleetNoStr || String(route.trailerFleetNo || ""),
          loadNo: "",
          date: formatDate(route.routeDate),
          driverName: (route.driverName || "").toUpperCase(),
          origin: "",
          destination: "",
          customer: route.client || "",
          amount: Number(route.rate) || 0,
          notes: route.notes || "",
        });
      } else {
        loads.forEach((load: any, index: number) => {
          const qty = parseNumberSafe(load.quantity);
          const rate = parseNumberSafe(load.rate);
          const amount = calculateLoadAmount(qty, rate, load.rateType || "per_unit");

          result.push({
            routeId: route._id,
            loadIndex: index,
            truckNo: route.truckFleetNoStr || String(route.truckFleetNo || ""),
            trailerNo: route.trailerFleetNoStr || String(route.trailerFleetNo || ""),
            loadNo: load.loadId || String(index + 1),
            date: formatDate(route.routeDate),
            driverName: (route.driverName || "").toUpperCase(),
            origin: ((load.fromLocations && load.fromLocations[0]) || "").toUpperCase(),
            destination: ((load.toLocations && load.toLocations[0]) || "").toUpperCase(),
            customer: (load.client || "").toUpperCase(),
            amount,
            notes: route.notes || "",
          });
        });
      }
    }

    return result;
  }, [routes]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortKey === "truckNo") {
        aVal = parseInt(a.truckNo, 10) || 0;
        bVal = parseInt(b.truckNo, 10) || 0;
      } else if (sortKey === "date") {
        aVal = a.date;
        bVal = b.date;
      }

      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  // Handle sort
  const handleSort = useCallback((key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  // Start editing a cell
  const startEditing = useCallback(
    (row: SpreadsheetRow, field: EditingCell["field"]) => {
      setEditingCell({
        routeId: row.routeId,
        loadIndex: row.loadIndex,
        field,
      });
      setEditValue(row[field]);
    },
    []
  );

  // Save the edited cell
  const saveEdit = useCallback(async () => {
    if (!editingCell) return;

    const { routeId, loadIndex, field } = editingCell;
    const cellKey = `${routeId}_${loadIndex}_${field}`;
    setSavingCell(cellKey);

    try {
      const patch: Record<string, any> = {};
      if (field === "customer") {
        patch.client = editValue;
      } else if (field === "origin") {
        patch.fromLocations = [editValue];
      } else if (field === "destination") {
        patch.toLocations = [editValue];
      }

      await updateLoadFields({
        routeId,
        loadIndex,
        patch,
      });
    } catch (err) {
      console.error("Failed to save edit:", err);
    } finally {
      setSavingCell(null);
      setEditingCell(null);
      setEditValue("");
    }
  }, [editingCell, editValue, updateLoadFields]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  // Handle key events in input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        saveEdit();
      } else if (e.key === "Escape") {
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit]
  );

  // Visible columns (filtered by visibility, then ordered)
  const visibleOrderedColumns = useMemo(() => {
    const visibleSet = new Set(COLUMNS.filter((c) => columnVisibility[c.key] !== false).map((c) => c.key));
    const result: ColumnDef[] = [];
    for (const key of columnOrder) {
      if (visibleSet.has(key)) {
        const col = COLUMNS.find((c) => c.key === key);
        if (col) result.push(col);
      }
    }
    return result;
  }, [columnVisibility, columnOrder]);

  const toggleColumnVisibility = useCallback((key: string) => {
    // Prevent hiding ALL columns — at least one must remain visible
    const visibleCount = COLUMNS.filter((c) => key !== c.key ? columnVisibility[c.key] !== false : true).length;
    if (visibleCount <= 1 && columnVisibility[key] !== false) return;
    setColumnVisibility((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, [columnVisibility]);

  // ── Helper functions used by renderCell (defined before useCallback to avoid TDZ) ─
  const isEditing = (row: SpreadsheetRow, field: string) =>
    editingCell &&
    editingCell.routeId === row.routeId &&
    editingCell.loadIndex === row.loadIndex &&
    editingCell.field === field;

  const isSaving = (row: SpreadsheetRow, field: string) =>
    savingCell === `${row.routeId}_${row.loadIndex}_${field}`;

  // ── Cell renderer: maps column key to the appropriate cell content ──────────
  const renderCell = useCallback((col: ColumnDef, row: SpreadsheetRow, rowPad: string) => {
    // Each case returns content styled for the grid cell
    switch (col.key) {
      case "truckNo":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full`}>
            <span
              className="text-[#06B6D4] dark:text-[#22D3EE] font-medium underline cursor-pointer hover:text-[#0891B2] dark:hover:text-[#06B6D4] truncate"
              onClick={() => onTruckClick?.(row.truckNo)}
              title={`View details for Truck ${row.truckNo}`}
            >
              {row.truckNo || "—"}
            </span>
          </div>
        );
      case "trailerNo":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full text-[var(--foreground)]`}>
            <span className="truncate" title={row.trailerNo || "—"}>{row.trailerNo || "—"}</span>
          </div>
        );
      case "loadNo":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full`}>
            <span
              className="text-[#06B6D4] dark:text-[#22D3EE] font-medium underline cursor-pointer hover:text-[#0891B2] dark:hover:text-[#06B6D4] truncate"
              onClick={() => onLoadClick?.(row.routeId, row.loadNo)}
              title={`View details for Load ${row.loadNo}`}
            >
              {row.loadNo || "—"}
            </span>
          </div>
        );
      case "date":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full text-[var(--foreground)] font-mono`}>
            {row.date || "—"}
          </div>
        );
      case "driverName":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full text-[var(--foreground)]`}>
            <span className="truncate">{row.driverName || "—"}</span>
          </div>
        );
      case "origin":
        return (
          <div
            className={`px-2 ${rowPad} truncate flex items-center cursor-pointer hover:bg-[rgba(6,182,212,0.06)] w-full h-full ${
              isEditing(row, "origin") ? "p-0" : ""
            }`}
            onClick={() => !isEditing(row, "origin") && startEditing(row, "origin")}
            title="Click to edit"
          >
            {isEditing(row, "origin") ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                disabled={isSaving(row, "origin")}
                className={`w-full px-2 ${rowPad} bg-[var(--card-bg)] border-2 border-[#06B6D4] outline-none text-[12px] text-[var(--foreground)]`}
              />
            ) : (
              <span className="text-[var(--foreground)] truncate w-full">{row.origin || "—"}</span>
            )}
          </div>
        );
      case "destination":
        return (
          <div
            className={`px-2 ${rowPad} truncate flex items-center cursor-pointer hover:bg-[rgba(6,182,212,0.06)] w-full h-full ${
              isEditing(row, "destination") ? "p-0" : ""
            }`}
            onClick={() => !isEditing(row, "destination") && startEditing(row, "destination")}
            title="Click to edit"
          >
            {isEditing(row, "destination") ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                disabled={isSaving(row, "destination")}
                className={`w-full px-2 ${rowPad} bg-[var(--card-bg)] border-2 border-[#06B6D4] outline-none text-[12px] text-[var(--foreground)]`}
              />
            ) : (
              <span className="text-[var(--foreground)] truncate w-full">{row.destination || "—"}</span>
            )}
          </div>
        );
      case "customer":
        const isMto = isMtoForestry(row.customer);
        return (
          <div
            className={`px-2 ${rowPad} truncate flex items-center cursor-pointer hover:bg-[rgba(6,182,212,0.06)] w-full h-full ${
              isEditing(row, "customer") ? "p-0" : ""
            } ${!isEditing(row, "customer") && isMto ? "bg-[var(--table-highlight-bg)]" : ""}`}
            onClick={() => !isEditing(row, "customer") && startEditing(row, "customer")}
            title={isMto ? "MTO FORESTRY — highlighted" : "Click to edit"}
          >
            {isEditing(row, "customer") ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                disabled={isSaving(row, "customer")}
                className={`w-full px-2 ${rowPad} bg-[var(--card-bg)] border-2 border-[#06B6D4] outline-none text-[12px] text-[var(--foreground)]`}
              />
            ) : (
              <span
                className={`truncate w-full font-medium ${
                  isMto ? "text-[var(--table-highlight-text)] font-bold" : "text-[var(--foreground)]"
                }`}
              >
                {row.customer || "—"}
              </span>
            )}
          </div>
        );
      case "amount":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center justify-end w-full h-full text-[var(--foreground)] font-mono font-semibold tabular-nums`}>
            {row.amount > 0 ? formatZAR(row.amount) : "—"}
          </div>
        );
      case "notes":
        return (
          <div
            className={`px-2 ${rowPad} truncate flex items-center w-full h-full ${
              isShipmentRef(row.notes) ? "bg-[var(--table-highlight-bg)]" : ""
            }`}
            title={isShipmentRef(row.notes) ? "Shipment reference — highlighted" : row.notes}
          >
            <span
              className={`truncate w-full ${
                isShipmentRef(row.notes) ? "text-[var(--table-highlight-text)] font-bold" : "text-[var(--foreground)]"
              }`}
            >
              {row.notes || ""}
            </span>
          </div>
        );
      default:
        return <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full text-[var(--foreground)]`} />;
    }
  }, [editValue, editingCell, savingCell, inputRef, onTruckClick, onLoadClick, isEditing, isSaving, startEditing, saveEdit, handleKeyDown]);

  const gridTemplateColumns = visibleOrderedColumns.map((c) => `${columnWidths[c.key] || c.defaultWidth}px`).join(" ");

  // ─── Render ────────────────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-[var(--nav-text-color)]">
        No data to display
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto border border-[var(--card-border)] bg-[var(--card-bg)]">
      {/* ── Toolbar: resize hint + Columns toggle + Layout profiles ── */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-[var(--nav-text-color)]">
        <span>Drag column edges to resize · double-click to auto-fit · drag headers to reorder</span>
        <div className="flex items-center gap-1">
          {/* Columns toggle */}
          <div className="relative" ref={columnMenuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowColumnMenu((s) => !s); }}
              className="flex items-center gap-1.5 px-3 min-h-10 rounded text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              Columns
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl backdrop-blur-xl py-1" style={{backgroundColor:"var(--card-bg)"}}>
                {COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[var(--card-border)] transition-colors select-none"
                    style={{color:"var(--foreground)"}}
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[col.key] !== false}
                      onChange={() => toggleColumnVisibility(col.key)}
                      className="rounded border-[var(--card-border)] text-[#06B6D4] focus:ring-[#06B6D4]"
                      style={{accentColor:"#06B6D4"}}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Layout profiles */}
          <div className="relative" ref={layoutMenuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLayoutMenu((s) => !s); setLayoutSaving(false); setNewLayoutName(""); }}
              className="flex items-center gap-1.5 px-3 min-h-10 rounded text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18"/>
                <path d="M9 21V9"/>
              </svg>
              Layout
            </button>
            {showLayoutMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl backdrop-blur-xl py-1" style={{backgroundColor:"var(--card-bg)"}}>
                {/* Save as new layout */}
                {layoutSaving ? (
                  <div className="px-3 py-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newLayoutName}
                      onChange={(e) => setNewLayoutName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveCurrentLayout(); if (e.key === "Escape") { setLayoutSaving(false); setNewLayoutName(""); } }}
                      placeholder="Layout name..."
                      autoFocus
                      className="flex-1 px-2 py-1 text-xs rounded border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] outline-none focus:border-[#06B6D4]"
                    />
                    <button
                      onClick={saveCurrentLayout}
                      disabled={!newLayoutName.trim()}
                      className="px-2 py-1 text-xs font-semibold rounded bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setLayoutSaving(true)}
                    className="w-full text-left px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors flex items-center gap-2"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save current layout
                  </button>
                )}

                {/* Divider */}
                <div className="my-1 border-t border-[var(--card-border)]" />

                {/* Saved profiles list */}
                {profiles.length === 0 ? (
                  <div className="px-3 py-2 text-xs italic text-[var(--nav-text-color)]">No saved layouts</div>
                ) : (
                  profiles.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[var(--card-border)] transition-colors group"
                    >
                      <button
                        onClick={() => loadLayout(p)}
                        className="flex-1 text-left text-[var(--foreground)] truncate"
                        title={`Load layout: ${p.name}`}
                      >
                        {p.name}
                      </button>
                      <button
                        onClick={() => deleteLayout(p.name)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-[var(--nav-text-color)] hover:text-red-600 transition-all"
                        title={`Delete layout: ${p.name}`}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        </svg>
                      </button>
                    </div>
                  ))
                )}

                {/* Divider */}
                <div className="my-1 border-t border-[var(--card-border)]" />

                {/* Reset to defaults */}
                <button
                  onClick={resetToDefaults}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                  Reset to defaults
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Header Row (draggable to reorder) ── */}
      <div
        className="grid min-w-max bg-[var(--table-row-header)] border-b-2 border-[var(--card-border)] text-[11px] font-bold text-[#06B6D4] uppercase tracking-wider"
        style={{ gridTemplateColumns }}
      >
        {visibleOrderedColumns.map((col) => (
          <div
            key={col.key}
            draggable={true}
            onDragStart={(e) => handleDragStart(col.key, e)}
            onDragOver={(e) => handleDragOver(col.key, e)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(col.key, e)}
            onDragEnd={handleDragEnd}
            className={`relative px-2 py-2 border-r border-[var(--card-border)] last:border-r-0 flex items-center ${
              col.sortable ? "cursor-pointer hover:bg-[rgba(6,182,212,0.08)] dark:hover:bg-[rgba(6,182,212,0.15)] select-none" : ""
            } ${col.align === "right" ? "justify-end" : "justify-start"} ${
              dragOverKey === col.key ? "bg-[rgba(6,182,212,0.15)] dark:bg-[rgba(6,182,212,0.25)] ring-1 ring-[#06B6D4]" : ""
            }`}
            onClick={col.sortable ? () => handleSort(col.key) : undefined}
            title={`Drag to reorder · ${col.sortable ? 'Click to sort' : ''}`}
          >
            <span className="truncate">{col.label}</span>
            {col.sortable && sortKey === col.key && (
              <span className="ml-1 text-[10px] shrink-0">
                {sortDir === "asc" ? "▲" : "▼"}
              </span>
            )}
            {/* Resize handle on every column */}
            {renderResizeHandle(col.key)}
          </div>
        ))}
      </div>

      {/* ── Data Rows ── */}
      <div className="divide-y divide-[var(--card-border)]">
        {sortedRows.map((row, idx) => {
          const rowBg = idx % 2 === 0
            ? "bg-[var(--table-row-even)]"
            : "bg-[var(--table-row-odd)]";
          const rowPad = density === 'compact' ? 'py-1' : 'py-1.5';

          return (
            <div
              key={`${row.routeId}_${row.loadIndex}_${idx}`}
              className={`grid min-w-max text-[12px] ${rowBg} hover:bg-[var(--table-row-hover)] transition-colors`}
              style={{ gridTemplateColumns }}
            >
              {visibleOrderedColumns.map((col, ci) => (
                <div
                  key={col.key}
                  className={`relative flex items-center h-full ${ci < visibleOrderedColumns.length - 1 ? 'border-r border-[var(--card-border)]' : ''}`}
                >
                  {renderCell(col, row, rowPad)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
