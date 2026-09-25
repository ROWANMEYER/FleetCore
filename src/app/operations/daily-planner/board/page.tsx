"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  defaultKeyboardCoordinateGetter,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState, useRef, useEffect } from "react";
import { usePersistentDraft, getBrowserStorage } from "@/src/hooks/usePersistentDraft";
import { buildDraftKey, resolveDraftRegion } from "@/src/lib/drafts/draftKey";
import { writeDraft } from "@/src/lib/drafts/draftStore";
import {
  EMPTY_QUICK_CAPTURE,
  QUICK_CAPTURE_DRAFT_WORKFLOW,
  applyTextChange,
  createBatchKey,
  markSubmitAttempt,
  resolveSubmitOutcome,
  sanitizeQuickCaptureDraft,
  type QuickCaptureDraft,
} from "@/src/lib/drafts/quickCaptureDraft";
import {
  parseQuickCapture,
  resolveParsedClients,
  type ParseResult,
  type ParsedLoad,
  type CustomerRecord,
} from "@/src/lib/planner/parser";
import {
  presentClientName,
  shouldOfferAddClient,
} from "@/src/lib/planner/clientAdd";
import { buildAddLoadsPayload } from "@/src/lib/planner/addLoadsPayload";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import {
  describeCancelTarget,
  selectCancellableUnallocatedIds,
} from "@/src/lib/planner/planningLoadCancellation";
import {
  accentColorFor,
  filterUnallocatedLoads,
  formatQuantity,
  formatBoardDateLabel,
  addLoadsButtonLabel,
} from "@/src/lib/planner/planningRail";
import {
  type UnallocatedLoadDragData,
  type AllocatedLoadDragData,
  type RouteDragData,
  type PlanningDragData,
  type TruckDropTargetData,
  type RouteDropTargetData,
  type RouteInsert,
  type DestinationChoice,
  isAllocatedDrag,
  isRouteDrag,
  isRouteDragId,
  isRouteDropId,
  isTruckTargetId,
  resolveDropFromOver,
  resolveAllocatedDropDecision,
  resolveRouteInsertDrop,
  resolveRouteDropPosition,
  toAllocationAction,
  toMoveAction,
} from "@/src/lib/planner/dndPlanning";
import { type Id, type Doc } from "@/convex/_generated/dataModel";
import FleetAllocationBoard from "@/src/components/planner/FleetAllocationBoard";
import AllocateLoadDialog from "@/src/components/planner/AllocateLoadDialog";
import AddClientDialog from "@/src/components/planner/AddClientDialog";
import AllocationDestinationDialog from "@/src/components/planner/AllocationDestinationDialog";
import MoveDestinationDialog from "@/src/components/planner/MoveDestinationDialog";
import { Zap, MoreVertical, Search, CheckCircle2, AlertTriangle, Boxes } from "lucide-react";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 shadow-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none text-sm transition-colors text-[var(--foreground)]";

const sectionTitle =
  "text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]";

/* Drag-type-aware collision strategy (6.3C).
   RouteCard wrappers are now route drop targets nested inside truck drop
   targets. Pointing at a card must resolve to the CORRECT family:
   - a ROUTE drag (active id "route-drag:*") resolves route-drop:* targets only;
   - any LOAD drag (unallocated / allocated) resolves TRUCK targets only.
   Route drag sources and targets are separate namespaces, so the active id
   classifies the drag without inspecting its data. Filter the container
   registry by namespace, then delegate to pointerWithin, so load drops can
   never be captured by route targets and route drops can never be captured
   by truck targets. Classification stays deterministic. */
const boardCollisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  if (isRouteDragId(activeId)) {
    const routeTargets = args.droppableContainers.filter((c) =>
      isRouteDropId(String(c.id))
    );
    return pointerWithin({ ...args, droppableContainers: routeTargets });
  }
  const truckTargets = args.droppableContainers.filter((c) =>
    isTruckTargetId(String(c.id))
  );
  return pointerWithin({ ...args, droppableContainers: truckTargets });
};

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function BoardContent() {
  const { user, token } = useAuth();
  const region = useRegionArg();

  /* Quick Capture draft. It carries the batch idempotency key alongside the
     raw text so an ambiguous submit (committed on the server, response lost)
     can be retried after a refresh with the SAME key — the backend's only
     duplicate guard is (batchKey, region). See quickCaptureDraft.ts. */
  const quickCaptureKey = useMemo(
    () =>
      buildDraftKey({
        workflow: QUICK_CAPTURE_DRAFT_WORKFLOW,
        userId: user?._id ?? null,
        region: resolveDraftRegion(user, region),
      }),
    [user, region]
  );
  const {
    value: quickCapture,
    setValue: setQuickCapture,
    clear: clearQuickCaptureDraft,
    restoredValue: restoredQuickCapture,
  } = usePersistentDraft<QuickCaptureDraft>({
    workflow: QUICK_CAPTURE_DRAFT_WORKFLOW,
    defaultValue: EMPTY_QUICK_CAPTURE,
    userId: user?._id ?? null,
    region: resolveDraftRegion(user, region),
    validate: sanitizeQuickCaptureDraft,
  });
  const captureText = quickCapture.text;

  const searchParams = useSearchParams();
  const router = useRouter();

  const urlDate = searchParams.get("date");
  const [boardDate, setBoardDate] = useState(urlDate || getToday());

  /* The logical payload is the capture's own date line, falling back to the
     board date, so the fallback has to be threaded through every identity
     decision. */
  const setCaptureText = useCallback(
    (next: string) =>
      setQuickCapture((previous) => applyTextChange(previous, next, boardDate, createBatchKey)),
    [setQuickCapture, boardDate]
  );

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  /* 6.4A — visible Add Loads feedback. Errors keep the dialog-less form
     intact for retry; an info note surfaces the idempotent "already added"
     case instead of silently doing nothing. */
  const [addLoadsMessage, setAddLoadsMessage] = useState<{
    kind: "error" | "info";
    text: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    value: unallocatedSearch,
    setValue: setUnallocatedSearch,
  } = usePersistentDraft<string>({
    workflow: "daily-planner:board-unallocated-search",
    defaultValue: "",
    userId: user?._id ?? null,
    region: resolveDraftRegion(user, region),
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [allocatingLoad, setAllocatingLoad] = useState<{ id: string; client: string } | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  /* Cancellation is confirmed in a real dialog, never a native confirm(), and
     never silently. Holds exactly what is about to be cancelled so the dialog
     can name the client, the route and the date. */
  const [cancelTarget, setCancelTarget] = useState<{
    id: Id<"planningLoads">;
    client: string;
    route: string;
    date: string;
  } | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelAllTarget, setCancelAllTarget] = useState<{ count: number; date: string } | null>(
    null
  );
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  /* 6.4A — the raw client token an "Add Client" action was clicked for; when
     set, AddClientDialog is open. Closing clears it; resolutions recompute
     reactively once the newly created customer lands in the customers query. */
  const [addClientToken, setAddClientToken] = useState<string | null>(null);

  /* DnD — temporary UI state only. Convex queries remain authoritative. */
  const [activeDrag, setActiveDrag] = useState<PlanningDragData | null>(null);
  const [pendingDropLoadId, setPendingDropLoadId] = useState<string | null>(null);
  const [dndError, setDndError] = useState<string | null>(null);
  const [routeInsert, setRouteInsert] = useState<RouteInsert | null>(null);
  const [routeReorderPendingTruck, setRouteReorderPendingTruck] = useState<string | null>(null);
  /* Cursor Y at drag activation (activatorEvent.clientY). The drop/line geometry
     is derived from the ACTUAL cursor (grab point + cumulative delta), never from
     the dragged card's rect midpoint — the midpoint disagrees with the pointer
     by the grab offset, which made the visible insertion line unreliable. */
  const pointerGrabYRef = useRef<number | null>(null);
  type DropDestination =
    | { mode: "allocate"; planningLoadId: Id<"planningLoads">; client: string; truckFleetNoStr: string }
    | { mode: "move"; planningLoadId: Id<"planningLoads">; client: string; truckFleetNoStr: string; sourceRouteId: string };
  const [dropDest, setDropDest] = useState<DropDestination | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: defaultKeyboardCoordinateGetter })
  );

  const unallocated = useQuery(
    api.planningLoads.getUnallocatedByDate,
    { loadDate: boardDate, token, region }
  );

  const customers = useQuery(api.customers.list, {});

  /* Current authoritative route docs for the board date — the drag-end drop
     validates a stored RouteInsert against THIS data (target still exists,
     still eligible, still in the same truck) before dispatching reorderRoutes. */
  const routes = useQuery(api.dailyRoutes.getRoutesByDate, {
    routeDate: boardDate,
    token,
    region,
  });

  const createBulk = useMutation(api.planningLoads.createBulkPlanningLoads);
  const cancelLoad = useMutation(api.planningLoads.cancelPlanningLoad);
  const cancelBulk = useMutation(api.planningLoads.cancelBulkPlanningLoads);
  const allocateNewRoute = useMutation(api.planningLoads.allocateToNewRoute);
  const allocateExistingRoute = useMutation(api.planningLoads.allocateToExistingRoute);
  const moveBetweenRoutes = useMutation(api.planningLoads.moveLoadBetweenRoutes);
  const moveToNewRoute = useMutation(api.planningLoads.moveLoadToNewRoute);
  const reorderRoutes = useMutation(api.planningLoads.reorderRoutes);

  const syncDateToUrl = useCallback(
    (newDate: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", newDate);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  useEffect(() => {
    if (urlDate && urlDate !== boardDate) {
      setBoardDate(urlDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlDate]);

  const customerRecords: CustomerRecord[] = useMemo(() => {
    if (!customers) return [];
    return customers
      .filter((c) => c.isActive)
      .map((c) => ({
        name: c.name,
        normalizedName: c.normalizedName,
        isActive: c.isActive,
      }));
  }, [customers]);

  const clientResolutions = useMemo(() => {
    if (!parsed) return [];
    return resolveParsedClients(parsed, customerRecords);
  }, [parsed, customerRecords]);

  const validLoadCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.loads.filter((l) => l.valid).length;
  }, [parsed]);

  const allValid = useMemo(() => {
    if (!parsed) return false;
    if (parsed.errors.length > 0) return false;
    if (parsed.loads.length === 0) return false;
    if (parsed.loads.some((l) => !l.valid)) return false;
    if (clientResolutions.some((r) => r.status !== "matched")) return false;
    return true;
  }, [parsed, clientResolutions]);

  const dateMismatch = useMemo(() => {
    if (!parsed?.date || parsed.date === boardDate) return null;
    return parsed.date;
  }, [parsed, boardDate]);

  /* A restored Quick Capture draft re-runs the parser on the raw text so the
     Parsed Loads preview and the client resolution are rebuilt from live data
     instead of a stale serialised preview. */
  useEffect(() => {
    if (restoredQuickCapture === null) return;
    if (restoredQuickCapture.text.trim() === "") return;
    setParsed(parseQuickCapture(restoredQuickCapture.text));
  }, [restoredQuickCapture]);

  const handleParse = useCallback(() => {
    const result = parseQuickCapture(captureText);
    setParsed(result);
  }, [captureText]);

  const handleClear = useCallback(() => {
    /* Drops the text AND the batch key, so the next capture is a new batch. */
    clearQuickCaptureDraft();
    setParsed(null);
    textareaRef.current?.focus();
  }, [clearQuickCaptureDraft]);

  const handleAddLoads = useCallback(async () => {
    if (!parsed || !allValid) {
      return;
    }

    setAddLoadsMessage(null);
    setIsCreating(true);

    /* Freeze the batch identity BEFORE the request leaves the browser. The
       backend's only duplicate guard is (batchKey, region), so if the response
       is lost or the tab closes mid-flight, the retry has to reuse this key. */
    const submitted = markSubmitAttempt(quickCapture, boardDate, createBatchKey);
    setQuickCapture(submitted);
    if (quickCaptureKey) {
      writeDraft(getBrowserStorage(), quickCaptureKey, submitted);
    }

    try {
      const loads = buildAddLoadsPayload(parsed, clientResolutions, boardDate);

      const result = await createBulk({
        region: (region || "garden_route") as "garden_route" | "eastern_cape",
        token,
        batchKey: submitted.batchKey,
        loads,
      });

      if (result.created) {
        handleClear();
      } else {
        setQuickCapture((current) => resolveSubmitOutcome(current, submitted, createBatchKey));
        setAddLoadsMessage({
          kind: "info",
          text: "These loads were already added in a previous attempt — no duplicates were created.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create loads";
      /* Leave the draft in its unconfirmed state so the text and the batch key
         both survive; the dispatcher can press Add again safely. */
      setAddLoadsMessage({ kind: "error", text: msg });
    } finally {
      setIsCreating(false);
    }
  }, [
    parsed,
    allValid,
    quickCapture,
    quickCaptureKey,
    boardDate,
    region,
    token,
    createBulk,
    handleClear,
    clientResolutions,
    setQuickCapture,
  ]);

  /* Opening the dialog is a separate step from executing it, so a load is
     never cancelled silently. */
  const handleCancel = useCallback((id: Id<"planningLoads">) => {
    setOpenMenuId(null);
    setCancelError(null);
    const load = unallocated?.find((l) => l._id === id);
    if (!load) return;
    const target = describeCancelTarget(load);
    setCancelTarget({ id, ...target });
  }, [unallocated]);

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await cancelLoad({ id: cancelTarget.id, token });
      setCancelTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Cancel failed";
      setCancelError(msg);
    } finally {
      setIsCancelling(false);
    }
  }, [cancelTarget, cancelLoad, token]);

  const visibleUnallocated = useMemo(() => {
    if (!unallocated) return [];
    return filterUnallocatedLoads(unallocated, unallocatedSearch);
  }, [unallocated, unallocatedSearch]);

  /* The bulk action is derived from the same query the list renders, so it can
     only ever reach loads that are on screen as Unallocated for this exact
     board date and effective region. Cancellation is by id, so an equivalent
     load on another date is a different document and is never included. */
  const cancellableAllIds = useMemo(() => {
    if (!unallocated) return [];
    return selectCancellableUnallocatedIds(
      unallocated.map((l) => ({
        _id: l._id as string,
        loadDate: l.loadDate,
        region: l.region,
        status: l.status,
        client: l.client,
        fromLocations: l.fromLocations,
        toLocations: l.toLocations,
      })),
      boardDate,
      region || null
    );
  }, [unallocated, boardDate, region]);

  const confirmCancelAll = useCallback(async () => {
    if (!cancelAllTarget) return;
    setIsCancellingAll(true);
    setCancelError(null);
    try {
      await cancelBulk({ ids: cancellableAllIds as Id<"planningLoads">[], token });
      setCancelAllTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Cancel all failed";
      setCancelError(msg);
    } finally {
      setIsCancellingAll(false);
    }
  }, [cancelAllTarget, cancelBulk, cancellableAllIds, token]);

  /* ── DnD handlers — a drag is only another frontend interaction for the
         existing planning lifecycle. Backend mutations stay authoritative. */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activator = event.activatorEvent;
    pointerGrabYRef.current =
      activator && "clientY" in activator
        ? (activator as { clientY: number }).clientY
        : null;
    setDndError(null);
    setOpenMenuId(null);
    setRouteInsert(null);
    setActiveDrag((event.active.data.current as PlanningDragData | undefined) ?? null);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    setRouteInsert(null);
    pointerGrabYRef.current = null;
  }, []);

  /* 6.3C — live insertion-line feedback while a ROUTE is dragged. Only route
     payloads produce routeInsert; nothing is committed here (Convex stays
     authoritative). Cross-truck / ineligible / self targets clear the line.
     The line position is the ACTUAL cursor (grab Y + drag delta), so what the
     dispatcher sees is exactly what gets submitted at drag-end. */
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const data = event.active.data.current as PlanningDragData | undefined;
    const over = event.over;
    if (!data || data.sourceType !== "route" || !over) {
      setRouteInsert(null);
      return;
    }
    const overId = String(over.id);
    const overData = (over.data.current ?? null) as RouteDropTargetData | null;
    if (
      !isRouteDropId(overId) ||
      !overData ||
      overData.targetType !== "route" ||
      !overData.reorderEligible
    ) {
      setRouteInsert(null);
      return;
    }
    if (
      overData.truckFleetNoStr !== data.sourceTruckFleetNoStr ||
      overData.routeId === data.routeId
    ) {
      setRouteInsert(null);
      return;
    }
    /* Cursor-accurate geometry (KEYBOARD-ACTIVATED drags have no pointer, so
       they fall back to the dragged card's rect midpoint). This is the value
       the drop consumes — drag-end NEVER re-derives its own position. */
    const grabY = pointerGrabYRef.current;
    const activeRect = event.active.rect.current.translated;
    const pointerY =
      grabY !== null
        ? grabY + event.delta.y
        : activeRect
          ? activeRect.top + activeRect.height / 2
          : over.rect.top + over.rect.height / 2;
    const position = resolveRouteDropPosition(pointerY, over.rect.top, over.rect.height);
    setRouteInsert({
      sourceRouteId: data.routeId,
      targetRouteId: overData.routeId,
      position,
      truckFleetNoStr: data.sourceTruckFleetNoStr,
    });
  }, []);

  /* 6.3C — the drop consumes the LAST VALIDATED insertion decision captured
     during drag-over (the same value that drew the visible cyan line). It is
     re-validated against CURRENT authoritative route data before dispatch:
     target must still exist in the same truck and still be reorder-eligible;
     orderedRouteIds is recomputed fresh, never trusted from the drag. The
     drop decision then maps to the existing reorderRoutes mutation (complete
     eligible set). Everything else is a no-op: no insert, stale source,
     cross-truck, vanished/ineligible target, same-position reorder. */
  const handleRouteDrop = useCallback(
    (drag: RouteDragData) => {
      if (!routeInsert) return;
      const truckRoutes =
        (routes ?? []).filter(
          (r) => (r.truckFleetNoStr ?? "") === drag.sourceTruckFleetNoStr
        ) ?? [];
      const decision = resolveRouteInsertDrop(routeInsert, drag, truckRoutes);
      if (decision.kind === "no_action") return;

      // Prevent re-entrancy for the same truck while a reorder is in flight.
      if (routeReorderPendingTruck === drag.sourceTruckFleetNoStr) return;

      setDndError(null);
      setRouteReorderPendingTruck(drag.sourceTruckFleetNoStr);
      reorderRoutes({
        routeDate: boardDate,
        truckFleetNoStr: drag.sourceTruckFleetNoStr,
        orderedRouteIds: decision.orderedRouteIds as Id<"dailyRoutes">[],
        token,
      })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Reorder failed";
          setDndError(msg);
        })
        .finally(() => setRouteReorderPendingTruck(null));
    },
    [routeInsert, routes, boardDate, token, reorderRoutes, routeReorderPendingTruck]
  );

  /* 6.3A — unallocated planning load dropped on a truck lane. */
  const handleUnallocatedDrop = useCallback(
    (drag: UnallocatedLoadDragData, event: DragEndEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      const overData = (event.over?.data.current ?? null) as TruckDropTargetData | null;
      const decision = resolveDropFromOver(overId, overData, drag.planningLoadId);

      // Invalid target / dropped outside any target → card returns. No mutation.
      if (decision.kind === "no_action") return;

      // Duplicate-drop protection — a load already being allocated is never re-dragged.
      if (pendingDropLoadId === drag.planningLoadId) return;

      const load = unallocated?.find((l) => String(l._id) === drag.planningLoadId);
      if (!load || !overData) return;

      if (decision.kind === "choose_destination") {
        setDropDest({
          mode: "allocate",
          planningLoadId: drag.planningLoadId as Id<"planningLoads">,
          client: load.client,
          truckFleetNoStr: overData.truckFleetNoStr,
        });
        return;
      }

      // Empty eligible truck → directly allocateToNewRoute (Route 1).
      setDndError(null);
      setPendingDropLoadId(drag.planningLoadId);
      allocateNewRoute({
        planningLoadId: drag.planningLoadId as Id<"planningLoads">,
        truckFleetNoStr: overData.truckFleetNoStr,
        token,
      })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Allocation failed";
          setDndError(msg);
        })
        .finally(() => setPendingDropLoadId(null));
    },
    [unallocated, token, allocateNewRoute, pendingDropLoadId]
  );

  /* 6.3B — ALREADY-ALLOCATED Board load dragged onto another truck/route.
     Uses the existing atomic lifecycle: moveLoadToNewRoute (no routes / new
     route) or moveLoadBetweenRoutes via the destination chooser. The source
     route is never a destination. Frontend simply reacts to query updates —
     it never deallocates-then-reallocates. */
  const handleAllocatedDrop = useCallback(
    (drag: AllocatedLoadDragData, event: DragEndEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      const overData = (event.over?.data.current ?? null) as TruckDropTargetData | null;
      if (!overId || !isTruckTargetId(overId) || !overData) return;

      const decision = resolveAllocatedDropDecision(overData, drag.sourceRouteId);
      if (decision.kind === "no_action") return;

      // Duplicate-drop protection — a load already being moved is never re-dragged.
      if (pendingDropLoadId === drag.planningLoadId) return;

      const planningLoadId = drag.planningLoadId as Id<"planningLoads">;

      if (decision.kind === "choose_destination") {
        setDropDest({
          mode: "move",
          planningLoadId,
          client: drag.client,
          truckFleetNoStr: overData.truckFleetNoStr,
          sourceRouteId: drag.sourceRouteId,
        });
        return;
      }

      // Empty eligible truck (or only its own source route) → moveLoadToNewRoute.
      setDndError(null);
      setPendingDropLoadId(drag.planningLoadId);
      moveToNewRoute({
        planningLoadId,
        truckFleetNoStr: overData.truckFleetNoStr,
        token,
      })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Move failed";
          setDndError(msg);
        })
        .finally(() => setPendingDropLoadId(null));
    },
    [token, moveToNewRoute, pendingDropLoadId]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current as PlanningDragData | undefined;
      setActiveDrag(null);
      pointerGrabYRef.current = null;

      if (!activeData) return;
      if (isRouteDrag(activeData)) {
        handleRouteDrop(activeData);
        setRouteInsert(null);
        return;
      }
      setRouteInsert(null);
      if (isAllocatedDrag(activeData)) {
        handleAllocatedDrop(activeData, event);
        return;
      }
      handleUnallocatedDrop(activeData, event);
    },
    [handleRouteDrop, handleAllocatedDrop, handleUnallocatedDrop]
  );

  /* Destination chooser confirm — executes the exact qualification-mapped
     mutation for a chosen existing route or a new route. Allocated loads go
     through the atomic move lifecycle; unallocated loads keep 6.3A. */
  const handleDestinationSubmit = useCallback(
    async (choice: DestinationChoice): Promise<void> => {
      if (!dropDest) return;

      setDndError(null);
      setPendingDropLoadId(String(dropDest.planningLoadId));
      try {
        if (dropDest.mode === "move") {
          const action = toMoveAction(
            {
              sourceType: "allocated-load",
              planningLoadId: String(dropDest.planningLoadId),
              sourceRouteId: dropDest.sourceRouteId,
            },
            dropDest.truckFleetNoStr,
            choice
          );
          if (!action) throw new Error("Invalid drag data");
          if (action.kind === "move_between_routes") {
            await moveBetweenRoutes({
              planningLoadId: dropDest.planningLoadId,
              destinationRouteId: action.destinationRouteId as Id<"dailyRoutes">,
              token,
            });
          } else {
            await moveToNewRoute({
              planningLoadId: dropDest.planningLoadId,
              truckFleetNoStr: action.truckFleetNoStr,
              token,
            });
          }
        } else {
          const action = toAllocationAction(
            {
              sourceType: "unallocated-load",
              planningLoadId: String(dropDest.planningLoadId),
            },
            dropDest.truckFleetNoStr,
            choice
          );
          if (!action) throw new Error("Invalid drag data");
          if (action.kind === "allocate_to_existing_route") {
            await allocateExistingRoute({
              planningLoadId: dropDest.planningLoadId,
              routeId: action.routeId as Id<"dailyRoutes">,
              token,
            });
          } else {
            await allocateNewRoute({
              planningLoadId: dropDest.planningLoadId,
              truckFleetNoStr: action.truckFleetNoStr,
              token,
            });
          }
        }
        setDropDest(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Move failed";
        setDndError(msg);
        throw err;
      } finally {
        setPendingDropLoadId(null);
      }
    },
    [dropDest, token, moveBetweenRoutes, moveToNewRoute, allocateExistingRoute, allocateNewRoute]
  );

  const activeLoad = useMemo(() => {
    if (!activeDrag || activeDrag.sourceType !== "unallocated-load" || !unallocated) return null;
    return unallocated.find((l) => String(l._id) === activeDrag.planningLoadId) ?? null;
  }, [activeDrag, unallocated]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
    <div className="h-full flex flex-col gap-3 overflow-hidden min-h-0">
      {/* Header — the Daily Planner date stays the single authoritative date */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[var(--foreground)] leading-tight">
            Planner Board
          </h2>
          <p className="text-[11px] uppercase tracking-wider text-[#06B6D4]/80 mt-0.5">
            Capture · Plan · Allocate · Deliver
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[var(--nav-text-color)]">Date</label>
          <input
            type="date"
            value={boardDate}
            onChange={(e) => {
              setBoardDate(e.target.value);
              syncDateToUrl(e.target.value);
            }}
            className={`${inputClass} w-auto`}
          />
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
        {/* Left planning workspace — primary width for the daily plan */}
        <div className="flex flex-col gap-4 w-full lg:w-[500px] lg:shrink-0 min-h-0 overflow-y-auto scrollbar-fleet">
          {/* ─── Quick Capture card (includes Parsed Loads section) ─── */}
          <div className="relative flex-shrink-0 rounded-xl border border-panel-border bg-panel [background-image:var(--panel-gradient)] p-4 shadow-panel">
            {/* Quick Capture header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <Zap size={22} className="text-emerald-400 shrink-0" fill="currentColor" strokeWidth={0} />
                <h3 className="text-base font-bold tracking-tight text-[var(--foreground)]">
                  Quick Capture
                </h3>
              </div>
            </div>

            <p className="text-xs text-[var(--nav-text-color)] mb-2.5">
              Type or paste your loads. One line per load.
            </p>

            {/* Capture area — recessed into the card */}
            <textarea
              ref={textareaRef}
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  handleParse();
                }
              }}
              placeholder={"09/09/26\nshaveco x george na kaap\nmto x george na bredasdorp"}
              rows={7}
              className="w-full px-3.5 py-3 rounded-lg border border-input-border bg-input shadow-input focus:border-input-border-focus focus:ring-2 focus:ring-[#06B6D4]/20 focus:outline-none resize-y font-mono text-xs leading-relaxed text-[var(--foreground)] placeholder:text-[var(--text-muted)] transition-colors"
            />

            {/* Controls — Parse Loads dominant */}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleParse}
                disabled={!captureText.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-sm font-bold shadow-md shadow-[rgba(6,182,212,0.3)] hover:opacity-90 transition-all disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
              >
                Parse Loads
              </button>
              <button
                onClick={handleClear}
                title="Clear the capture text"
                className="px-3 py-2.5 rounded-lg text-[11px] font-semibold text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors shrink-0"
              >
                Clear
              </button>
            </div>

            {/* Subtle divider into the Parsed Loads section (inside this card) */}
            <div className="h-px bg-[#06B6D4]/15 my-4" />

            {/* Parsed Loads section */}
            <div className="flex items-center justify-between mb-2">
              <h3 className={sectionTitle}>
                Parsed Loads
                <span className="ml-1.5 bg-[#06B6D4]/15 text-[#06B6D4] px-1.5 py-px rounded font-bold normal-case">
                  {validLoadCount}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                {parsed?.date && (
                  <span className="text-[10px] font-medium text-[var(--nav-text-color)] bg-[#123243]/60 border border-[#06B6D4]/10 rounded-md px-2 py-0.5 select-none">
                    {formatBoardDateLabel(parsed.date)}
                  </span>
                )}
                {dateMismatch && (
                  <span
                    title={`Loads are for ${formatBoardDateLabel(dateMismatch)} but the Board shows ${formatBoardDateLabel(boardDate)}`}
                    className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-500/15 text-amber-500"
                  >
                    <AlertTriangle size={13} />
                  </span>
                )}
              </div>
            </div>

            {dateMismatch && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">
                Loads are for {formatBoardDateLabel(dateMismatch)} · Board shows{" "}
                {formatBoardDateLabel(boardDate)}
              </p>
            )}

            {!parsed ? (
              <div className="py-4 text-center">
                <p className="text-xs font-semibold text-[var(--nav-text-color)]">
                  Nothing parsed yet.
                </p>
                <p className="text-[10px] text-[var(--nav-text-color)]/70 mt-0.5">
                  Capture loads above to review them before adding.
                </p>
              </div>
            ) : (
              <>
                {parsed.errors.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {parsed.errors.map((err, i) => (
                      <div key={i} className="text-[10px] text-[var(--danger-text)] bg-[var(--danger-surface)] border border-[var(--danger-border)] px-2 py-1 rounded-md">
                        {err}
                      </div>
                    ))}
                  </div>
                )}

                {parsed.loads.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-semibold text-[var(--nav-text-color)]">
                      No loads parsed.
                    </p>
                    <p className="text-[10px] text-[var(--nav-text-color)]/70 mt-0.5">
                      Fix the errors above and try again.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--card-border)]/60 rounded-lg overflow-hidden mb-3">
                    {parsed.loads.map((load, i) => (
                      <LoadPreview
                        key={i}
                        index={i}
                        load={load}
                        resolutions={clientResolutions}
                        onAddClient={setAddClientToken}
                      />
                    ))}
                  </div>
                )}

                {/* Bottom action bar — Edit All (40%) / Add N Loads (60%) */}
                <div className="flex items-stretch gap-2">
                  <button
                    disabled
                    title="Editing parsed loads is not available in this stage — no mutation exists for it. Re-capture to refine a load."
                    className="w-[40%] px-3 py-2 rounded-lg border border-[var(--card-border)] text-[10px] font-semibold text-[var(--nav-text-color)] opacity-50 cursor-not-allowed"
                  >
                    Edit All
                  </button>
                  <button
                    onClick={handleAddLoads}
                    disabled={!allValid || isCreating}
                    className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-xs font-bold shadow-md shadow-[rgba(6,182,212,0.25)] hover:opacity-90 transition-all disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
                  >
                    {isCreating ? "Adding..." : addLoadsButtonLabel(validLoadCount)}
                  </button>
                </div>

                {addLoadsMessage && (
                  <p
                    className={`mt-2 text-[10px] px-2 py-1.5 rounded-md border ${
                      addLoadsMessage.kind === "error"
                        ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-300/40 dark:border-red-500/20"
                        : "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-300/40 dark:border-amber-500/20"
                    }`}
                  >
                    {addLoadsMessage.text}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Unallocated Loads — dense operational list, bounded height */}
          <div className="flex flex-col shrink-0 max-h-[42vh] lg:max-h-[380px] overflow-hidden border border-[var(--card-border)] rounded-lg p-3 bg-[var(--card-bg)]/40">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <h3 className={sectionTitle}>
                Unallocated Loads
                {unallocated && !unallocatedSearch && (
                  <span className="ml-1.5 text-[var(--nav-text-color)] font-normal">
                    ({unallocated.length})
                  </span>
                )}
                {unallocated && unallocatedSearch && (
                  <span className="ml-1.5 text-[#06B6D4] font-normal">
                    ({visibleUnallocated.length}/{unallocated.length})
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[var(--nav-text-color)]">
                  {formatBoardDateLabel(boardDate)}
                </span>
                {/* Correction affordance for a capture made against the wrong
                    date. Scoped to this board date, this effective region and
                    status = unallocated, and it always confirms with a count. */}
                {cancellableAllIds.length > 0 && (
                  <button
                    onClick={() => {
                      setCancelError(null);
                      setCancelAllTarget({ count: cancellableAllIds.length, date: boardDate });
                    }}
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-[var(--danger-text)] bg-[var(--danger-surface)] hover:opacity-80 border border-[var(--danger-border)] transition-colors"
                  >
                    Cancel all ({cancellableAllIds.length})
                  </button>
                )}
              </div>
            </div>

            <div className="relative mb-2 shrink-0">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)]" />
              <input
                type="text"
                value={unallocatedSearch}
                onChange={(e) => setUnallocatedSearch(e.target.value)}
                placeholder="Search loads..."
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)]/60 text-xs focus:border-[#06B6D4] focus:ring-1 focus:ring-[#06B6D4]/30 focus:outline-none transition-colors text-[var(--foreground)] placeholder:text-[var(--nav-text-color)]/70"
              />
            </div>

            {cancelError && (
              <div className="mb-2 text-[10px] text-[var(--danger-text)] bg-[var(--danger-surface)] border border-[var(--danger-border)] px-2 py-1 rounded-md shrink-0">
                {cancelError}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-fleet -mx-1 px-1">
              {!unallocated ? (
                <div className="text-xs text-[var(--nav-text-color)] py-6 text-center">Loading...</div>
              ) : unallocated.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#06B6D4]/10 border border-[#06B6D4]/20 mb-2">
                    <Boxes size={16} className="text-[#06B6D4]/70" />
                  </div>
                  <p className="text-xs font-semibold text-[var(--foreground)]">
                    No unallocated loads
                  </p>
                  <p className="text-[10px] text-[var(--nav-text-color)] mt-0.5">
                    Capture loads above, or they&apos;re already on the board.
                  </p>
                </div>
              ) : visibleUnallocated.length === 0 ? (
                <div className="text-xs text-[var(--nav-text-color)] py-6 text-center">
                  No loads match &quot;{unallocatedSearch}&quot;.
                </div>
              ) : (
                <div className="px-1 space-y-1 mb-1">
                  {visibleUnallocated.map((load, idx) => {
                    const accent = accentColorFor(load._id, idx);
                    const qty = formatQuantity(load.quantity, load.quantityType);
                    return (
                      <UnallocatedRow
                        key={load._id}
                        load={load}
                        accent={accent}
                        qty={qty}
                        disabled={pendingDropLoadId === String(load._id)}
                        menuOpen={openMenuId === String(load._id)}
                        onToggleMenu={() =>
                          setOpenMenuId((cur) => (cur === String(load._id) ? null : String(load._id)))
                        }
                        onCancel={handleCancel}
                        onAllocate={() => {
                          setOpenMenuId(null);
                          setAllocatingLoad({ id: load._id, client: load.client });
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right board workspace — all remaining width */}
        <div className="hidden lg:flex flex-1 min-w-0 min-h-0 overflow-hidden border border-[var(--card-border)] rounded-lg bg-[var(--card-bg)]/40 p-3">
          <FleetAllocationBoard
            boardDate={boardDate}
            unallocatedCount={unallocated?.length ?? 0}
            pendingLoadId={pendingDropLoadId ?? undefined}
            activeSourceRouteId={
              activeDrag?.sourceType === "allocated-load"
                ? activeDrag.sourceRouteId
                : undefined
            }
            activeRouteId={
              activeDrag?.sourceType === "route" ? activeDrag.routeId : undefined
            }
            routeInsert={routeInsert}
            routeReorderPendingTruck={routeReorderPendingTruck ?? undefined}
          />
        </div>
      </div>

      {/* DnD error banner — surfaces the actual backend error, never a phantom */}
      {dndError && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-[11px] font-medium text-red-600 dark:text-red-400">
          <AlertTriangle size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{dndError}</span>
          <button
            onClick={() => setDndError(null)}
            className="shrink-0 text-[var(--danger-text)] hover:opacity-80 font-bold px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Allocate dialog (click workflow — unchanged) */}
      {allocatingLoad && (
        <AllocateLoadDialog
          planningLoadId={allocatingLoad.id as Id<"planningLoads">}
          client={allocatingLoad.client}
          boardDate={boardDate}
          onClose={() => setAllocatingLoad(null)}
        />
      )}

      {/* 6.4A — Add Client dialog: opened only from an unknown-client Quick
          Capture line; closes on success and resolutions recompute reactively
          once the new customer lands in the customers query. */}
      {addClientToken && (
        <AddClientDialog
          proposedName={presentClientName(addClientToken)}
          rawToken={addClientToken}
          customers={customers}
          onClose={() => setAddClientToken(null)}
        />
      )}

      {/* Accidental-capture correction. Both dialogs name exactly what will be
          cancelled and never act without an explicit confirm. */}
      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this planning load?"
        message={
          cancelTarget
            ? `${cancelTarget.client}\n${cancelTarget.route}\n${formatBoardDateLabel(
                cancelTarget.date
              )}\n\nIt will be removed from the active planning board.`
            : ""
        }
        confirmLabel="Cancel Load"
        cancelLabel="Keep Load"
        variant="danger"
        loading={isCancelling}
        onConfirm={confirmCancel}
        onCancel={() => {
          if (!isCancelling) setCancelTarget(null);
        }}
      />
      <ConfirmDialog
        open={cancelAllTarget !== null}
        title={
          cancelAllTarget
            ? `Cancel all ${cancelAllTarget.count} unallocated ${
                cancelAllTarget.count === 1 ? "load" : "loads"
              }?`
            : ""
        }
        message={
          cancelAllTarget
            ? `${cancelAllTarget.count} unallocated ${
                cancelAllTarget.count === 1 ? "load" : "loads"
              } on ${formatBoardDateLabel(cancelAllTarget.date)} will be removed from the active planning board.\n\nOnly Unallocated loads for this date are affected. Allocated loads must be deallocated first.`
            : ""
        }
        confirmLabel={`Cancel ${cancelAllTarget?.count ?? 0}`}
        cancelLabel="Keep Loads"
        variant="danger"
        loading={isCancellingAll}
        onConfirm={confirmCancelAll}
        onCancel={() => {
          if (!isCancellingAll) setCancelAllTarget(null);
        }}
      />

      {/* Destination chooser — opened only when a truck already has eligible
          planned routes; the dispatcher explicitly picks the destination. */}
      {dropDest?.mode === "allocate" && (
        <AllocationDestinationDialog
          planningLoadId={dropDest.planningLoadId}
          client={dropDest.client}
          truckFleetNoStr={dropDest.truckFleetNoStr}
          boardDate={boardDate}
          onSubmit={handleDestinationSubmit}
          onClose={() => setDropDest(null)}
        />
      )}
      {dropDest?.mode === "move" && (
        <MoveDestinationDialog
          planningLoadId={dropDest.planningLoadId}
          client={dropDest.client}
          truckFleetNoStr={dropDest.truckFleetNoStr}
          boardDate={boardDate}
          sourceRouteId={dropDest.sourceRouteId}
          onSubmit={handleDestinationSubmit}
          onClose={() => setDropDest(null)}
        />
      )}

      {/* Floating drag preview — follows the pointer. Route reorder previews are
          visually distinct from load previews (compact ROUTE cap, no client). */}
      <DragOverlay>
        {activeDrag ? (
          activeDrag.sourceType === "route" ? (
            <div className="w-52 rounded-md border border-[#06B6D4]/50 bg-[var(--background)]/85 shadow-xl shadow-[rgba(6,182,212,0.18)] opacity-90 px-2.5 py-2 pointer-events-none">
              <div className="text-xs font-bold text-[var(--foreground)]">
                Route {activeDrag.routeNumber}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--nav-text-color)]">
                {activeDrag.loadCount} {activeDrag.loadCount === 1 ? "load" : "loads"}
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--nav-text-color)]/90 truncate">
                Driver: {activeDrag.driverName || "\u2014"}
              </div>
            </div>
          ) : activeDrag.sourceType === "allocated-load" ? (
            <div className="w-56 rounded-md border border-[#06B6D4]/70 bg-[var(--background)]/95 shadow-xl shadow-[rgba(6,182,212,0.25)] opacity-90 px-2.5 py-1.5 pointer-events-none">
              <div className="text-xs font-bold text-[var(--foreground)] truncate">
                {activeDrag.client}
              </div>
              <div className="text-[10px] text-[var(--nav-text-color)] truncate">
                {activeDrag.fromLocations.join(" + ") || "\u2014"}
                <span className="mx-1">&#8594;</span>
                {activeDrag.toLocations.join(" + ") || "\u2014"}
              </div>
              <div className="mt-0.5 text-[9px] text-[var(--nav-text-color)]/90 truncate">
                From Truck {activeDrag.sourceTruckFleetNoStr} · Route{" "}
                {activeDrag.sourceRouteNumber}
              </div>
            </div>
          ) : activeLoad ? (
            <div className="w-56 rounded-md border border-[#06B6D4]/70 bg-[var(--background)]/95 shadow-xl shadow-[rgba(6,182,212,0.25)] opacity-95 px-2.5 py-1.5 pointer-events-none">
              <div className="text-xs font-bold text-[var(--foreground)] truncate">
                {activeLoad.client}
              </div>
              <div className="text-[10px] text-[var(--nav-text-color)] truncate">
                {activeLoad.fromLocations?.join(" + ") || "\u2014"}
                <span className="mx-1">&#8594;</span>
                {activeLoad.toLocations?.join(" + ") || "\u2014"}
              </div>
            </div>
          ) : null
        ) : null}
      </DragOverlay>
    </div>
    </DndContext>
  );
}

function LoadPreview({
  index,
  load,
  resolutions,
  onAddClient,
}: {
  index: number;
  load: ParsedLoad;
  resolutions: { clientInput: string; resolved?: string; status: string }[];
  onAddClient: (rawToken: string) => void;
}) {
  const resolution = resolutions.find((r) => r.clientInput.toLowerCase() === load.clientInput.toLowerCase());
  const ok = load.valid && resolution?.status === "matched";
  /* 6.4A — the Add Client action appears ONLY for a syntactically valid line
     whose client resolution is "unknown". Malformed syntax never offers it. */
  const addable = shouldOfferAddClient(load.valid, resolution?.status);

  return (
    <div
      className={`flex items-center gap-2.5 px-2.5 py-1.5 ${
        ok
          ? ""
          : "bg-red-50 dark:bg-red-500/10"
      }`}
    >
      {/* Numbered circular marker — far left */}
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 text-xs font-semibold ${
          ok
            ? "bg-slate-500/20 text-slate-200 border border-teal-300/40 shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)]"
            : "bg-slate-500/20 text-slate-200 border border-red-300/40"
        }`}
      >
        {index + 1}
      </span>

      {/* Client + route — middle */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--foreground)] truncate">
          {resolution?.resolved || load.clientInput}
        </div>
        <div className="text-[11px] text-[var(--nav-text-color)] truncate">
          {load.fromLocations.join(" + ")}
          <span className="mx-1">&#8594;</span>
          {load.toLocations.join(" + ")}
        </div>
        {!load.valid && (
          <div className="text-[var(--danger-text)] mt-0.5">
            {load.errors.join("; ")}
          </div>
        )}
        {addable && (
          <div className="mt-1">
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Unknown client
            </span>
            <button
              type="button"
              onClick={() => onAddClient(load.clientInput)}
              className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#06B6D4] bg-[#06B6D4]/10 hover:bg-[#06B6D4]/15 border border-[#06B6D4]/25 rounded-md px-2 py-1 transition-colors"
            >
              + Add {presentClientName(load.clientInput)} as Client
            </button>
          </div>
        )}
      </div>

      {/* Validation indicator — green circle with check, aligned right column */}
      <span className="w-5 shrink-0 flex items-center justify-center">
        {ok ? (
          <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-500/15 border border-emerald-400/50 text-emerald-400">
            <CheckCircle2 size={13} className="text-emerald-400" />
          </span>
        ) : (
          <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-red-500/15 border border-red-400/50 text-red-400">
            <AlertTriangle size={13} className="text-red-400" />
          </span>
        )}
      </span>

      {/* Three-dot actions — extreme right. No per-row mutation exists in
          this stage, so it stays presentation-only/disabled. */}
      <button
        disabled
        title="No per-row actions are available yet — editing parsed loads isn't implemented in this stage. Re-capture to refine a load."
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[var(--nav-text-color)] opacity-60 cursor-not-allowed"
      >
        <MoreVertical size={13} />
      </button>
    </div>
  );
}

function UnallocatedRow({
  load,
  accent,
  qty,
  disabled,
  menuOpen,
  onToggleMenu,
  onCancel,
  onAllocate,
}: {
  load: Doc<"planningLoads">;
  accent: string;
  qty: string | null;
  disabled?: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCancel: (id: Id<"planningLoads">) => void;
  onAllocate: () => void;
}) {
  /* The DRAG HANDLE alone initiates dragging — the Allocate button and the
     ⋮ menu are normal buttons and never start a drag. */
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(load._id),
    disabled,
    data: {
      sourceType: "unallocated-load",
      planningLoadId: String(load._id),
    } satisfies UnallocatedLoadDragData,
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative border border-[var(--card-border)] rounded-md bg-[var(--card-bg)]/50 flex items-center overflow-hidden transition-opacity ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <span className="w-1 self-stretch shrink-0" style={{ backgroundColor: accent }} />
      {/* Dedicated drag handle — grip left of the client name */}
      <button
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Drag ${load.client} to allocate`}
        title={disabled ? "Allocation in progress" : "Drag to a truck to allocate"}
        className="self-stretch shrink-0 w-5 flex items-center justify-center text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] cursor-grab active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 touch-none select-none"
      >
        <span className="text-[12px] leading-none" aria-hidden>
          &#x282F;
        </span>
      </button>
      <div className="min-w-0 flex-1 px-2.5 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-[var(--foreground)] truncate">
            {load.client}
          </span>
          {qty && (
            <span className="text-[9px] font-semibold text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] px-1.5 py-px rounded shrink-0">
              {qty}
            </span>
          )}
          <span className="text-[9px] text-[var(--nav-text-color)] shrink-0">
            {formatBoardDateLabel(load.loadDate)}
          </span>
        </div>
        <div className="text-[10px] text-[var(--nav-text-color)] truncate">
          {load.fromLocations?.join(" + ") || "—"}
          <span className="mx-1">&#8594;</span>
          {load.toLocations?.join(" + ") || "—"}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 pr-1">
        {/* Primary dispatcher action — always visible, cyan styling */}
        <button
          onClick={onAllocate}
          className="px-2 py-1 rounded-md text-[10px] font-bold text-[#06B6D4] bg-[#06B6D4]/10 border border-[#06B6D4]/25 hover:bg-[#06B6D4]/20 transition-colors"
        >
          Allocate
        </button>
        <button
          onClick={onToggleMenu}
          aria-label={`Actions for ${load.client}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="px-1.5 py-1 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] rounded-md transition-colors"
          title="Actions — allocate or cancel this load"
        >
          <MoreVertical size={13} />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={onToggleMenu} />
          <div
            role="menu"
            aria-label={`Actions for ${load.client}`}
            className="absolute right-1 top-full z-30 mt-1 min-w-[148px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] shadow-xl p-1"
          >
            <button
              role="menuitem"
              onClick={() => onCancel(load._id)}
              className="w-full text-left px-2.5 py-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
            >
              Cancel Load
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardContent />
    </Suspense>
  );
}