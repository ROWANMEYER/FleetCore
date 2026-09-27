import { afterEach, describe, expect, it, vi } from "vitest";
import { newRequestKey } from "./requestKey";
const serverKeyPattern = /^[a-zA-Z0-9-]{16,80}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newRequestKey", () => {
  it("satisfies the server requestKey contract in a secure context", () => {
    const keys = Array.from({ length: 50 }, () => newRequestKey());
    expect(keys.every(key => serverKeyPattern.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(50);
  });

  it("falls back when crypto.randomUUID is missing on an insecure origin", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    const key = newRequestKey();
    expect(key).toBe("07".repeat(16));
    expect(serverKeyPattern.test(key)).toBe(true);
  });

  it("falls back when randomUUID throws and when crypto is missing entirely", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(3),
      randomUUID: () => { throw new Error("blocked"); },
    });
    expect(newRequestKey()).toBe("03".repeat(16));
    vi.stubGlobal("crypto", undefined);
    const key = newRequestKey();
    expect(key).toMatch(serverKeyPattern);
    expect(new Set([key, newRequestKey()]).size).toBe(2);
  });

  it("rejects a randomUUID result that breaks the contract", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
      randomUUID: () => "short",
    });
    expect(newRequestKey()).toBe("01".repeat(16));
  });
});
