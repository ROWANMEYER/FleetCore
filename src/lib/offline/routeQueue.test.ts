import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  __setStorage,
  enqueueRoute,
  getPendingRoutes,
  removeRoute,
  markFailed,
  clearQueue,
  subscribe,
  newClientId,
} from "./routeQueue";
import type { QueuedRoutePayload, QueueStorage } from "./routeQueue";

function memoryStorage(): QueueStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
}

function makePayload(overrides: Partial<QueuedRoutePayload> = {}): QueuedRoutePayload {
  return {
    routeDate: "2026-08-13",
    driverName: "J SMITH",
    kilometers: 120,
    region: "garden_route",
    token: "tok",
    truckFleetNoStr: "101",
    offlineKey: "key-1",
    loads: [
      {
        client: "ACME",
        quantity: "10",
        quantityType: "tons",
        rate: "150",
        rateType: "per_unit",
        fromLocations: ["GEORGE"],
        toLocations: ["KNYSNA"],
      },
    ],
    ...overrides,
  };
}

describe("routeQueue", () => {
  beforeEach(() => {
    __setStorage(memoryStorage());
  });

  it("enqueue + read round-trips the payload", () => {
    enqueueRoute(makePayload());
    const items = getPendingRoutes();
    expect(items).toHaveLength(1);
    expect(items[0].payload.truckFleetNoStr).toBe("101");
    expect(items[0].payload.offlineKey).toBe("key-1");
    expect(items[0].attempts).toBe(0);
  });

  it("re-enqueueing the same offlineKey replaces the item (no duplicates)", () => {
    enqueueRoute(makePayload({ notes: "first" }));
    enqueueRoute(makePayload({ notes: "second" }));
    const items = getPendingRoutes();
    expect(items).toHaveLength(1);
    expect(items[0].payload.notes).toBe("second");
  });

  it("removeRoute deletes only the matching id", () => {
    enqueueRoute(makePayload({ offlineKey: "a" }));
    enqueueRoute(makePayload({ offlineKey: "b" }));
    removeRoute("a");
    const items = getPendingRoutes();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("b");
  });

  it("markFailed records the error and bumps attempts", () => {
    enqueueRoute(makePayload());
    markFailed("key-1", "Cannot edit a locked route.");
    const items = getPendingRoutes();
    expect(items[0].lastError).toBe("Cannot edit a locked route.");
    expect(items[0].attempts).toBe(1);
  });

  it("clearQueue empties the queue", () => {
    enqueueRoute(makePayload());
    clearQueue();
    expect(getPendingRoutes()).toHaveLength(0);
  });

  it("notifies subscribers on mutation", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    enqueueRoute(makePayload());
    expect(listener).toHaveBeenCalledTimes(1);
    removeRoute("key-1");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    clearQueue();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("newClientId is unique", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newClientId()));
    expect(ids.size).toBe(50);
  });

  it("survives a storage swap (persistence across 'sessions')", () => {
    const storage = memoryStorage();
    __setStorage(storage);
    enqueueRoute(makePayload());
    // Simulate a fresh app load with the same underlying storage.
    __setStorage(memoryStorage());
    __setStorage(storage);
    expect(getPendingRoutes()).toHaveLength(1);
  });

  it("corrupt JSON is ignored", () => {
    const storage = memoryStorage();
    storage.setItem("fleetcor_offline_route_queue", "{not json");
    __setStorage(storage);
    expect(getPendingRoutes()).toEqual([]);
  });
});
