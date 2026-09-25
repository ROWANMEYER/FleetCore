import { describe, it, expect, beforeEach } from "vitest";
import { buildDraftKey, resolveDraftRegion, sanitizeScopeSegment } from "./draftKey";
import {
  clearDraft,
  containsSensitiveField,
  isSensitiveFieldName,
  readDraft,
  stableStringify,
  writeDraft,
  type StorageLike,
} from "./draftStore";
import {
  draftChannelListenerCount,
  publishDraftChange,
  resetDraftChannels,
  subscribeDraftChanges,
} from "./draftChannel";
import { parseQuickCapture } from "../planner/parser";

function createMemoryStorage(seed: Record<string, string> = {}): StorageLike & {
  dump: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

function createThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota exceeded");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
}

const USER_A = "kg7ab12cd34";
const USER_B = "kg7zz99yy88";
const KEY_A = buildDraftKey({ workflow: "daily-planner:quick-capture", userId: USER_A })!;
const KEY_B = buildDraftKey({ workflow: "daily-planner:quick-capture", userId: USER_B })!;

describe("buildDraftKey", () => {
  it("scopes by workflow, user and region", () => {
    expect(buildDraftKey({ workflow: "daily-planner:quick-capture", userId: USER_A })).toBe(
      "fleetcore:draft:daily-planner-quick-capture:u-kg7ab12cd34:r-unscoped:v1"
    );
    expect(
      buildDraftKey({
        workflow: "daily-planner:quick-capture",
        userId: USER_A,
        region: "garden_route",
      })
    ).toBe("fleetcore:draft:daily-planner-quick-capture:u-kg7ab12cd34:r-garden_route:v1");
  });

  it("refuses to build a key while the user identity is unknown", () => {
    expect(buildDraftKey({ workflow: "daily-planner:quick-capture", userId: null })).toBeNull();
    expect(buildDraftKey({ workflow: "daily-planner:quick-capture", userId: "" })).toBeNull();
    expect(buildDraftKey({ workflow: "daily-planner:quick-capture", userId: undefined })).toBeNull();
  });

  it("refuses an empty workflow so keys can never collapse to one global draft", () => {
    expect(buildDraftKey({ workflow: "", userId: USER_A })).toBeNull();
    expect(buildDraftKey({ workflow: "   ", userId: USER_A })).toBeNull();
  });

  it("sanitizes segments so storage keys stay predictable", () => {
    expect(sanitizeScopeSegment("a b/c", "fallback")).toBe("a-b-c");
    expect(sanitizeScopeSegment("!!!", "fallback")).toBe("fallback");
    expect(sanitizeScopeSegment("x".repeat(200), "fallback")).toHaveLength(64);
  });
});

describe("draft store — restore across remounts and navigation", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("A. restores the value written by a previous mount", () => {
    expect(writeDraft(storage, KEY_A, { captureText: "acme x a na b" })).toBe(true);
    const remounted = readDraft<{ captureText: string }>(storage, KEY_A);
    expect(remounted).toEqual({ captureText: "acme x a na b" });
  });

  it("B. a different screen reading the same workflow key sees the draft", () => {
    writeDraft(storage, KEY_A, { captureText: "navigated away" });
    const afterNavigation = readDraft<{ captureText: string }>(storage, KEY_A);
    expect(afterNavigation?.captureText).toBe("navigated away");
  });

  it("C. survives a full storage reinitialisation when the backend is a new map", () => {
    writeDraft(storage, KEY_A, { captureText: "persisted" });
    const reinitialised = createMemoryStorage(storage.dump());
    expect(readDraft<{ captureText: string }>(reinitialised, KEY_A)?.captureText).toBe(
      "persisted"
    );
  });

  it("D. clearing on submit success removes the draft", () => {
    writeDraft(storage, KEY_A, { captureText: "submitted" });
    clearDraft(storage, KEY_A);
    expect(readDraft(storage, KEY_A)).toBeNull();
    expect(storage.dump()[KEY_A]).toBeUndefined();
  });

  it("E. a failed submit keeps the draft for retry", () => {
    writeDraft(storage, KEY_A, { captureText: "server rejected" });
    expect(readDraft<{ captureText: string }>(storage, KEY_A)?.captureText).toBe(
      "server rejected"
    );
  });

  it("F. a deliberate cancel clears the draft", () => {
    writeDraft(storage, KEY_A, { captureText: "cancelled" });
    clearDraft(storage, KEY_A);
    expect(readDraft(storage, KEY_A)).toBeNull();
  });
});

