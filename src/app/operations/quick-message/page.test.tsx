import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QUICK_SEND_STYLES, type QuickSendStyle } from "@/src/lib/quicksend/useQuickSendStyle";
import QuickMessagePage from "./page";

const view = vi.hoisted(() => ({ style: "cards" }));
vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@/src/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { _id: "test-user" } }) }));
vi.mock("@/src/components/common/Toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/src/lib/offline/useOnline", () => ({ useOnlineStatus: () => true }));
vi.mock("@/src/lib/offline/useCachedValue", () => ({ useCachedValue: (_key: string, value: unknown) => value }));
vi.mock("@/src/lib/quicksend/useQuickSendStyle", async (original) => ({
  ...await original<object>(), useQuickSendStyle: () => [view.style, vi.fn()],
}));

function render(style: QuickSendStyle) {
  view.style = style;
  return renderToStaticMarkup(<QuickMessagePage />);
}

describe("QuickSend layout switcher", () => {
  for (const style of ["cards", "dark", "compact", "message"] as const) {
    it(`${style} keeps fleet selection, both templates, preview and share actions`, () => {
      const html = render(style);
      expect(html).toContain(`data-style="${style}"`);
      for (const label of ["Select driver", "Select truck", "Select trailer", "Standard Format", "Week Format", "Message preview", "Copy message", "WhatsApp"]) expect(html).toContain(label);
      for (const option of QUICK_SEND_STYLES) expect(html).toContain(option.label);
      expect(html).not.toContain("https://wa.me/");
    });
  }
  it("keeps guided mode on one screen with readiness indicators and disabled sharing", () => {
    const html = render("guided");
    expect(html).toContain('aria-label="Message readiness"');
    expect(html).toContain('aria-label="Message preview"');
    expect(html).toContain("Copy message");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("Continue to message");
    expect(html).toContain("Add notes (optional)");
  });
  it("puts the preview before notes only in Message First", () => {
    const message = render("message");
    const cards = render("cards");
    expect(message.indexOf('aria-label="Message preview"')).toBeLessThan(message.indexOf("(optional)"));
    expect(cards.indexOf('aria-label="Message preview"')).toBeGreaterThan(cards.indexOf("(optional)"));
  });
});
