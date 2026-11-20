"use client";

import { useCallback, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import type { CeramicShipment } from "@/src/lib/ceramic-tiles/parser";
import { moveCeramicStop, reorderCeramicStop, orderedCeramicStops, resolveCeramicStopOrder, type CeramicStopOrder } from "@/src/lib/ceramic-tiles/stopOrder";

// Keep phone labels on their own row so move controls cannot squeeze the text.
const stopRow = "grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start";
const stopLabel = "min-w-0 flex-1 break-words text-sm leading-5";

// A warehouse stays within its town; town and offload targets never mix.
const stopCollision: CollisionDetection = args => {
  const droppableContainers = args.droppableContainers.filter(container => container.data.current?.group === args.active.data.current?.group);
  return args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers }) : closestCenter({ ...args, droppableContainers });
};

function DraggableStop({ id, group, label, disabled, className, children }: {
  id: string; group: string; label: string; disabled: boolean; className: string; children: (handle: ReactNode) => ReactNode;
}) {
  const dragId = JSON.stringify([group, id]);
  const data = { group, stopId: id, label };
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } = useDraggable({ id: dragId, data, disabled });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId, data, disabled });
  const setNodeRef = useCallback((node: HTMLDivElement | null) => { setDragRef(node); setDropRef(node); }, [setDragRef, setDropRef]);
  const handle = <button {...attributes} {...listeners} ref={setActivatorNodeRef} type="button" disabled={disabled}
    aria-label={`Drag ${label}`} tabIndex={-1} title="Drag to reorder. Use the Up / Down buttons with a keyboard. Escape cancels a drag."
    style={{ touchAction: "none" }} className="inline-flex min-h-11 w-11 shrink-0 sm:min-h-10 sm:w-9 cursor-grab items-center justify-center self-start rounded-md border border-[var(--card-border)] text-[var(--nav-text-color)] outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"><GripVertical size={18} /></button>;
  return <div ref={setNodeRef} role="group" aria-label={label}
    className={`${className} ${isDragging ? "opacity-35" : ""} ${isOver && !isDragging ? "ring-2 ring-cyan-500" : ""}`}>{children(handle)}</div>;
}

function MoveButtons({ label, index, count, disabled, onMove }: {
  label: string; index: number; count: number; disabled: boolean; onMove: (direction: -1 | 1) => void;
}) {
  return <div className="flex flex-wrap justify-end gap-1 sm:flex-nowrap">
    <button type="button" aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)}
      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[var(--card-border)] px-3 text-xs disabled:opacity-30 sm:min-h-9 sm:px-2"><ArrowUp size={14} />Up</button>
    <button type="button" aria-label={`Move ${label} down`} disabled={disabled || index === count - 1} onClick={() => onMove(1)}
      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-[var(--card-border)] px-3 text-xs disabled:opacity-30 sm:min-h-9 sm:px-2"><ArrowDown size={14} />Down</button>
  </div>;
}

