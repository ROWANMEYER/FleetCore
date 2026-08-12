"use client";

import { useEffect, useRef, useState } from "react";

interface CommitDateInputProps {
  /** The committed date (YYYY-MM-DD) that drives the parent's query/filter. */
  value: string;
  /** Called ONLY when the user actually commits a selection. */
  onChange: (v: string) => void;
  name?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Native `<input type="date">` that only reports a value once the user truly
 * selects one.
 *
 * Browsers fire intermediate `input` events while the user browses months in
 * the native calendar popup (a well-known Chromium quirk) — the sheets screen
 * used to bind `onChange` straight to state, so every month-arrow click
 * re-ran the query and the table re-filtered mid-browse. This component keeps
 * a local draft for display and commits to the parent ONLY from the browser's
 * native `change` event, which fires when a day is actually picked in the
 * calendar (or a typed value is committed). Browsing months without choosing
 * leaves the query untouched, and the draft reverts on blur so the field never
 * shows a date the user didn't select.
 */
export default function CommitDateInput({
  value,
  onChange,
  name,
  className,
  ariaLabel,
}: CommitDateInputProps) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef(false);

  // Sync the draft when the committed value changes externally (reset, clear,
  // another control). React's documented "adjust state during render"
  // pattern — no effect needed, so no cascading renders.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = (v: string) => {
    if (v === lastValue) return;
    setLastValue(v);
    onChange(v);
  };

  // The browser's native `change` event fires only on a real picker commit —
  // this is the "user actually chose" signal (React's onChange is the `input`
  // event, which also fires while browsing months, so it can't be used).
  // Rebound every render so the handler always sees the fresh `commit`.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onNativeChange = () => {
      pickedRef.current = true;
      commit(el.value);
    };
    el.addEventListener("change", onNativeChange);
    return () => el.removeEventListener("change", onNativeChange);
  });

  return (
    <input
      ref={inputRef}
      type="date"
      name={name}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        // No real pick happened — drop any stray draft (e.g. a highlighted
        // date left over from browsing the calendar) and restore the last
        // committed value.
        if (!pickedRef.current) setDraft(lastValue);
        pickedRef.current = false;
      }}
      className={className}
    />
  );
}
