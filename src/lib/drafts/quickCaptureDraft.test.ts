import { describe, it, expect, beforeEach } from "vitest";
import { buildDraftKey } from "./draftKey";
import { readDraft, writeDraft, type StorageLike } from "./draftStore";
import {
  EMPTY_QUICK_CAPTURE,
  applyTextChange,
  createBatchKey,
  fingerprintQuickCapture,
  isQuickCaptureEmpty,
  markSubmitAttempt,
  markSubmitCommitted,
  resolveSubmitOutcome,
  sanitizeQuickCaptureDraft,
  QUICK_CAPTURE_DRAFT_WORKFLOW,
  type QuickCaptureDraft,
} from "./quickCaptureDraft";

const BOARD_DATE = "2026-09-24";

const SHAVECO_KAAP = "SHAVECO X GEORGE NA KAAP";
const L23 = `23/09/26\n${SHAVECO_KAAP}\nSHAVECO X GEORGE NA STELLENBOSCH\nElite Marques X Hartenbos NA Cape Town`;
const L24 = `24/09/26\n${SHAVECO_KAAP}\nSHAVECO X GEORGE NA STELLENBOSCH\nElite Marques X Hartenbos NA Cape Town`;

const USER_A = "kg7ab12cd34";
const USER_B = "kg7zz99yy88";

const THREE_23 = ["2026-09-23", "2026-09-23", "2026-09-23"];
const THREE_24 = ["2026-09-24", "2026-09-24", "2026-09-24"];

function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function makeCounter(): () => string {
  let n = 0;
  return () => `board-fixed-${++n}`;
}

type Row = { batchKey: string; region: string; loadDate: string };

/**
 * Faithful mirror of createBulkPlanningLoads
 * (convex/planningLoads.ts:154-164 and :206): the ONLY duplicate guard is the
 * by_batchKey index narrowed to the same region. loadDate is never consulted.
 */
function simulateCreateBulk(
  batchKey: string,
  region: string,
  loadDates: string[],
  existing: Row[]
): { created: boolean; inserted: number } {
  if (existing.some((r) => r.batchKey === batchKey && r.region === region)) {
    return { created: false, inserted: 0 };
  }
  for (const loadDate of loadDates) existing.push({ batchKey, region, loadDate });
  return { created: true, inserted: loadDates.length };
}

function keyFor(userId: string, region?: string) {
  return buildDraftKey({
    workflow: QUICK_CAPTURE_DRAFT_WORKFLOW,
    userId,
    region,
  })!;
}

/** Runs the press through the same sequence the board page uses. */
function press(
  draft: QuickCaptureDraft,
  make: () => string,
  region: string,
  existing: Row[]
): { submitted: QuickCaptureDraft; next: QuickCaptureDraft; result: { created: boolean; inserted: number } } {
  const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
  const lineCount = submitted.text.split("\n").filter((l) => l.trim()).length - 1;
  const effectiveDate = fingerprintQuickCapture(submitted.text, BOARD_DATE);
  const loadDate = JSON.parse(effectiveDate).date as string;
  const result = simulateCreateBulk(
    submitted.batchKey,
    region,
    Array.from({ length: Math.max(lineCount, 1) }, () => loadDate),
    existing
  );
  if (result.created) return { submitted, next: EMPTY_QUICK_CAPTURE, result };
  return {
    submitted,
    next: resolveSubmitOutcome(submitted, submitted, make),
    result,
  };
}

