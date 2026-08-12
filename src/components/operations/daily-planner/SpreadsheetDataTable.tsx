"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { calculateLoadAmount } from "@/convex/utils";
import { DriverThumb } from "@/src/components/admin/DriverAvatar";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SpreadsheetRow {
  routeId: string;
  loadIndex: number;
  truckNo: string;
  trailerNo: string;
  loadNo: string;
  date: string;
  /** Raw ISO date (YYYY-MM-DD) used for correct chronological sorting. */
  dateIso: string;
  driverName: string;
  /** Driver photo URL when the route's driver has one (decorated by the caller). */
  driverPhotoUrl?: string;
  /** Uncropped original driver photo (long-press in the thumb lightbox). */
  driverPhotoOriginalUrl?: string;
  origin: string;
  destination: string;
  customer: string;
  amount: number;
  /** Route-level revenue ÷ kilometres (same for every load row of a route). */
  rkm: number;
  notes: string;
  /** Optional extra column value (e.g. region badge key). */
  region: string;
}

/**
 * Optional caller-supplied column appended to the base column set.
 * Rendered right after the Date column; participates in resize,
 * visibility toggling, and layout profiles like any built-in column.
 */
export interface SpreadsheetExtraColumn {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  render: (row: SpreadsheetRow) => React.ReactNode;
}

