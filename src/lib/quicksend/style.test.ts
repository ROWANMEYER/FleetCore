import { describe, expect, it } from "vitest";
import { parseQuickSendStyle, QUICK_SEND_STYLES } from "./useQuickSendStyle";

describe("saved QuickSend appearance", () => {
  it("restores all five saved device choices", () => {
    for (const style of QUICK_SEND_STYLES) expect(parseQuickSendStyle(style.id)).toBe(style.id);
  });
  it("recovers from missing, outdated or corrupted preferences", () => {
    for (const value of [null, "", "old-style", "{bad json}"]) expect(parseQuickSendStyle(value)).toBe("cards");
  });
});
