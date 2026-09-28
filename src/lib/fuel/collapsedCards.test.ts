import { describe, expect, it } from "vitest";
import { parseCollapsed, serialiseCollapsed, toggleKey } from "./collapsedCards";

describe("toggleKey", () => {
  it("folds a card that was open", () => {
    const next = toggleKey(new Set(), "summary:price");
    expect(next.has("summary:price")).toBe(true);
  });

  it("unfolds a card that was folded", () => {
    const folded = toggleKey(new Set(), "summary:price");
    expect(toggleKey(folded, "summary:price").has("summary:price")).toBe(false);
  });

  it("returns a new set, so React sees the state change rather than the same object", () => {
    const before = new Set<string>();
    const after = toggleKey(before, "history");
    expect(after).not.toBe(before);
    // The one it was given is left alone, which is what a state updater requires.
    expect(before.size).toBe(0);
  });

  it("leaves every other card exactly as it was", () => {
    const before = new Set(["summary:price", "trend"]);
    const after = toggleKey(before, "compare:to");
    expect([...after].sort()).toEqual(["compare:to", "summary:price", "trend"]);
  });

  it("takes a read-only set, because the hook holds one", () => {
    const before: ReadonlySet<string> = new Set(["trend"]);
    expect([...toggleKey(before, "history")].sort()).toEqual(["history", "trend"]);
  });

  it("survives being applied twice, because an updater may be replayed", () => {
    // React is allowed to call an updater more than once. Toggling has to be
    // driven by the value handed in, not by anything remembered between calls,
    // or a replay would fold a second card by accident.
    const start = new Set<string>();
    const once = toggleKey(start, "summary:price");
    // Replaying the same updater against the same input gives the same answer.
    expect(toggleKey(start, "summary:price")).toEqual(once);
  });
});

describe("parseCollapsed", () => {
  it("reads back what serialiseCollapsed wrote", () => {
    const keys = new Set(["summary:price", "history", "compare:from"]);
    expect([...parseCollapsed(serialiseCollapsed(keys))]).toEqual([...keys]);
  });

  it("starts from nothing when there is no stored value", () => {
    expect(parseCollapsed(null).size).toBe(0);
    expect(parseCollapsed("").size).toBe(0);
  });

  it("survives a value that is not JSON at all", () => {
    expect(parseCollapsed("not json").size).toBe(0);
    expect(parseCollapsed("{oops").size).toBe(0);
    // A truncated write, which is what a killed tab mid-setItem looks like.
    expect(parseCollapsed('["summary:price"').size).toBe(0);
  });

  it("survives JSON that is not a list of names", () => {
    expect(parseCollapsed("null").size).toBe(0);
    expect(parseCollapsed("42").size).toBe(0);
    expect(parseCollapsed('"summary:price"').size).toBe(0);
    expect(parseCollapsed('{"summary:price":true}').size).toBe(0);
  });

  it("drops entries that are not strings rather than trusting them", () => {
    const keys = parseCollapsed('[1, null, "history", {}, ["nested"], "compare:from"]');
    expect([...keys]).toEqual(["history", "compare:from"]);
  });

  it("trims and de-duplicates, so a hand edited value cannot double up", () => {
    const keys = parseCollapsed('["history", "  history  ", "history", ""]');
    expect([...keys]).toEqual(["history"]);
  });

  it("bounds how much a hostile value can hold", () => {
    const huge = JSON.stringify(Array.from({ length: 5000 }, (_, index) => `card:${index}`));
    expect(parseCollapsed(huge).size).toBeLessThanOrEqual(64);
  });
});

describe("serialiseCollapsed", () => {
  it("writes a round-trippable list", () => {
    expect(JSON.parse(serialiseCollapsed(new Set(["a", "b"])))).toEqual(["a", "b"]);
  });

  it("writes an empty list rather than nothing, so a key is always present to clear", () => {
    expect(serialiseCollapsed(new Set())).toBe("[]");
    expect(parseCollapsed(serialiseCollapsed(new Set())).size).toBe(0);
  });

  it("applies the same ceiling on the way out as on the way in", () => {
    const huge = new Set(Array.from({ length: 5000 }, (_, index) => `card:${index}`));
    expect(parseCollapsed(serialiseCollapsed(huge)).size).toBeLessThanOrEqual(64);
  });
});
