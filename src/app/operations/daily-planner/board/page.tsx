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
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  parseQuickCapture,
  resolveParsedClients,
  type ParseResult,
  type ParsedLoad,
  type CustomerRecord,
} from "@/src/lib/planner/parser";
import {
  accentColorFor,
  filterUnallocatedLoads,
  formatQuantity,
  formatBoardDateLabel,
  addLoadsButtonLabel,
} from "@/src/lib/planner/planningRail";
import {
  type UnallocatedLoadDragData,
  type TruckDropTargetData,
  type DestinationChoice,
  resolveDropFromOver,
  toAllocationAction,
} from "@/src/lib/planner/dndPlanning";
import { type Id, type Doc } from "@/convex/_generated/dataModel";
import FleetAllocationBoard from "@/src/components/planner/FleetAllocationBoard";
import AllocateLoadDialog from "@/src/components/planner/AllocateLoadDialog";
import AllocationDestinationDialog from "@/src/components/planner/AllocationDestinationDialog";
import { Zap, MoreVertical, Search, CheckCircle2, AlertTriangle, Boxes } from "lucide-react";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 shadow-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none text-sm transition-colors text-[var(--foreground)]";

const sectionTitle =
  "text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]";

function getToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function BoardContent() {
  const { token } = useAuth();
  const region = useRegionArg();
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlDate = searchParams.get("date");
  const [boardDate, setBoardDate] = useState(urlDate || getToday());

  const [captureText, setCaptureText] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [batchKey] = useState(() => `board-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const batchKeyRef = useRef(batchKey);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [unallocatedSearch, setUnallocatedSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [allocatingLoad, setAllocatingLoad] = useState<{ id: string; client: string } | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  /* DnD — temporary UI state only. Convex queries remain authoritative. */
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [pendingDropLoadId, setPendingDropLoadId] = useState<string | null>(null);
  const [dndError, setDndError] = useState<string | null>(null);
  const [dropDest, setDropDest] = useState<{
    planningLoadId: Id<"planningLoads">;
    client: string;
    truckFleetNoStr: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: defaultKeyboardCoordinateGetter })
  );

  const unallocated = useQuery(
    api.planningLoads.getUnallocatedByDate,
    { loadDate: boardDate, token, region }
  );

  const customers = useQuery(api.customers.list, {});

  const createBulk = useMutation(api.planningLoads.createBulkPlanningLoads);
  const cancelLoad = useMutation(api.planningLoads.cancelPlanningLoad);
  const allocateNewRoute = useMutation(api.planningLoads.allocateToNewRoute);
  const allocateExistingRoute = useMutation(api.planningLoads.allocateToExistingRoute);

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

  const handleParse = useCallback(() => {
    const result = parseQuickCapture(captureText);
    setParsed(result);
  }, [captureText]);

  const handleClear = useCallback(() => {
    setCaptureText("");
    setParsed(null);
    textareaRef.current?.focus();
  }, []);

  const handleAddLoads = useCallback(async () => {
    if (!parsed || !allValid) return;

    setIsCreating(true);
    try {
      const loads = parsed.loads.map((load) => ({
        loadDate: parsed.date || boardDate,
        client: load.client || load.clientInput,
        fromLocations: load.fromLocations,
        toLocations: load.toLocations,
      }));

      const result = await createBulk({
        region: (region || "garden_route") as "garden_route" | "eastern_cape",
        token,
        batchKey: batchKeyRef.current,
        loads,
      });

      if (result.created) {
        handleClear();
      }
    } catch (err: unknown) {
      console.error("Failed to create loads:", err);
    } finally {
      setIsCreating(false);
    }
  }, [parsed, allValid, boardDate, region, token, createBulk, handleClear]);

  const handleCancel = useCallback(
    async (id: Id<"planningLoads">) => {
      setOpenMenuId(null);
      if (!confirm("Cancel this load?")) return;
      setCancelError(null);
      try {
        await cancelLoad({ id, token });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Cancel failed";
        setCancelError(msg);
      }
    },
    [cancelLoad, token]
  );

  const visibleUnallocated = useMemo(() => {
    if (!unallocated) return [];
    return filterUnallocatedLoads(unallocated, unallocatedSearch);
  }, [unallocated, unallocatedSearch]);

  /* ── DnD handlers — a drag is only another frontend interaction for the
         existing allocation lifecycle. Backend mutations stay authoritative. */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDndError(null);
    setOpenMenuId(null);
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current as
        | UnallocatedLoadDragData
        | undefined;
      setActiveDragId(null);

      if (!activeData || activeData.sourceType !== "unallocated-load") return;
      const dragId = activeData.planningLoadId;

      const overId = event.over ? String(event.over.id) : null;
      const overData = (event.over?.data.current ?? null) as TruckDropTargetData | null;
      const decision = resolveDropFromOver(overId, overData, dragId);

      // Invalid target / dropped outside any target → card returns. No mutation.
      if (decision.kind === "no_action") return;

      // Duplicate-drop protection — a load already being allocated is never re-dragged.
      if (pendingDropLoadId === dragId) return;

      const load = unallocated?.find((l) => String(l._id) === dragId);
      if (!load || !overData) return;

      if (decision.kind === "choose_destination") {
        setDropDest({
          planningLoadId: dragId as Id<"planningLoads">,
          client: load.client,
          truckFleetNoStr: overData.truckFleetNoStr,
        });
        return;
      }

      // Empty eligible truck → directly allocateToNewRoute (Route 1).
      setDndError(null);
      setPendingDropLoadId(dragId);
      allocateNewRoute({
        planningLoadId: dragId as Id<"planningLoads">,
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

  /* Destination chooser confirm — executes the exact qualification-mapped
     mutation for a chosen existing route or a new route. */
  const handleDestinationSubmit = useCallback(
    async (choice: DestinationChoice): Promise<void> => {
      if (!dropDest) return;

      setDndError(null);
      setPendingDropLoadId(String(dropDest.planningLoadId));
      try {
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
        setDropDest(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Allocation failed";
        setDndError(msg);
        throw err;
      } finally {
        setPendingDropLoadId(null);
      }
    },
    [dropDest, token, allocateExistingRoute, allocateNewRoute]
  );

  const activeLoad = useMemo(() => {
    if (!activeDragId || !unallocated) return null;
    return unallocated.find((l) => String(l._id) === activeDragId) ?? null;
  }, [activeDragId, unallocated]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
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
          <div className="relative flex-shrink-0 rounded-xl border border-[#06B6D4]/30 bg-[radial-gradient(130%_130%_at_18%_0%,rgba(6,182,212,0.10),rgba(11,18,32,0.96)_55%,rgba(8,12,22,0.96)_100%)] p-4 shadow-[0_0_0_1px_rgba(6,182,212,0.12),0_0_22px_rgba(6,182,212,0.12),0_0_44px_rgba(6,182,212,0.05),inset_0_0_18px_rgba(6,182,212,0.05)]">
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
              className="w-full px-3.5 py-3 rounded-lg border border-[#06B6D4]/20 bg-[linear-gradient(180deg,rgba(6,182,212,0.06),rgba(9,16,28,0.92)_60%)] shadow-[0_0_0_1px_rgba(0,0,0,0.2),inset_0_2px_6px_rgba(0,0,0,0.35),inset_0_0_16px_rgba(6,182,212,0.05)] focus:border-[#06B6D4]/50 focus:ring-2 focus:ring-[#06B6D4]/20 focus:outline-none resize-y font-mono text-xs leading-relaxed text-[var(--foreground)] placeholder:text-[var(--nav-text-color)]/70 transition-colors"
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
                      <div key={i} className="text-[10px] text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-md">
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
                      <LoadPreview key={i} index={i} load={load} resolutions={clientResolutions} />
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
              <span className="text-[10px] font-semibold text-[var(--nav-text-color)]">
                {formatBoardDateLabel(boardDate)}
              </span>
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
              <div className="mb-2 text-[10px] text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-1 rounded-md shrink-0">
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
            className="shrink-0 text-red-500 hover:text-red-700 font-bold px-1"
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

      {/* Destination chooser — opened only when a truck already has eligible
          planned routes; the dispatcher explicitly picks the destination. */}
      {dropDest && (
        <AllocationDestinationDialog
          planningLoadId={dropDest.planningLoadId}
          client={dropDest.client}
          truckFleetNoStr={dropDest.truckFleetNoStr}
          boardDate={boardDate}
          onSubmit={handleDestinationSubmit}
          onClose={() => setDropDest(null)}
        />
      )}

      {/* Floating drag preview — follows the pointer, cyan accent, translucent */}
      <DragOverlay>
        {activeLoad ? (
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
}: {
  index: number;
  load: ParsedLoad;
  resolutions: { clientInput: string; resolved?: string; status: string }[];
}) {
  const resolution = resolutions.find((r) => r.clientInput.toLowerCase() === load.clientInput.toLowerCase());
  const ok = load.valid && resolution?.status === "matched";

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
          <div className="text-red-600 dark:text-red-400 mt-0.5">
            {load.errors.join("; ")}
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
          className="px-1.5 py-1 text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] rounded-md transition-colors"
          title="More actions"
        >
          <MoreVertical size={13} />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={onToggleMenu} />
          <div className="absolute right-1 top-full z-30 mt-1 min-w-[120px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] shadow-xl p-1">
            <button
              onClick={() => onCancel(load._id)}
              className="w-full text-left px-2.5 py-1.5 text-[10px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
            >
              Cancel
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