interface EditingCell {
  routeId: string;
  loadIndex: number;
  field: keyof Pick<SpreadsheetRow, "customer" | "origin" | "destination" | "amount" | "notes">;
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
  /** Optional caller-supplied column (e.g. Region) shown after Date. */
  extraColumn?: SpreadsheetExtraColumn;
  /** Namespaces the localStorage layout keys so instances keep separate layouts. */
  storageNamespace?: string;
  /** Extra classes applied to the root table container (e.g. h-full). */
  className?: string;
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

interface SortRule {
  key: string;
  dir: "asc" | "desc";
}

const COLUMNS: ColumnDef[] = [
  { key: "truckNo", label: "Truck", defaultWidth: 92, minWidth: 72, sortable: true, align: "left" },
  { key: "trailerNo", label: "Trailer", defaultWidth: 92, minWidth: 72, sortable: true, align: "left" },
  { key: "loadNo", label: "Load No", defaultWidth: 100, minWidth: 72, sortable: true, align: "left" },
  { key: "date", label: "Date", defaultWidth: 120, minWidth: 82, sortable: true, align: "left" },
  { key: "driverName", label: "Driver", defaultWidth: 160, minWidth: 100, sortable: true, align: "left" },
  { key: "origin", label: "Origin", defaultWidth: 140, minWidth: 96, sortable: true, align: "left" },
  { key: "destination", label: "Dest", defaultWidth: 140, minWidth: 96, sortable: true, align: "left" },
  { key: "customer", label: "Client", defaultWidth: 160, minWidth: 96, sortable: true, align: "left" },
  { key: "amount", label: "Amount", defaultWidth: 130, minWidth: 96, sortable: true, align: "right" },
  { key: "rkm", label: "R / KM", defaultWidth: 90, minWidth: 70, sortable: true, align: "right" },
  { key: "notes", label: "Notes", defaultWidth: 280, minWidth: 120, sortable: true, align: "left" },
] as const;

const STORAGE_KEY = "fleetcore.spreadsheetColumnWidths";
const VISIBILITY_STORAGE_KEY = "fleetcore.spreadsheetColumnVisibility";
const ORDER_STORAGE_KEY = "fleetcore.spreadsheetColumnOrder";
const PROFILES_STORAGE_KEY = "fleetcore.spreadsheetLayoutProfiles";
const SORTS_STORAGE_KEY = "fleetcore.spreadsheetSorts";
const SEEN_COLUMNS_STORAGE_KEY = "fleetcore.spreadsheetSeenColumns";

interface LayoutProfile {
  name: string;
  columnOrder: string[];
  columnWidths: Record<string, number>;
  columnVisibility: Record<string, boolean>;
}

const MIN_COLUMN_WIDTH = 60;

// ─── Component ───────────────────────────────────────────────────────────────

export default function SpreadsheetDataTable({
  routes,
  updateLoadFields,
  onTruckClick,
  onLoadClick,
  density = 'comfortable',
  extraColumn,
  storageNamespace,
  className,
}: Props) {
  // Base column set + optional caller-supplied extra column, inserted after
  // Date so it is prominent in cross-region views. Stable per extraColumn.
  const allColumns = useMemo<ColumnDef[]>(() => {
    if (!extraColumn) return COLUMNS;
    const dateIdx = COLUMNS.findIndex((c) => c.key === "date");
    const extra: ColumnDef = {
      key: extraColumn.key,
      label: extraColumn.label,
      defaultWidth: extraColumn.defaultWidth,
      minWidth: extraColumn.minWidth,
      sortable: true,
      align: "left",
    };
    return [...COLUMNS.slice(0, dateIdx + 1), extra, ...COLUMNS.slice(dateIdx + 1)];
  }, [extraColumn]);

  const defaultOrder = useMemo(() => allColumns.map((c) => c.key), [allColumns]);

  // Namespaced storage so the All Regions table keeps its own column layout.
  const storageKeys = useMemo(
    () =>
      storageNamespace
        ? {
            widths: `fleetcore.${storageNamespace}.columnWidths`,
            visibility: `fleetcore.${storageNamespace}.columnVisibility`,
            order: `fleetcore.${storageNamespace}.columnOrder`,
            profiles: `fleetcore.${storageNamespace}.layoutProfiles`,
            sorts: `fleetcore.${storageNamespace}.sorts`,
            seen: `fleetcore.${storageNamespace}.seenColumns`,
          }
        : {
            widths: STORAGE_KEY,
            visibility: VISIBILITY_STORAGE_KEY,
            order: ORDER_STORAGE_KEY,
            profiles: PROFILES_STORAGE_KEY,
            sorts: SORTS_STORAGE_KEY,
            seen: SEEN_COLUMNS_STORAGE_KEY,
          },
    [storageNamespace]
  );

  // ── Compound sort state ───────────────────────────────────────────────────
  // Ordered list of sort rules: earlier entries are higher priority. Clicking a
  // new column appends it as the next (least significant) key instead of
  // resetting; clicking an already-sorted column advances asc → desc → remove.
  // Restored from localStorage so the sort survives navigating away and back.
  const [sorts, setSorts] = useState<SortRule[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(storageKeys.sorts);
      if (saved) {
        const parsed = JSON.parse(saved) as SortRule[];
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (s) => s && typeof s.key === "string" && (s.dir === "asc" || s.dir === "desc")
          );
        }
      }
    } catch { /* ignore */ }
    return [];
  });

  // Persist sorts on change
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.sorts, JSON.stringify(sorts));
    } catch { /* ignore quota errors */ }
  }, [sorts, storageKeys]);
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
      for (const col of allColumns) initial[col.key] = col.defaultWidth;
      return initial;
    }
    try {
      const saved = window.localStorage.getItem(storageKeys.widths);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, number>;
        // Merge saved with defaults to ensure all columns exist
        const merged: Record<string, number> = {};
        for (const col of allColumns) {
          merged[col.key] = parsed[col.key] ?? col.defaultWidth;
        }
        return merged;
      }
    } catch { /* ignore */ }
    const initial: Record<string, number> = {};
    for (const col of allColumns) initial[col.key] = col.defaultWidth;
    return initial;
  });

  // Persist widths on change
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.widths, JSON.stringify(columnWidths));
    } catch { /* ignore quota errors */ }
  }, [columnWidths, storageKeys]);

  // ── Column visibility state with localStorage persistence ─────────────────
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") {
      const initial: Record<string, boolean> = {};
      for (const col of allColumns) initial[col.key] = true;
      return initial;
    }
    try {
      const saved = window.localStorage.getItem(storageKeys.visibility);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        const merged: Record<string, boolean> = {};
        for (const col of allColumns) {
          merged[col.key] = parsed[col.key] ?? true;
        }
        return merged;
      }
    } catch { /* ignore */ }
    const initial: Record<string, boolean> = {};
    for (const col of allColumns) initial[col.key] = true;
    return initial;
  });

  // Persist visibility on change
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.visibility, JSON.stringify(columnVisibility));
    } catch { /* ignore quota errors */ }
  }, [columnVisibility, storageKeys]);

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

  // Merge saved column order with the default set: keep the user's relative
  // ordering for moved columns, but slot any newly added columns (e.g. R / KM)
  // into the position they hold in the default layout — right after Amount —
  // instead of appending them at the end, where they'd sit off-screen past the
  // wide Notes column and look like they're missing.
  const mergeColumnOrder = useCallback(
    (saved: string[] | undefined): string[] => {
      if (!saved || saved.length === 0) return [...defaultOrder];
      const valid = new Set(defaultOrder);
      const merged = saved.filter((k) => valid.has(k));
      for (const key of defaultOrder) {
        if (merged.includes(key)) continue;
        const defIdx = defaultOrder.indexOf(key);
        let insertAt = 0;
        for (let i = 0; i < merged.length; i++) {
          if (defaultOrder.indexOf(merged[i]) < defIdx) insertAt = i + 1;
        }
        merged.splice(insertAt, 0, key);
      }
      return merged;
    },
    [defaultOrder]
  );

  // Columns that a given saved layout is missing AND the user hasn't been told
  // about yet — the trigger for the one-time onboarding hint. Only applies to
  // users with a saved layout (fresh users see the full default, so nothing is
  // "new" to them).
  const unseenNewColumns = useCallback(
    (savedOrder: string[]): string[] => {
      if (!savedOrder || savedOrder.length === 0) return [];
      let seen = new Set<string>();
      try {
        seen = new Set(JSON.parse(window.localStorage.getItem(storageKeys.seen) ?? "[]") as string[]);
      } catch { /* ignore */ }
      const saved = new Set(savedOrder);
      return defaultOrder.filter((k) => !saved.has(k) && !seen.has(k));
    },
    [defaultOrder, storageKeys]
  );

  // ── Column order state with localStorage persistence ──────────────────────
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [...defaultOrder];
    try {
      const saved = window.localStorage.getItem(storageKeys.order);
      if (saved) return mergeColumnOrder(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
    return [...defaultOrder];
  });

  // Persist order on change
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeys.order, JSON.stringify(columnOrder));
    } catch { /* ignore quota errors */ }
  }, [columnOrder, storageKeys]);

  // ── Onboarding hint: newly added columns ─────────────────────────────────
  // Columns the user's saved layout predates (e.g. R / KM) are surfaced once
  // with a banner + header badge, then remembered so they never nag again.
  const [newColumns, setNewColumns] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(storageKeys.order);
      return saved ? unseenNewColumns(JSON.parse(saved) as string[]) : [];
    } catch { /* ignore */ }
    return [];
  });

  const rootRef = useRef<HTMLDivElement>(null);

  const dismissNewColumns = useCallback(() => {
    if (newColumns.length === 0) return;
    try {
      const seen = new Set<string>(JSON.parse(window.localStorage.getItem(storageKeys.seen) ?? "[]") as string[]);
      for (const k of newColumns) seen.add(k);
      window.localStorage.setItem(storageKeys.seen, JSON.stringify([...seen]));
    } catch { /* ignore */ }
    setNewColumns([]);
  }, [newColumns, storageKeys]);

  // Auto-dismiss after a few seconds and bring the highlighted column into
  // view so the badge isn't missed (it can sit off-screen on narrow windows).
  useEffect(() => {
    if (newColumns.length === 0) return;
    const t = setTimeout(dismissNewColumns, 8000);
    const el = rootRef.current?.querySelector<HTMLElement>("[data-new-column]");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    return () => clearTimeout(t);
  }, [newColumns, dismissNewColumns]);

  // ── Layout profiles state ─────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<LayoutProfile[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(storageKeys.profiles);
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
      window.localStorage.setItem(storageKeys.profiles, JSON.stringify(profiles));
    } catch { /* ignore quota errors */ }
  }, [profiles, storageKeys]);

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

  const loadLayout = useCallback(
    (profile: LayoutProfile) => {
      // Merge so columns added after the profile was saved (e.g. R / KM) are
      // not silently dropped, and surface them with the onboarding hint.
      setColumnOrder(mergeColumnOrder(profile.columnOrder));
      setColumnWidths({ ...profile.columnWidths });
      setColumnVisibility({ ...profile.columnVisibility });
      setShowLayoutMenu(false);
      const missing = unseenNewColumns(profile.columnOrder);
      if (missing.length > 0) {
        setNewColumns((prev) => [...new Set([...prev, ...missing])]);
      }
    },
    [mergeColumnOrder, unseenNewColumns]
  );

  const deleteLayout = useCallback((name: string) => {
    setProfiles((prev) => prev.filter((p) => p.name !== name));
  }, []);

  const resetToDefaults = useCallback(() => {
    setColumnOrder(allColumns.map((c) => c.key));
    const defaultWidths: Record<string, number> = {};
    const defaultVisibility: Record<string, boolean> = {};
    for (const col of allColumns) {
      defaultWidths[col.key] = col.defaultWidth;
      defaultVisibility[col.key] = true;
    }
    setColumnWidths(defaultWidths);
    setColumnVisibility(defaultVisibility);
    setShowLayoutMenu(false);
  }, [allColumns]);

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

  const startColumnResize = useCallback((key: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key],
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Capture the pointer so we keep receiving pointermove/pointerup even when
    // the cursor leaves the window, and get lostpointercapture/pointercancel if
    // the drag is interrupted. Without capture, a drag released outside the
    // window left the resize state stuck — the table then grew/shrunk with the
    // cursor on every mouse move (page widened on mouse-out, narrowed on return).
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [columnWidths]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!resizingColumnRef.current) return;
      const { key, startX, startWidth } = resizingColumnRef.current;
      const delta = e.clientX - startX;
      const col = allColumns.find((c) => c.key === key);
      const minW = col?.minWidth ?? MIN_COLUMN_WIDTH;
      const nextWidth = Math.max(minW, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }));
    };

    // pointerup + pointercancel both clear the resize state, so a drag can
    // never get stuck — even when released outside the window.
    const stopResize = () => {
      resizingColumnRef.current = null;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    // Safety net: if the window loses focus or the tab is hidden while a drag
    // is in progress, abort it — the table can never get stuck following the
    // cursor after the pointer leaves the window.
    window.addEventListener("blur", stopResize);
    document.addEventListener("visibilitychange", stopResize);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", stopResize);
      document.removeEventListener("visibilitychange", stopResize);
    };
  }, [allColumns]);

  // Auto-fit a column to content (double-click on handle)
  const autoFitColumn = useCallback((key: string) => {
    // Simple auto-fit: set to default width
    const col = allColumns.find((c) => c.key === key);
    if (col) {
      setColumnWidths((prev) => ({ ...prev, [key]: col.defaultWidth }));
    }
  }, [allColumns]);

  // Render resize handle
  const renderResizeHandle = useCallback((key: string) => (
    <div
      onPointerDown={(e) => startColumnResize(key, e)}
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
      // Route-level metrics shared by every load row: revenue = sum of load
      // amounts (or the route rate when there are no loads), and R / KM =
      // revenue ÷ kilometres (0 when KM or revenue is missing).
      const routeKm = Number(route.kilometers) || 0;
      const routeRevenue =
        loads.length === 0
          ? Number(route.rate) || 0
          : loads.reduce(
              (sum: number, l: any) =>
                sum + calculateLoadAmount(parseNumberSafe(l.quantity), parseNumberSafe(l.rate), l.rateType || "per_unit"),
              0
            );
      const routeRkm = routeKm > 0 && routeRevenue > 0 ? Number((routeRevenue / routeKm).toFixed(2)) : 0;
      if (loads.length === 0) {
        // Route with no loads — show as one row
        result.push({
          routeId: route._id,
          loadIndex: -1,
          truckNo: route.truckFleetNoStr || String(route.truckFleetNo || ""),
          trailerNo: route.trailerFleetNoStr || String(route.trailerFleetNo || ""),
          loadNo: "",
          date: formatDate(route.routeDate),
          dateIso: route.routeDate || "",
          driverName: (route.driverName || "").toUpperCase(),
          driverPhotoUrl: route.driverPhotoUrl || "",
          origin: ((route.fromLocations && route.fromLocations[0]) || "").toUpperCase(),
          destination: ((route.toLocations && route.toLocations[0]) || "").toUpperCase(),
          customer: route.client || "",
          amount: Number(route.rate) || 0,
          rkm: routeRkm,
          notes: route.notes || "",
          region: route.region || "",
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
            dateIso: route.routeDate || "",
            driverName: (route.driverName || "").toUpperCase(),
            driverPhotoUrl: route.driverPhotoUrl || "",
            origin: ((load.fromLocations && load.fromLocations[0]) || "").toUpperCase(),
            destination: ((load.toLocations && load.toLocations[0]) || "").toUpperCase(),
            customer: (load.client || "").toUpperCase(),
            amount,
            rkm: routeRkm,
            notes: route.notes || "",
            region: route.region || "",
          });
        });
      }
    }

    return result;
  }, [routes]);

  // Extract a comparable value for a given sort key (numbers sort numerically,
  // everything else case-insensitively; dates use the raw ISO string).
  const sortValueOf = useCallback((row: SpreadsheetRow, key: string): string | number => {
    switch (key) {
      case "truckNo":
      case "trailerNo": {
        const raw = String(row[key as "truckNo"] || "");
        // Strict numeric check — "12A" must NOT parse as 12 (keeps alphanumeric
        // trailer numbers sub-sorting correctly instead of silently tying).
        return /^\d+$/.test(raw) ? parseInt(raw, 10) : raw.toUpperCase();
      }
      case "amount":
        return row.amount;
      case "rkm":
        return row.rkm;
      case "date":
        return row.dateIso || row.date;
      default: {
        const v = (row as unknown as Record<string, unknown>)[key];
        return v == null ? "" : String(v).toUpperCase();
      }
    }
  }, []);

  // Compound sort: apply rules from highest to lowest priority; only move to the
  // next rule when the previous one ties. Kept stable so equal rows keep order.
  const sortedRows = useMemo(() => {
    if (sorts.length === 0) return rows;

    return [...rows].sort((a, b) => {
      for (const rule of sorts) {
        const aVal = sortValueOf(a, rule.key);
        const bVal = sortValueOf(b, rule.key);
        const cmp =
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        if (cmp !== 0) return rule.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [rows, sorts, sortValueOf]);

  // Clicking a column: if it isn't sorted yet, append it as the next (least
  // significant) key — the existing sorts are preserved. If it is already
  // sorted, advance its direction asc → desc → removed.
  const handleSort = useCallback((key: string) => {
    setSorts((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return [...prev, { key, dir: "asc" }];
      if (prev[idx].dir === "asc") {
        const next = [...prev];
        next[idx] = { ...next[idx], dir: "desc" };
        return next;
      }
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // Start editing a cell. Amount is a number in the row but a string in the
  // input — seed it with the raw value (e.g. "1234.56"), not the R-formatted
  // display, so the user edits a clean number.
  const startEditing = useCallback(
    (row: SpreadsheetRow, field: EditingCell["field"]) => {
      setEditingCell({
        routeId: row.routeId,
        loadIndex: row.loadIndex,
        field,
      });
      setEditValue(field === "amount" ? String(row.amount || "") : String(row[field] ?? ""));
    },
    []
  );

  // Save the edited cell
  const saveEdit = useCallback(async () => {
    if (!editingCell) return;

    const { routeId, loadIndex, field } = editingCell;
    const cellKey = `${routeId}_${loadIndex}_${field}`;
    // Guard against Enter + blur firing the same save twice: the input is
    // disabled while saving, which can blur it and re-enter here before the
    // first mutation settles.
    if (savingCell === cellKey) return;
    setSavingCell(cellKey);

    try {
      const patch: Record<string, any> = {};
      if (field === "customer") {
        patch.client = editValue;
      } else if (field === "origin") {
        patch.fromLocations = [editValue];
      } else if (field === "destination") {
        patch.toLocations = [editValue];
      } else if (field === "amount") {
        // Amount is derived (qty × rate / flat rate) — send the raw amount and
        // let the backend convert it back into the stored rate.
        patch.amount = parseNumberSafe(editValue);
      } else if (field === "notes") {
        patch.notes = editValue;
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
  }, [editingCell, editValue, savingCell, updateLoadFields]);

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
    const visibleSet = new Set(allColumns.filter((c) => columnVisibility[c.key] !== false).map((c) => c.key));
    const result: ColumnDef[] = [];
    for (const key of columnOrder) {
      if (visibleSet.has(key)) {
        const col = allColumns.find((c) => c.key === key);
        if (col) result.push(col);
      }
    }
    return result;
  }, [columnVisibility, columnOrder, allColumns]);

  const toggleColumnVisibility = useCallback((key: string) => {
    // Prevent hiding ALL columns — at least one must remain visible
    const visibleCount = allColumns.filter((c) => key !== c.key ? columnVisibility[c.key] !== false : true).length;
    if (visibleCount <= 1 && columnVisibility[key] !== false) return;
    setColumnVisibility((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, [columnVisibility, allColumns]);

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
    // Caller-supplied extra column (e.g. Region) — render via its custom renderer
    if (extraColumn && col.key === extraColumn.key) {
      return extraColumn.render(row);
    }
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
          <div className={`px-2 ${rowPad} truncate flex items-center gap-1.5 w-full h-full text-[var(--foreground)]`}>
            {row.driverPhotoUrl && <DriverThumb name={row.driverName} photoUrl={row.driverPhotoUrl} photoOriginalUrl={row.driverPhotoOriginalUrl} size={16} className="ring-1 ring-[var(--card-border)]" />}
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
                ref={inputRef}
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
                ref={inputRef}
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
          <div
            className={`px-2 ${rowPad} truncate flex items-center justify-end cursor-pointer hover:bg-[rgba(6,182,212,0.06)] w-full h-full ${
              isEditing(row, "amount") ? "p-0" : ""
            }`}
            onClick={() => !isEditing(row, "amount") && startEditing(row, "amount")}
            title="Click to edit amount"
          >
            {isEditing(row, "amount") ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                disabled={isSaving(row, "amount")}
                placeholder="0.00"
                className={`w-full px-2 ${rowPad} bg-[var(--card-bg)] border-2 border-[#06B6D4] outline-none text-[12px] text-right font-mono tabular-nums text-[var(--foreground)]`}
              />
            ) : (
              <span className="text-[var(--foreground)] font-mono font-semibold tabular-nums truncate">
                {row.amount > 0 ? formatZAR(row.amount) : "—"}
              </span>
            )}
          </div>
        );
      case "rkm":
        return (
          <div className={`px-2 ${rowPad} truncate flex items-center justify-end w-full h-full text-[var(--foreground)] font-mono tabular-nums`}>
            {row.rkm > 0 ? formatZAR(row.rkm) : "—"}
          </div>
        );
      case "notes":
        return (
          <div
            className={`px-2 ${rowPad} truncate flex items-center cursor-pointer hover:bg-[rgba(6,182,212,0.06)] w-full h-full ${
              isEditing(row, "notes") ? "p-0" : ""
            } ${!isEditing(row, "notes") && isShipmentRef(row.notes) ? "bg-[var(--table-highlight-bg)]" : ""}`}
            onClick={() => !isEditing(row, "notes") && startEditing(row, "notes")}
            title={
              isShipmentRef(row.notes)
                ? "Shipment reference — highlighted · click to edit"
                : "Click to edit"
            }
          >
            {isEditing(row, "notes") ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                disabled={isSaving(row, "notes")}
                className={`w-full px-2 ${rowPad} bg-[var(--card-bg)] border-2 border-[#06B6D4] outline-none text-[12px] text-[var(--foreground)]`}
              />
            ) : (
              <span
                className={`truncate w-full ${
                  isShipmentRef(row.notes) ? "text-[var(--table-highlight-text)] font-bold" : "text-[var(--foreground)]"
                }`}
              >
                {row.notes || ""}
              </span>
            )}
          </div>
        );
      default:
        return <div className={`px-2 ${rowPad} truncate flex items-center w-full h-full text-[var(--foreground)]`} />;
    }
  }, [editValue, editingCell, savingCell, inputRef, onTruckClick, onLoadClick, isEditing, isSaving, startEditing, saveEdit, handleKeyDown, extraColumn]);

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
    <div ref={rootRef} className={`w-full overflow-auto border border-[var(--card-border)] bg-[var(--card-bg)] ${className ?? ""}`}>
      {/* ── Onboarding banner: newly added columns ── */}
      {newColumns.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-border)] bg-[rgba(6,182,212,0.08)] text-xs text-[var(--foreground)]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-[10px] leading-none text-white">
            ✦
          </span>
          <span className="font-bold text-[#06B6D4]">
            New column{newColumns.length > 1 ? "s" : ""}:{" "}
            {newColumns.map((k) => allColumns.find((c) => c.key === k)?.label ?? k).join(", ")}
          </span>
          <span className="hidden sm:inline text-[var(--nav-text-color)]">
            · drag the header to move it, or toggle it in Columns
          </span>
          <button
            onClick={dismissNewColumns}
            aria-label="Dismiss"
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Toolbar: resize hint + Columns toggle + Layout profiles ── */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-[var(--nav-text-color)]">
        <span>Click headers to sort (adds a sort key) · drag edges to resize · drag headers to reorder</span>
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
                {allColumns.map((col) => (
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
            } ${
              newColumns.includes(col.key) ? "bg-[rgba(6,182,212,0.1)] ring-2 ring-inset ring-[#06B6D4]/70" : ""
            }`}
            data-new-column={newColumns.includes(col.key) ? "true" : undefined}
            onClick={col.sortable ? () => handleSort(col.key) : undefined}
            title={
              col.sortable
                ? "Click to sort · click again to toggle direction · third click removes · sorted columns keep earlier sorts"
                : "Drag to reorder"
            }
          >
            <span className="truncate">{col.label}</span>
            {newColumns.includes(col.key) && (
              <span className="ml-1.5 inline-flex shrink-0 items-center rounded-full bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-1.5 py-px text-[9px] font-black uppercase tracking-wider text-white animate-pulse">
                New
              </span>
            )}
            {col.sortable && (() => {
              const ruleIdx = sorts.findIndex((s) => s.key === col.key);
              if (ruleIdx === -1) return null;
              return (
                <span className="ml-1 text-[10px] shrink-0 flex items-center gap-0.5">
                  <span>{sorts[ruleIdx].dir === "asc" ? "▲" : "▼"}</span>
                  {sorts.length > 1 && (
                    <span className="opacity-60 tabular-nums">{ruleIdx + 1}</span>
                  )}
                </span>
              );
            })()}
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