describe("A — 23 Sep batch must not block 24 Sep work", () => {
  let storage: StorageLike;
  let make: () => string;
  const region = "garden_route";
  const rows: Row[] = [];

  beforeEach(() => {
    storage = createMemoryStorage();
    make = makeCounter();
    rows.length = 0;
  });

  it("a date-only correction gets a new key and the 24 Sep loads are created", () => {
    const key = keyFor(USER_A, region);

    // ── 23 Sep: submitted, the server commits, the response never arrives ──
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L23, BOARD_DATE, make);
    const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
    const key23 = submitted.batchKey;
    writeDraft(storage, key, submitted);
    expect(simulateCreateBulk(key23, region, THREE_23, rows)).toEqual({
      created: true,
      inserted: 3,
    });
    expect(rows).toHaveLength(3);

    // ── The dispatcher corrects ONLY the date ──────────────────────────────
    const reloaded = readDraft<QuickCaptureDraft>(storage, key, {
      validate: sanitizeQuickCaptureDraft,
    })!;
    expect(reloaded.submitState).toBe("unconfirmed");

    draft = applyTextChange(reloaded, L24, BOARD_DATE, make);

    // THE FIX: the 23 Sep batch is a different logical submission.
    expect(draft.batchKey).not.toBe(key23);
    expect(draft.submitState).toBe("idle");

    // ── 24 Sep is genuinely created ────────────────────────────────────────
    const sent24 = markSubmitAttempt(draft, BOARD_DATE, make);
    expect(sent24.batchKey).not.toBe(key23);
    expect(simulateCreateBulk(sent24.batchKey, region, THREE_24, rows)).toEqual({
      created: true,
      inserted: 3,
    });
    expect(rows.map((r) => r.loadDate).sort()).toEqual([
      "2026-09-23",
      "2026-09-23",
      "2026-09-23",
      "2026-09-24",
      "2026-09-24",
      "2026-09-24",
    ]);
  });

  it("the same correction works when the 23 Sep reply came back created:false", () => {
    const region2 = "garden_route";
    const existing: Row[] = [];
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L23, BOARD_DATE, make);
    const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
    existing.push({ batchKey: submitted.batchKey, region: region2, loadDate: "2026-09-23" });
    draft = resolveSubmitOutcome(submitted, submitted, make);
    expect(draft.submitState).toBe("committed");

    const corrected = applyTextChange(draft, L24, BOARD_DATE, make);
    expect(corrected.batchKey).not.toBe(submitted.batchKey);
    expect(markSubmitAttempt(corrected, BOARD_DATE, make).batchKey).not.toBe(
      submitted.batchKey
    );
  });
});

describe("B — ambiguous network failure must NOT duplicate", () => {
  let storage: StorageLike;
  let make: () => string;
  const region = "garden_route";
  const rows: Row[] = [];

  beforeEach(() => {
    storage = createMemoryStorage();
    make = makeCounter();
    rows.length = 0;
  });

  it("lost response, refresh, retry of the identical capture inserts nothing", () => {
    const key = keyFor(USER_A, region);

    const draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
    const key24 = submitted.batchKey;
    writeDraft(storage, key, submitted);

    // The backend commits. The response is lost.
    expect(simulateCreateBulk(key24, region, THREE_24, rows)).toEqual({
      created: true,
      inserted: 3,
    });

    // A refresh builds a brand new in-memory store and a brand new draft.
    const reborn = createMemoryStorage({ [key]: storage.getItem(key) as string });
    const reloaded = readDraft<QuickCaptureDraft>(reborn, key, {
      validate: sanitizeQuickCaptureDraft,
    })!;
    expect(reloaded.batchKey).toBe(key24);
    expect(reloaded.submitState).toBe("unconfirmed");

    // Retry the exact same capture.
    const retry = markSubmitAttempt(reloaded, BOARD_DATE, make);
    expect(retry.batchKey).toBe(key24);
    expect(simulateCreateBulk(retry.batchKey, region, THREE_24, rows)).toEqual({
      created: false,
      inserted: 0,
    });
    expect(rows).toHaveLength(3);
  });

  it("a cosmetic edit of an unconfirmed capture keeps the key", () => {
    const draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
    const tidied = applyTextChange(
      submitted,
      L24.replace("SHAVECO", "shaveco").replace("\nElite", "\n  Elite"),
      BOARD_DATE,
      make
    );
    expect(tidied.batchKey).toBe(submitted.batchKey);
    expect(tidied.submitState).toBe("unconfirmed");
  });

  it("re-ordering the lines of an unconfirmed capture keeps the key", () => {
    const draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
    const lines = L24.split("\n");
    const reordered = [lines[0], lines[2], lines[1], lines[3]].join("\n");
    const next = applyTextChange(submitted, reordered, BOARD_DATE, make);
    expect(next.batchKey).toBe(submitted.batchKey);
  });

  it("a board-date change with no capture date line rotates the key", () => {
    const capture = `${SHAVECO_KAAP}`;
    const draft = applyTextChange(EMPTY_QUICK_CAPTURE, capture, "2026-09-23", make);
    const submitted = markSubmitAttempt(draft, "2026-09-23", make);
    expect(submitted.fingerprint).not.toBe("");

    // The board date moves; the capture text does not change at all, so
    // applyTextChange is never called. markSubmitAttempt must still rotate,
    // because the payload builder sends the board date as loadDate.
    const next = markSubmitAttempt(submitted, "2026-09-24", make);
    expect(next.batchKey).not.toBe(submitted.batchKey);
  });

  it("dropping one of two identical lines rotates the key", () => {
    const twice = `24/09/26\n${SHAVECO_KAAP}\n${SHAVECO_KAAP}`;
    const draft = applyTextChange(EMPTY_QUICK_CAPTURE, twice, BOARD_DATE, make);
    const submitted = markSubmitAttempt(draft, BOARD_DATE, make);
    const once = applyTextChange(submitted, `24/09/26\n${SHAVECO_KAAP}`, BOARD_DATE, make);
    expect(once.batchKey).not.toBe(submitted.batchKey);
  });
});

