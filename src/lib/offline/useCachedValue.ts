"use client";

import { useEffect } from "react";

const CACHE_PREFIX = "fleetcore.cache.";

function readCache<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Keeps the last-resolved value of a Convex query in localStorage so the UI
 * still has real data while offline (e.g. the fleet truck/driver/trailer lists
 * that feed the Input page selects).
 *
 * - When `value` is defined it is written through to the cache.
 * - When `value` is undefined (query pending/unreachable) AND `useFallback` is
 *   set (we believe we're offline), the cached copy is returned instead. The
 *   cache is re-read on every fallback render so a value that arrived earlier
 *   in this session (and was written through) is picked up immediately.
 */
export function useCachedValue<T>(
  key: string,
  value: T | undefined,
  useFallback: boolean
): T | undefined {
  useEffect(() => {
    if (value !== undefined) writeCache(key, value);
  }, [key, value]);

  if (useFallback && value === undefined) return readCache<T>(key);
  return value;
}
