/**
 * Capture-phase Escape handling for the invoice delivery modal.
 *
 * The route detail panel registers its own bubble-phase Escape handler
 * (useEscapeToClose). By registering here in the CAPTURE phase and calling
 * stopImmediatePropagation() before that bubble handler can run, a single
 * Escape closes this modal first — a second Escape then closes the route
 * panel underneath.
 *
 * Extracted from InvoiceDeliveryPanel so the behavior can be unit-tested
 * without a DOM.
 */

export interface CaptureEscapeTarget {
  addEventListener(
    type: string,
    listener: (event: KeyboardEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: (event: KeyboardEvent) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

/** Builds the keydown handler: closes on Escape and swallows the event so
 *  bubble-phase listeners (e.g. the route panel's own Escape handler) don't run. */
export function createEscapeCaptureHandler(onClose: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      onClose();
    }
  };
}

/** Registers the Escape handler on `target` (document in the app) in the
 *  capture phase and returns a cleanup function that removes it. */
export function registerCaptureEscape(
  target: CaptureEscapeTarget,
  onClose: () => void
): () => void {
  const handler = createEscapeCaptureHandler(onClose);
  target.addEventListener("keydown", handler, true);
  return () => target.removeEventListener("keydown", handler, true);
}