describe("C — a date change after a confirmed batch rotates the key", () => {
  it("rotates on a committed batch", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L23, BOARD_DATE, make);
    draft = markSubmitCommitted(markSubmitAttempt(draft, BOARD_DATE, make));
    const next = applyTextChange(draft, L24, BOARD_DATE, make);
    expect(next.batchKey).not.toBe("board-fixed-1");
    expect(next.submitState).toBe("idle");
  });

  it("rotates on an unconfirmed batch", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L23, BOARD_DATE, make);
    draft = markSubmitAttempt(draft, BOARD_DATE, make);
    const next = applyTextChange(draft, L24, BOARD_DATE, make);
    expect(next.batchKey).not.toBe("board-fixed-1");
    expect(next.submitState).toBe("idle");
  });

  it("rotates for every date in a run of consecutive corrections", () => {
    const make = makeCounter();
    const capture = (day: string) =>
      `${day}\n${SHAVECO_KAAP}\nSHAVECO X GEORGE NA STELLENBOSCH\nElite Marques X Hartenbos NA Cape Town`;
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, capture("23/09/26"), BOARD_DATE, make);
    draft = markSubmitAttempt(draft, BOARD_DATE, make);
    const keys = new Set<string>([draft.batchKey]);
    for (const day of ["24/09/26", "25/09/26", "26/09/26"]) {
      draft = applyTextChange(draft, capture(day), BOARD_DATE, make);
      keys.add(draft.batchKey);
    }
    expect(keys.size).toBe(4);
  });
});

describe("D — a route change after a confirmed batch rotates the key", () => {
  it("rotates when a delivery location changes", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    draft = markSubmitCommitted(markSubmitAttempt(draft, BOARD_DATE, make));
    const next = applyTextChange(
      draft,
      L24.replace("NA KAAP", "NA PAARL"),
      BOARD_DATE,
      make
    );
    expect(next.batchKey).not.toBe("board-fixed-1");
  });

  it("rotates when a pickup location changes", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    draft = markSubmitCommitted(markSubmitAttempt(draft, BOARD_DATE, make));
    const next = applyTextChange(
      draft,
      L24.replace("X GEORGE NA KAAP", "X DURBAN NA KAAP"),
      BOARD_DATE,
      make
    );
    expect(next.batchKey).not.toBe("board-fixed-1");
  });

  it("rotates when the client changes", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    draft = markSubmitCommitted(markSubmitAttempt(draft, BOARD_DATE, make));
    const next = applyTextChange(
      draft,
      L24.replace("SHAVECO X GEORGE NA KAAP", "MTOCARGO X GEORGE NA KAAP"),
      BOARD_DATE,
      make
    );
    expect(next.batchKey).not.toBe("board-fixed-1");
  });

  it("keeps the key for a cosmetic edit of an UNCONFIRMED capture", () => {
    const make = makeCounter();
    const draft = markSubmitAttempt(
      applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make),
      BOARD_DATE,
      make
    );
    const next = applyTextChange(
      draft,
      L24.replace("SHAVECO", " shaveco  ").replace("Elite Marques X", "Elite  Marques  x"),
      BOARD_DATE,
      make
    );
    expect(next.batchKey).toBe("board-fixed-1");
    expect(next.submitState).toBe("unconfirmed");
  });

  it("keeps the key for a cosmetic edit of a CONFIRMED capture, so it stays idempotent", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    draft = markSubmitCommitted(markSubmitAttempt(draft, BOARD_DATE, make));
    const next = applyTextChange(
      draft,
      L24.replace("SHAVECO", " shaveco  ").replace("Elite Marques X", "Elite  Marques  x"),
      BOARD_DATE,
      make
    );
    expect(next.batchKey).toBe("board-fixed-1");
  });
});