describe("draft store — hostile storage contents", () => {
  it("G. corrupt JSON falls back safely and is evicted", () => {
    const storage = createMemoryStorage({ [KEY_A]: "{not json" });
    expect(readDraft(storage, KEY_A)).toBeNull();
    expect(storage.dump()[KEY_A]).toBeUndefined();
  });

  it("G. non-object and array payloads are rejected", () => {
    expect(readDraft(createMemoryStorage({ [KEY_A]: "[1,2,3]" }), KEY_A)).toBeNull();
    expect(readDraft(createMemoryStorage({ [KEY_A]: '"a string"' }), KEY_A)).toBeNull();
    expect(readDraft(createMemoryStorage({ [KEY_A]: "null" }), KEY_A)).toBeNull();
  });

  it("G. a payload missing the envelope fields is rejected", () => {
    expect(readDraft(createMemoryStorage({ [KEY_A]: '{"value":{}}' }), KEY_A)).toBeNull();
    expect(readDraft(createMemoryStorage({ [KEY_A]: '{"v":1}' }), KEY_A)).toBeNull();
  });

  it("H. an old envelope version is discarded instead of crashing", () => {
    const storage = createMemoryStorage({
      [KEY_A]: JSON.stringify({ v: 0, at: Date.now(), value: { captureText: "legacy" } }),
    });
    expect(readDraft(storage, KEY_A)).toBeNull();
    expect(storage.dump()[KEY_A]).toBeUndefined();
  });

  it("H. a future envelope version is discarded too", () => {
    const storage = createMemoryStorage({
      [KEY_A]: JSON.stringify({ v: 99, at: Date.now(), value: { captureText: "future" } }),
    });
    expect(readDraft(storage, KEY_A)).toBeNull();
  });

  it("honours an explicit maxAgeMs window", () => {
    const expired = createMemoryStorage({
      [KEY_A]: JSON.stringify({ v: 1, at: 1_000, value: { captureText: "old" } }),
    });
    expect(readDraft(expired, KEY_A, { maxAgeMs: 500, now: 2_000 })).toBeNull();
    expect(expired.dump()[KEY_A]).toBeUndefined();

    const fresh = createMemoryStorage({
      [KEY_A]: JSON.stringify({ v: 1, at: 1_000, value: { captureText: "old" } }),
    });
    expect(readDraft(fresh, KEY_A, { maxAgeMs: 5_000, now: 1_200 })).toEqual({
      captureText: "old",
    });
  });

  it("tolerates storage that throws on every access", () => {
    const throwing = createThrowingStorage();
    expect(readDraft(throwing, KEY_A)).toBeNull();
    expect(writeDraft(throwing, KEY_A, { captureText: "x" })).toBe(false);
    expect(() => clearDraft(throwing, KEY_A)).not.toThrow();
  });

  it("returns null for a null storage or null key", () => {
    expect(readDraft(null, KEY_A)).toBeNull();
    expect(readDraft(createMemoryStorage(), null)).toBeNull();
    expect(writeDraft(null, KEY_A, { a: 1 })).toBe(false);
  });
});

