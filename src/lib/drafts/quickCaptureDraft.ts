import { parseQuickCapture } from "@/src/lib/planner/parser";
import { stableStringify } from "./draftStore";

export const QUICK_CAPTURE_DRAFT_WORKFLOW = "daily-planner:quick-capture";

export type QuickCaptureSubmitState = "idle" | "unconfirmed" | "committed";

export type QuickCaptureDraft = {
  text: string;
  batchKey: string;
  submitState: QuickCaptureSubmitState;
  fingerprint: string;
};

export const EMPTY_QUICK_CAPTURE: QuickCaptureDraft = {
  text: "",
  batchKey: "",
  submitState: "idle",
  fingerprint: "",
};

export function createBatchKey(): string {
  return `board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isQuickCaptureSubmitState(value: unknown): value is QuickCaptureSubmitState {
  return value === "idle" || value === "unconfirmed" || value === "committed";
}

export function sanitizeQuickCaptureDraft(value: unknown): QuickCaptureDraft | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.text !== "string") return null;
  if (typeof source.batchKey !== "string") return null;
  return {
    text: source.text,
    batchKey: source.batchKey,
    submitState: isQuickCaptureSubmitState(source.submitState)
      ? source.submitState
      : "idle",
    /* Drafts written before fingerprinting existed carry no fingerprint. An
       empty fingerprint never matches a real one, so the next edit or submit
       rotates the key rather than reusing an identity of unknown meaning. */
    fingerprint: typeof source.fingerprint === "string" ? source.fingerprint : "",
  };
}

export function isQuickCaptureEmpty(draft: QuickCaptureDraft): boolean {
  return draft.text.trim() === "";
}

/**
 * Identity of ONE logical submission: the effective load date plus every
 * normalised load line.
 *
 * This is not content-based deduplication. It only answers "may this attempt
 * reuse the key that was already minted?" — it never decides that a route may
 * not exist twice. The same customer and route on another planning date is a
 * different logical submission and must get its own key.
 *
 * The effective date is the capture's own date line, falling back to the board
 * date when the capture has none, because that fallback is what the payload
 * builder actually sends.
 *
 * Lines are sorted so that re-ordering the same set of loads is recognised as
 * the same logical submission. A retry that merely reorders must keep its key,
 * otherwise the retry would insert the loads a second time. Multiplicity is
 * preserved, so dropping one of two identical lines is a different submission.
 */
/**
 * Collapses case and internal whitespace so a retyped capture still resolves
 * to the same logical submission. This affects only the fingerprint — the value
 * actually sent to the server is untouched, so normalising here can never
 * change what gets stored.
 */
function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function fingerprintQuickCapture(text: string, fallbackDate: string): string {
  if (text.trim() === "") return "";
  const parsed = parseQuickCapture(text);
  const lines = parsed.loads
    .map((load) => [
      normalizeToken(load.clientInput),
      load.fromLocations.map(normalizeToken),
      load.toLocations.map(normalizeToken),
    ])
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  return stableStringify({ date: parsed.date || fallbackDate, lines });
}

/**
 * A batch owns one key from the moment its logical payload first appears until
 * a confirmed outcome or a deliberate clear resets it.
 *
 * The key is reused ONLY while retrying the same logical submission. It rotates
 * when the payload changes in any meaningful way — most importantly a change of
 * planning date — or when no key has been minted yet. An edit that leaves the
 * logical payload identical (case, whitespace, line order) keeps the key, which
 * is what makes a safe retry possible.
 *
 * A confirmed batch does NOT force a rotation on its own. After an ambiguous
 * submit that comes back as already-added, the dispatcher may well retype the
 * capture with a stray space; rotating there would let a purely cosmetic edit
 * re-insert a batch the server already holds. Only a real payload change starts
 * a new batch.
 */
export function applyTextChange(
  previous: QuickCaptureDraft,
  nextText: string,
  fallbackDate: string,
  makeBatchKey: () => string
): QuickCaptureDraft {
  if (previous.text === nextText) return previous;
  if (nextText.trim() === "") return EMPTY_QUICK_CAPTURE;

  const fingerprint = fingerprintQuickCapture(nextText, fallbackDate);
  if (previous.batchKey === "" || previous.fingerprint !== fingerprint) {
    return {
      text: nextText,
      batchKey: makeBatchKey(),
      submitState: "idle",
      fingerprint,
    };
  }
  return { ...previous, text: nextText, fingerprint };
}

/**
 * Freezes the identity immediately before the request is sent. This is the
 * authoritative rotation point: it re-derives the logical payload from the
 * draft's own text and the date in force right now, so a payload that drifted
 * for any reason — including a board-date change made while the text was
 * untouched — cannot be sent under a key that already means something else.
 */
export function markSubmitAttempt(
  draft: QuickCaptureDraft,
  fallbackDate: string,
  makeBatchKey: () => string
): QuickCaptureDraft {
  const fingerprint = fingerprintQuickCapture(draft.text, fallbackDate);
  if (fingerprint === "") return draft;
  const mustRotate = draft.batchKey === "" || draft.fingerprint !== fingerprint;
  return {
    ...draft,
    batchKey: mustRotate ? makeBatchKey() : draft.batchKey,
    submitState: "unconfirmed",
    fingerprint,
  };
}

export function markSubmitCommitted(draft: QuickCaptureDraft): QuickCaptureDraft {
  if (draft.submitState === "committed") return draft;
  return { ...draft, submitState: "committed" };
}

/**
 * Reconciles the reply with whatever the draft looks like now, which may have
 * moved on while the request was in flight.
 *
 * When the logical payload is unchanged the batch is confirmed present on the
 * server, so it is marked committed and a repeated press stays idempotent. When
 * the payload moved on, the capture the user is looking at was never submitted,
 * so it is promoted to a fresh batch — otherwise it would inherit the consumed
 * key and the backend would silently reject genuinely new work.
 */
export function resolveSubmitOutcome(
  current: QuickCaptureDraft,
  submitted: QuickCaptureDraft,
  makeBatchKey: () => string
): QuickCaptureDraft {
  if (isQuickCaptureEmpty(current)) return EMPTY_QUICK_CAPTURE;
  if (current.batchKey !== submitted.batchKey) return current;
  if (current.fingerprint === submitted.fingerprint && current.fingerprint !== "") {
    return markSubmitCommitted(current);
  }
  return {
    text: current.text,
    batchKey: makeBatchKey(),
    submitState: "idle",
    fingerprint: current.fingerprint,
  };
}