describe("E and F — Clear resets the identity, the next capture is new", () => {
  it("clears an unconfirmed batch completely", () => {
    const make = makeCounter();
    const draft = markSubmitAttempt(
      applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make),
      BOARD_DATE,
      make
    );
    expect(draft.batchKey).not.toBe("");
    const cleared = applyTextChange(draft, "", BOARD_DATE, make);
    expect(cleared).toEqual(EMPTY_QUICK_CAPTURE);
    expect(cleared.batchKey).toBe("");
    expect(cleared.fingerprint).toBe("");
    expect(cleared.submitState).toBe("idle");
  });

  it("clears a committed batch completely", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    draft = markSubmitCommitted(markSubmitAttempt(draft, BOARD_DATE, make));
    expect(applyTextChange(draft, "", BOARD_DATE, make)).toEqual(EMPTY_QUICK_CAPTURE);
  });

  it("issues a new key to the next capture after a clear", () => {
    const make = makeCounter();
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const first = markSubmitAttempt(draft, BOARD_DATE, make).batchKey;
    draft = applyTextChange(draft, "", BOARD_DATE, make);
    const second = applyTextChange(draft, L24, BOARD_DATE, make).batchKey;
    expect(second).not.toBe(first);
  });

  it("identical text on the same day after a clear is still new work", () => {
    const make = makeCounter();
    const region = "garden_route";
    const rows: Row[] = [];
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const first = press(draft, make, region, rows);
    expect(first.result).toEqual({ created: true, inserted: 3 });
    expect(first.next).toEqual(EMPTY_QUICK_CAPTURE);

    draft = applyTextChange(first.next, L24, BOARD_DATE, make);
    const second = press(draft, make, region, rows);
    expect(second.submitted.batchKey).not.toBe(first.submitted.batchKey);
    expect(second.result).toEqual({ created: true, inserted: 3 });
    expect(rows).toHaveLength(6);
  });

  it("a confirmed success wipes the consumed identity even if the text is kept", () => {
    const make = makeCounter();
    const region = "garden_route";
    const rows: Row[] = [];
    const draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const outcome = press(draft, make, region, rows);
    expect(outcome.result.created).toBe(true);
    // The board calls handleClear() here, so nothing retryable survives.
    expect(outcome.next.batchKey).toBe("");
    expect(isQuickCaptureEmpty(outcome.next)).toBe(true);
  });

  it("a repeated press on an unchanged capture stays idempotent after success", () => {
    const make = makeCounter();
    const region = "garden_route";
    const rows: Row[] = [];
    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make);
    const first = press(draft, make, region, rows);
    expect(first.result).toEqual({ created: true, inserted: 3 });

    // Model a UI that keeps the source text after a confirmed success. The
    // consumed identity must not be reusable as though the work were new, so a
    // repeat press is rejected rather than inserting a second batch.
    const retained = markSubmitCommitted(first.submitted);
    const again = press(retained, make, region, rows);
    expect(again.submitted.batchKey).toBe(first.submitted.batchKey);
    expect(again.result).toEqual({ created: false, inserted: 0 });
    expect(again.next.submitState).toBe("committed");
    expect(rows).toHaveLength(3);

    // Correcting the date on that retained text is new work and must insert.
    draft = applyTextChange(retained, L23, BOARD_DATE, make);
    const corrected = press(draft, make, region, rows);
    expect(corrected.submitted.batchKey).not.toBe(first.submitted.batchKey);
    expect(corrected.result).toEqual({ created: true, inserted: 3 });
    expect(rows).toHaveLength(6);
  });
});

