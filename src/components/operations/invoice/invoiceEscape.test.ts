import { describe, expect, it, vi } from "vitest";
import {
  createEscapeCaptureHandler,
  registerCaptureEscape,
  type CaptureEscapeTarget,
} from "./invoiceEscape";

describe("createEscapeCaptureHandler", () => {
  it("closes the modal and stops propagation when Escape is pressed", () => {
    const onClose = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const handler = createEscapeCaptureHandler(onClose);

    handler({ key: "Escape", stopImmediatePropagation } as unknown as KeyboardEvent);

    expect(onClose).toHaveBeenCalledTimes(1);
    // Swallowing the event is what stops the route panel's own bubble-phase
    // Escape handler from also firing on the same keypress.
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
  });

  it("does nothing for any other key", () => {
    const onClose = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const handler = createEscapeCaptureHandler(onClose);

    for (const key of ["Enter", " ", "ArrowDown", "a", "F5"]) {
      handler({ key, stopImmediatePropagation } as unknown as KeyboardEvent);
    }

    expect(onClose).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });
});

describe("registerCaptureEscape", () => {
  it("registers a keydown listener in the capture phase and cleans up with the same handler", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const target = { addEventListener, removeEventListener } as unknown as CaptureEscapeTarget;
    const onClose = vi.fn();

    const cleanup = registerCaptureEscape(target, onClose);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    const [type, listener, capture] = addEventListener.mock.calls[0];
    expect(type).toBe("keydown");
    // Capture phase — fires before the route panel's bubble-phase Escape
    // handler, so one Escape closes only this modal.
    expect(capture).toBe(true);

    // The registered listener actually closes the modal on Escape.
    (listener as (e: KeyboardEvent) => void)({
      key: "Escape",
      stopImmediatePropagation: vi.fn(),
    } as unknown as KeyboardEvent);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Cleanup removes the exact same listener with the same capture flag.
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", listener, true);
  });

  it("does not touch onClose when a non-Escape key is dispatched", () => {
    const addEventListener = vi.fn();
    const target = { addEventListener, removeEventListener: vi.fn() } as unknown as CaptureEscapeTarget;
    const onClose = vi.fn();

    registerCaptureEscape(target, onClose);
    const [, listener] = addEventListener.mock.calls[0];

    (listener as (e: KeyboardEvent) => void)({
      key: "Tab",
      stopImmediatePropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    expect(onClose).not.toHaveBeenCalled();
  });
});