export function CeramicStopOrderEditor({ shipment, order, disabled, onChange }: {
  shipment: CeramicShipment; order: CeramicStopOrder; disabled: boolean; onChange: (order: CeramicStopOrder) => void;
}) {
  const stops = orderedCeramicStops(shipment, order);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const moveWarehouse = (townId: string, from: string, to: string) => {
    const ids = stops.pickups.find(town => town.id === townId)?.warehouses.map(stop => stop.id) ?? [];
    const moved = reorderCeramicStop(ids, from, to);
    const replacements = new Map(ids.map((id, index) => [id, moved[index]]));
    onChange({ ...order, pickupWarehouses: order.pickupWarehouses.map(id => replacements.get(id) ?? id) });
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragLabel(null);
    const from = active.data.current, to = over?.data.current;
    if (disabled || !from || !to || from.group !== to.group || typeof from.stopId !== "string" || typeof to.stopId !== "string") return;
    if (from.group === "towns") onChange({ ...order, pickupTowns: reorderCeramicStop(order.pickupTowns, from.stopId, to.stopId) });
    else if (from.group === "offloads") onChange({ ...order, offloads: reorderCeramicStop(order.offloads, from.stopId, to.stopId) });
    else if (typeof from.group === "string" && from.group.startsWith("warehouses:")) moveWarehouse(from.group.slice("warehouses:".length), from.stopId, to.stopId);
  };
  return <DndContext sensors={sensors} collisionDetection={stopCollision} onDragStart={({ active }) => setDragLabel(String(active.data.current?.label ?? "Stop"))} onDragCancel={() => setDragLabel(null)} onDragEnd={onDragEnd}
    accessibility={{ screenReaderInstructions: { draggable: "Drag a grip to reorder a stop. Escape cancels. Use the Up and Down buttons to reorder with a keyboard." }, announcements: {
      onDragStart: ({ active }) => `Picked up ${active.data.current?.label}.`,
      onDragOver: ({ over }) => over ? `Over ${over.data.current?.label}.` : "Outside this stop list.",
      onDragEnd: ({ active, over }) => over ? `Dropped ${active.data.current?.label} at ${over.data.current?.label}.` : "Order unchanged.",
      onDragCancel: () => "Drag cancelled. Order unchanged.",
    } }}>
    <div className="space-y-4 rounded-xl border border-[var(--card-border)] bg-[var(--surface-sunken)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-semibold">Loading &amp; offloading order</h3><p className="mt-1 text-xs text-[var(--nav-text-color)]">Drag the grip beside a town, warehouse or delivery to change its order.</p></div>
        <button type="button" disabled={disabled || !!dragLabel} onClick={() => onChange(resolveCeramicStopOrder(shipment))}
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--card-border)] px-2 text-xs disabled:opacity-40"><RotateCcw size={14} />Reset to PDF order</button>
      </div>
      <section aria-label="Loading order" className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide">Loading order</h4>
        {stops.pickups.map((town, townIndex) => <DraggableStop key={town.id} id={town.id} group="towns" label={`${town.label} pickup town`} disabled={disabled} className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2">{handle => <>
          <div className={stopRow}>
            <div className="flex min-w-0 items-start gap-2">{handle}<strong className={stopLabel}>PICK UP {townIndex + 1}) {town.label}</strong></div>
            <MoveButtons label={`${town.label} pickup town`} index={townIndex} count={stops.pickups.length} disabled={disabled || !!dragLabel}
              onMove={direction => onChange({ ...order, pickupTowns: moveCeramicStop(order.pickupTowns, town.id, direction) })} />
          </div>
          <ol className="mt-2 space-y-1">
            {town.warehouses.map((warehouse, index) => <li key={warehouse.id}><DraggableStop id={warehouse.id} group={`warehouses:${town.id}`} label={`${warehouse.label} warehouse`} disabled={disabled} className={`${stopRow} rounded-md border border-[var(--card-border)] p-2`}>{warehouseHandle => <>
              <div className="flex min-w-0 items-start gap-2">{warehouseHandle}<span className={stopLabel}>{index + 1}. {warehouse.label}</span></div>
              <MoveButtons label={`${warehouse.label} warehouse`} index={index} count={town.warehouses.length} disabled={disabled || !!dragLabel}
                onMove={direction => moveWarehouse(town.id, warehouse.id, town.warehouses[index + direction]?.id ?? warehouse.id)} />
            </>}</DraggableStop></li>)}
          </ol>
        </>}</DraggableStop>)}
      </section>
      <section aria-label="Offloading order" className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide">Offloading order</h4>
        <ol className="space-y-2">{stops.offloads.map((stop, index) => <li key={stop.id}><DraggableStop id={stop.id} group="offloads" label={`offload ${index + 1} ${stop.label}`} disabled={disabled} className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2">{handle => <>
          <div className={stopRow}><div className="flex min-w-0 items-start gap-2">{handle}<strong className={stopLabel}>{index + 1}. {stop.label}</strong></div>
            <MoveButtons label={`offload ${index + 1} ${stop.label}`} index={index} count={stops.offloads.length} disabled={disabled || !!dragLabel}
              onMove={direction => onChange({ ...order, offloads: moveCeramicStop(order.offloads, stop.id, direction) })} />
          </div>
          {stop.detail && <p className="mt-1 break-words text-xs text-[var(--nav-text-color)]">{stop.detail}</p>}
        </>}</DraggableStop></li>)}</ol>
      </section>
      <p className="text-xs text-[var(--nav-text-color)]">The preview updates after you drop. Save instructions below to keep this order.</p>
    </div>
    <DragOverlay dropAnimation={null}>{dragLabel ? <div className="flex max-w-80 items-center gap-2 rounded-lg border-2 border-cyan-500 bg-[var(--card-bg)] p-3 text-xs font-semibold text-[var(--foreground)] shadow-xl"><GripVertical size={18} />{dragLabel}</div> : null}</DragOverlay>
  </DndContext>;
}