describe("CRITICAL INVARIANT — no content-based global deduplication", () => {
  it("the same route on three different dates yields three batches", () => {
    const make = makeCounter();
    const region = "garden_route";
    const rows: Row[] = [];
    const capture = (d: string) => `${d}\n${SHAVECO_KAAP}`;

    let draft = applyTextChange(EMPTY_QUICK_CAPTURE, capture("23/09/26"), BOARD_DATE, make);
    const a = press(draft, make, region, rows);
    draft = applyTextChange(a.next, capture("24/09/26"), BOARD_DATE, make);
    const b = press(draft, make, region, rows);
    draft = applyTextChange(b.next, capture("25/09/26"), BOARD_DATE, make);
    const c = press(draft, make, region, rows);

    expect([a, b, c].map((r) => r.result.created)).toEqual([true, true, true]);
    expect(new Set([a, b, c].map((r) => r.submitted.batchKey)).size).toBe(3);
    expect(rows).toHaveLength(3);
  });

  it("the same route twice in one capture inserts both loads", () => {
    const make = makeCounter();
    const region = "garden_route";
    const rows: Row[] = [];
    const draft = applyTextChange(
      EMPTY_QUICK_CAPTURE,
      `24/09/26\n${SHAVECO_KAAP}\n${SHAVECO_KAAP}`,
      BOARD_DATE,
      make
    );
    const outcome = press(draft, make, region, rows);
    expect(outcome.result).toEqual({ created: true, inserted: 2 });
  });

  it("a fingerprint is a payload identity, never a promise of uniqueness", () => {
    const a = fingerprintQuickCapture(`24/09/26\n${SHAVECO_KAAP}`, BOARD_DATE);
    const b = fingerprintQuickCapture(`24/09/26\n${SHAVECO_KAAP}`, BOARD_DATE);
    const otherDay = fingerprintQuickCapture(`25/09/26\n${SHAVECO_KAAP}`, BOARD_DATE);
    expect(a).toBe(b);
    expect(a).not.toBe(otherDay);
  });
});

describe("identity isolation and sanitising", () => {
  it("never leaks the batch identity between users", () => {
    const storage = createMemoryStorage();
    const make = makeCounter();
    const keyA = keyFor(USER_A, "garden_route");
    const keyB = keyFor(USER_B, "garden_route");
    const draft = markSubmitAttempt(
      applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make),
      BOARD_DATE,
      make
    );
    writeDraft(storage, keyA, draft);
    expect(readDraft(storage, keyB, { validate: sanitizeQuickCaptureDraft })).toBeNull();
    expect(keyA).not.toBe(keyB);
  });

  it("never leaks the batch identity between regions", () => {
    const storage = createMemoryStorage();
    const make = makeCounter();
    const garden = keyFor(USER_A, "garden_route");
    const eastern = keyFor(USER_A, "eastern_cape");
    const draft = markSubmitAttempt(
      applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make),
      BOARD_DATE,
      make
    );
    writeDraft(storage, garden, draft);
    expect(readDraft(storage, eastern, { validate: sanitizeQuickCaptureDraft })).toBeNull();
  });

  it("an unknown user yields no key, so nothing is ever stored", () => {
    expect(buildDraftKey({ workflow: QUICK_CAPTURE_DRAFT_WORKFLOW, userId: null })).toBeNull();
  });

  it("restores the full identity tuple across a store reinitialisation", () => {
    const storage = createMemoryStorage();
    const make = makeCounter();
    const key = keyFor(USER_A, "garden_route");
    const draft = markSubmitAttempt(
      applyTextChange(EMPTY_QUICK_CAPTURE, L24, BOARD_DATE, make),
      BOARD_DATE,
      make
    );
    writeDraft(storage, key, draft);
    const reborn = createMemoryStorage({ [key]: storage.getItem(key) as string });
    expect(
      readDraft<QuickCaptureDraft>(reborn, key, { validate: sanitizeQuickCaptureDraft })
    ).toEqual(draft);
  });

  it("adopts pre-fingerprint drafts without trusting their key", () => {
    const legacy = sanitizeQuickCaptureDraft({
      text: L24,
      batchKey: "board-legacy",
      submitState: "unconfirmed",
    })!;
    expect(legacy.fingerprint).toBe("");
    const make = makeCounter();
    // An empty fingerprint never matches a real one, so the next submit rotates.
    expect(markSubmitAttempt(legacy, BOARD_DATE, make).batchKey).toBe("board-fixed-1");
  });

  it("rejects malformed payloads", () => {
    expect(sanitizeQuickCaptureDraft({ batchKey: "k" })).toBeNull();
    expect(sanitizeQuickCaptureDraft({ text: "t" })).toBeNull();
    expect(sanitizeQuickCaptureDraft(null)).toBeNull();
    expect(sanitizeQuickCaptureDraft([L24])).toBeNull();
    expect(sanitizeQuickCaptureDraft("board-1")).toBeNull();
  });

  it("defaults an unknown submit state to idle", () => {
    expect(
      sanitizeQuickCaptureDraft({ text: "t", batchKey: "k", submitState: "weird" })?.submitState
    ).toBe("idle");
  });

  it("produces distinct keys across separate batches", () => {
    const keys = new Set(Array.from({ length: 50 }, () => createBatchKey()));
    expect(keys.size).toBe(50);
  });
});
