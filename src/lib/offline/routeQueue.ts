/**
 * Offline route-save queue.
 *
 * When the network is unavailable (or a save fails mid-flight), the Input page
 * stores the full `createDailyRoute` payload here with a stable client-generated
 * key. The key doubles as the mutation's `offlineKey`, so replaying the queue
 * can never duplicate a route that was actually created server-side.
 *
 * The queue is persisted in localStorage and survives reloads / app restarts.
 * Storage is injectable so unit tests can run without a DOM.
 */

export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

import type { Id } from "@/convex/_generated/dataModel";

/** The createDailyRoute args for one queued route (offlineKey included). */
export interface QueuedRoutePayload {
  routeDate: string;
  driverName: string;
  region?: "garden_route" | "eastern_cape";
  token?: string | null;
  kilometers: number;
  routeKilometers?: number;
  notes?: string;
  subcontractorId?: Id<"subcontractors">;
  truckFleetNo?: string;
  truckFleetNoStr?: string;
  trailerFleetNoStr?: string;
  offlineKey: string;
  loads: Array<{
    client: string;
    quantity: string;
    quantityType: string;
    rate: string;
    rateType: string;
    fromLocations: string[];
    toLocations: string[];
    kilometers?: number;
    loadId?: string;
    subcontractorRate?: string;
    subcontractorRateType?: string;
  }>;
  [key: string]: unknown;
}

export interface QueuedRoute {
  /** Client id — also passed as the mutation's offlineKey. */
  id: string;
  queuedAt: number;
  attempts: number;
  /** Set when the server rejected the item (auth/validation) — needs attention. */
  lastError?: string;
  payload: QueuedRoutePayload;
}

const QUEUE_KEY = "fleetcor_offline_route_queue";

/** In-memory fallback so module usage outside a browser never throws. */
function defaultStorage(): QueueStorage {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  // Minimal in-memory shim (also used by tests via explicit injection).
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

let storage: QueueStorage | null = null;
function getStorage(): QueueStorage {
  if (!storage) storage = defaultStorage();
  return storage;
}

/** Test hook: swap the backing storage (e.g. an in-memory map). */
export function __setStorage(next: QueueStorage | null) {
  storage = next;
}

function readQueue(): QueuedRoute[] {
  try {
    const raw = getStorage().getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRoute[]) {
  try {
    getStorage().setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* ignore quota errors — the queue simply won't persist */
  }
}

// ── Change notifications (for React) ─────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  }
}

/** Subscribe to queue changes; returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── API ─────────────────────────────────────────────────────────────────────

export function getPendingRoutes(): QueuedRoute[] {
  return readQueue();
}

export function enqueueRoute(payload: QueuedRoutePayload): QueuedRoute {
  const item: QueuedRoute = {
    id: payload.offlineKey,
    queuedAt: Date.now(),
    attempts: 0,
    payload,
  };
  const queue = readQueue();
  // Replace any existing item with the same key (re-save of the same route).
  const next = queue.filter((r) => r.id !== item.id);
  next.push(item);
  writeQueue(next);
  notify();
  return item;
}

export function removeRoute(id: string): void {
  const queue = readQueue();
  const next = queue.filter((r) => r.id !== id);
  if (next.length !== queue.length) {
    writeQueue(next);
    notify();
  }
}

export function markFailed(id: string, error: string): void {
  const queue = readQueue();
  const next = queue.map((r) => (r.id === id ? { ...r, lastError: error, attempts: r.attempts + 1 } : r));
  writeQueue(next);
  notify();
}

export function clearQueue(): void {
  writeQueue([]);
  notify();
}

/**
 * Stable per-save idempotency key. crypto.randomUUID where available, with a
 * timestamp fallback so every environment produces a unique key.
 */
export function newClientId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