describe("draft store — user and region isolation", () => {
  it("I. one user can never read another user's draft", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: "user A private" });

    expect(readDraft<{ captureText: string }>(storage, KEY_B)).toBeNull();
    expect(KEY_A).not.toBe(KEY_B);

    writeDraft(storage, KEY_B, { captureText: "user B private" });
    expect(readDraft<{ captureText: string }>(storage, KEY_A)?.captureText).toBe(
      "user A private"
    );
    expect(readDraft<{ captureText: string }>(storage, KEY_B)?.captureText).toBe(
      "user B private"
    );
  });

  it("J. a Garden Route draft never becomes an Eastern Cape draft", () => {
    const storage = createMemoryStorage();
    const garden = buildDraftKey({
      workflow: "daily-planner:input",
      userId: USER_A,
      region: "garden_route",
    })!;
    const eastern = buildDraftKey({
      workflow: "daily-planner:input",
      userId: USER_A,
      region: "eastern_cape",
    })!;

    writeDraft(storage, garden, { notes: "garden only" });
    expect(readDraft(storage, eastern)).toBeNull();
    expect(readDraft<{ notes: string }>(storage, garden)?.notes).toBe("garden only");
  });

  it("J. an admin switching the region filter gets a separate draft", () => {
    const all = buildDraftKey({
      workflow: "daily-planner:quick-capture",
      userId: USER_A,
      region: "all",
    })!;
    const garden = buildDraftKey({
      workflow: "daily-planner:quick-capture",
      userId: USER_A,
      region: "garden_route",
    })!;
    expect(all).not.toBe(garden);
  });
});

describe("draft store — secret protection", () => {
  it("L. refuses to persist auth tokens or passwords", () => {
    const storage = createMemoryStorage();
    expect(writeDraft(storage, KEY_A, { token: "secret-token" })).toBe(false);
    expect(writeDraft(storage, KEY_A, { password: "hunter2" })).toBe(false);
    expect(writeDraft(storage, KEY_A, { nested: { sessionToken: "abc" } })).toBe(false);
    expect(writeDraft(storage, KEY_A, { list: [{ apiKey: "x" }] })).toBe(false);
    expect(storage.dump()).toEqual({});
  });

  it("L. a nested token inside a load list is still refused", () => {
    const storage = createMemoryStorage();
    expect(
      writeDraft(storage, KEY_A, {
        loads: [{ clientName: "Acme" }, { clientName: "X", token: "leak" }],
      })
    ).toBe(false);
  });

  it("detects sensitive field names case-insensitively", () => {
    expect(isSensitiveFieldName("Token")).toBe(true);
    expect(isSensitiveFieldName(" PASSWORD ")).toBe(true);
    expect(isSensitiveFieldName("clientName")).toBe(false);
    expect(containsSensitiveField({ a: [{ b: { Authorization: "x" } }] })).toBe(true);
    expect(containsSensitiveField({ clientName: "Acme", rate: "100" })).toBe(false);
  });

  it("never stores the session token under a draft key", () => {
    const storage = createMemoryStorage({
      "fleetcore-session-token": "live-token",
    });
    writeDraft(storage, KEY_A, { captureText: "hello" });
    expect(storage.dump()["fleetcore-session-token"]).toBe("live-token");
    expect(JSON.stringify(storage.dump()[KEY_A])).not.toContain("live-token");
  });
});

describe("draft store — validation callback", () => {
  it("evicts a draft the validator rejects", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: 42 });
    const result = readDraft<{ captureText: string }>(storage, KEY_A, {
      validate: (value) => {
        const source = value as { captureText?: unknown };
        return typeof source?.captureText === "string" ? (source as { captureText: string }) : null;
      },
    });
    expect(result).toBeNull();
    expect(storage.dump()[KEY_A]).toBeUndefined();
  });

  it("lets the validator sanitise rather than only accept or reject", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: "keep", junk: "drop" });
    const result = readDraft<{ captureText: string }>(storage, KEY_A, {
      validate: (value) => ({ captureText: (value as { captureText: string }).captureText }),
    });
    expect(result).toEqual({ captureText: "keep" });
  });

  it("treats a throwing validator as a rejection", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: "boom" });
    expect(
      readDraft(storage, KEY_A, {
        validate: () => {
          throw new Error("bad validator");
        },
      })
    ).toBeNull();
  });
});

describe("stableStringify", () => {
  it("never throws on circular structures", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    expect(stableStringify(circular)).toBe("null");
  });

  it("is order sensitive but stable for equal structures", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ a: 1, b: 2 }));
  });
});

