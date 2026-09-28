"use client";

/**
 * Which fuel cards a reader has folded away.
 *
 * Per browser, not per user: a folded card is a view preference about this
 * screen, not a record about the business, so it does not belong in the
 * database and does not follow an account between machines. The reason it is
 * remembered at all is that the fuel page is long and a reader working through
 * the numbers would otherwise re-collapse the same three cards on every reload.
 *
 * The stored set is treated as untrusted input, not as our own state. It comes
 * out of localStorage, which anything on the origin can write, so a hand edited
 * or truncated value has to come back as an empty set rather than as a string
 * that is later rendered into a class name.
 */
import { useCallback, useEffect, useState } from "react";

const PREFIX = "fleetcore.fuel.collapsed-cards.";

/**
 * A ceiling on stored keys.
 *
 * The screen has around ten foldable cards and new ones get added over time.
 * The cap is not a real limit on how many a reader may fold; it is a bound on
 * what a corrupted or hostile value can make this module hold, so a paste of a
 * million strings cannot turn every card render into a memory problem.
 */
const MAX_KEYS = 64;

/** Every non-empty trimmed string in the list, de-duplicated and capped. */
export function parseCollapsed(raw: string | null): Set<string> {
  if (!raw) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A truncated or hand edited value is a lost preference, never a crash.
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const keys = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const key = entry.trim();
    if (key) keys.add(key);
    if (keys.size >= MAX_KEYS) break;
  }
  return keys;
}

export function serialiseCollapsed(keys: Iterable<string>): string {
  return JSON.stringify([...keys].slice(0, MAX_KEYS));
}

function storageKey(scope: string): string {
  return `${PREFIX}${scope}`;
}

function readCollapsed(scope: string): Set<string> {
  // Guarded rather than assumed: this page is a client component but is still
  // server rendered, and `window` does not exist during that pass. The server
  // answer of "nothing folded" is also the safe one, because the cards are not
  // rendered on the server at all.
  if (typeof window === "undefined") return new Set();
  try {
    return parseCollapsed(window.localStorage.getItem(storageKey(scope)));
  } catch {
    // Private browsing and storage-disabled profiles throw on access.
    return new Set();
  }
}

function writeCollapsed(scope: string, keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(storageKey(scope), serialiseCollapsed(keys));
  } catch {
    /* Quota or a disabled store: the fold still works, it just will not last. */
  }
}

/**
 * Folds or unfolds one card, leaving the rest alone.
 *
 * The state transition is pulled out as a pure function so it can be tested
 * without a DOM, and so the hook has no reason to do anything else inside its
 * state updater. React may call an updater more than once, or throw it away and
 * replay it, so an updater that also wrote to storage or fired an event was
 * relying on it running exactly once.
 */
export function toggleKey(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * The folded set for one screen, plus the function that changes it.
 *
 * The whole set is one piece of state rather than one hook per card: a screen
 * with ten cards would otherwise hold ten copies of the same answer and ten
 * storage listeners, and could disagree with itself for a render if one of them
 * missed a write.
 */
export function useCollapsedCards(scope: string): {
  collapsed: ReadonlySet<string>;
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
} {
  // Lazy initializer, so a reload does not paint every card open and then snap
  // them shut a frame later.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => readCollapsed(scope));

  // Persistence is an effect, never a side effect inside the updater. This also
  // normalises a junk stored value on the first pass, because whatever comes out
  // of the reader goes straight back in.
  useEffect(() => {
    writeCollapsed(scope, collapsed);
  }, [scope, collapsed]);

  useEffect(() => {
    // Cross-tab only. The browser fires this in the other tabs, not the one that
    // made the change, which is exactly the set of consumers that need telling.
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(scope)) setCollapsed(readCollapsed(scope));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  const toggle = useCallback((key: string) => {
    setCollapsed(previous => toggleKey(previous, key));
  }, []);

  return {
    collapsed,
    isCollapsed: useCallback((key: string) => collapsed.has(key), [collapsed]),
    toggle,
  };
}
