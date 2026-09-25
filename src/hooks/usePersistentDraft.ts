"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDraftKey } from "@/src/lib/drafts/draftKey";
import {
  clearDraft,
  readDraft,
  stableStringify,
  writeDraft,
  type StorageLike,
} from "@/src/lib/drafts/draftStore";
import {
  publishDraftChange,
  subscribeDraftChanges,
} from "@/src/lib/drafts/draftChannel";

export type UsePersistentDraftOptions<T> = {
  workflow: string;
  defaultValue: T;
  userId: string | null | undefined;
  region?: string | null;
  version?: number;
  maxAgeMs?: number;
  validate?: (value: unknown) => T | null;
  enabled?: boolean;
};

export type PersistentDraft<T> = {
  value: T;
  setValue: React.Dispatch<React.SetStateAction<T>>;
  clear: () => void;
  restored: boolean;
  restoredValue: T | null;
};

export function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function usePersistentDraft<T>(
  options: UsePersistentDraftOptions<T>
): PersistentDraft<T> {
  const {
    workflow,
    defaultValue,
    userId,
    region,
    version,
    maxAgeMs,
    validate,
    enabled = true,
  } = options;

  const key = useMemo(
    () => buildDraftKey({ workflow, userId, region }),
    [workflow, userId, region]
  );

  const [initialDefault] = useState<T>(defaultValue);
  const [value, setValue] = useState<T>(initialDefault);
  const [restoredValue, setRestoredValue] = useState<T | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const hydratedKeyRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<string | null>(null);
  const defaultSerializedRef = useRef<string | null>(null);
  const valueRef = useRef<T>(initialDefault);

  useEffect(() => {
    defaultSerializedRef.current = stableStringify(initialDefault);
  }, [initialDefault]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (enabled && key && hydratedKeyRef.current === key) return;

    const stored =
      enabled && key
        ? readDraft<T>(getBrowserStorage(), key, { version, maxAgeMs, validate })
        : null;
    const targetKey = enabled && key ? key : null;

    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      hydratedKeyRef.current = targetKey;
      if (stored === null) {
        lastSyncedRef.current = null;
        setRestoredValue(null);
        setValue(initialDefault);
      } else {
        lastSyncedRef.current = stableStringify(stored);
        setRestoredValue(stored);
        setValue(stored);
      }
      setHydrated(Boolean(targetKey));
    });

    return () => {
      cancelled = true;
    };
  }, [key, enabled, initialDefault, validate, version, maxAgeMs]);

  useEffect(() => {
    if (!enabled || !key || !hydrated) return;

    const serialized = stableStringify(value);
    if (serialized === lastSyncedRef.current) return;

    if (serialized === defaultSerializedRef.current) {
      clearDraft(getBrowserStorage(), key);
      lastSyncedRef.current = null;
      publishDraftChange(key, initialDefault);
      return;
    }

    const storage = getBrowserStorage();
    if (writeDraft(storage, key, value, { version })) {
      lastSyncedRef.current = serialized;
      publishDraftChange(key, value);
    }
  }, [value, key, enabled, hydrated, version, initialDefault]);

  useEffect(() => {
    if (!enabled || !key) return;
    return subscribeDraftChanges(key, (_changedKey, changedValue) => {
      const nextSerialized = stableStringify(changedValue);
      setValue((previous) => {
        if (stableStringify(previous) === nextSerialized) return previous;
        lastSyncedRef.current = nextSerialized;
        return changedValue as T;
      });
    });
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || !key || typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;

      if (event.key === null) {
        lastSyncedRef.current = null;
        setRestoredValue(null);
        setValue(initialDefault);
        return;
      }

      const stored = readDraft<T>(getBrowserStorage(), key, {
        version,
        maxAgeMs,
        validate,
      });
      const next = stored === null ? initialDefault : stored;
      const nextSerialized = stableStringify(next);
      if (nextSerialized === stableStringify(valueRef.current)) return;
      lastSyncedRef.current = stored === null ? null : nextSerialized;
      setValue(next);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, enabled, initialDefault, validate, version, maxAgeMs]);

  const clear = useCallback(() => {
    if (!key) {
      setValue(initialDefault);
      return;
    }
    clearDraft(getBrowserStorage(), key);
    lastSyncedRef.current = null;
    setRestoredValue(null);
    setValue(initialDefault);
    publishDraftChange(key, initialDefault);
  }, [key, initialDefault]);

  return {
    value,
    setValue,
    clear,
    restored: restoredValue !== null,
    restoredValue,
  };
}