describe("draftChannel — same-document sibling instances", () => {
  beforeEach(() => {
    resetDraftChannels();
  });

  it("delivers a change to every listener on the same key", () => {
    const seen: unknown[] = [];
    subscribeDraftChanges(KEY_A, (_key, value) => seen.push(value));
    subscribeDraftChanges(KEY_A, (_key, value) => seen.push(value));
    publishDraftChange(KEY_A, { captureText: "sibling" });
    expect(seen).toEqual([{ captureText: "sibling" }, { captureText: "sibling" }]);
    expect(draftChannelListenerCount(KEY_A)).toBe(2);
  });

  it("does not leak values across different keys", () => {
    const seen: unknown[] = [];
    subscribeDraftChanges(KEY_A, (_key, value) => seen.push(value));
    publishDraftChange(KEY_B, { captureText: "other user" });
    expect(seen).toEqual([]);
  });

  it("unsubscribes cleanly and a broken listener cannot starve the others", () => {
    const seen: unknown[] = [];
    const unsubscribeFirst = subscribeDraftChanges(KEY_A, () => {
      throw new Error("listener exploded");
    });
    subscribeDraftChanges(KEY_A, (_key, value) => seen.push(value));

    publishDraftChange(KEY_A, "first");
    expect(seen).toEqual(["first"]);

    unsubscribeFirst();
    expect(draftChannelListenerCount(KEY_A)).toBe(1);
    publishDraftChange(KEY_A, "second");
    expect(seen).toEqual(["first", "second"]);

    resetDraftChannels();
    expect(draftChannelListenerCount(KEY_A)).toBe(0);
  });
});

describe("resolveDraftRegion", () => {
  it("locks a regional user to their own region regardless of the sidebar filter", () => {
    expect(
      resolveDraftRegion({ role: "regional", region: "garden_route" }, undefined)
    ).toBe("garden_route");
    expect(
      resolveDraftRegion({ role: "regional", region: "eastern_cape" }, "garden_route")
    ).toBe("eastern_cape");
  });

  it("falls back to garden_route for a regional user with no region on record", () => {
    expect(resolveDraftRegion({ role: "regional", region: null }, undefined)).toBe(
      "garden_route"
    );
  });

  it("follows the admin sidebar filter and isolates the all-regions view", () => {
    expect(resolveDraftRegion({ role: "admin", region: null }, undefined)).toBe("all");
    expect(resolveDraftRegion({ role: "admin", region: null }, "eastern_cape")).toBe(
      "eastern_cape"
    );
  });

  it("waits for a known identity instead of guessing a region", () => {
    expect(resolveDraftRegion(null, "garden_route")).toBe("unresolved");
  });
});

describe("quick capture — parser output is re-derived, never stored", () => {
  const CAPTURE = "09/09/26\nshaveco x george na kaap\nmto x george na bredasdorp";

  it("K. re-parsing the restored text reproduces the loads", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: CAPTURE });

    const restored = readDraft<{ captureText: string }>(storage, KEY_A);
    expect(restored).not.toBeNull();

    const reparsed = parseQuickCapture(restored!.captureText);
    const firstPass = parseQuickCapture(CAPTURE);
    expect(reparsed.loads.map((load) => load.client)).toEqual(
      firstPass.loads.map((load) => load.client)
    );
    expect(reparsed.date).toBe(firstPass.date);
  });

  it("K. only the raw text is persisted, never the derived parse result", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: CAPTURE });
    const raw = storage.dump()[KEY_A];
    expect(raw).toContain("captureText");
    expect(raw).not.toContain("fromLocations");
    expect(raw).not.toContain("\"valid\"");
  });

  it("K. a restored draft that no longer parses degrades to parser errors", () => {
    const storage = createMemoryStorage();
    writeDraft(storage, KEY_A, { captureText: "garbled nonsense" });
    const restored = readDraft<{ captureText: string }>(storage, KEY_A);
    const reparsed = parseQuickCapture(restored!.captureText);
    expect(reparsed.loads).toEqual([]);
    expect(reparsed.errors.length).toBeGreaterThan(0);
  });
});
