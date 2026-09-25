/* Pure payload builder for the board "Add N Loads" flow (Stage 6.4A fix).

   The client field MUST come from the CURRENT client resolution at click
   time, never from the parse-time token. When a Quick Capture line was
   captured as an UNKNOWN client and then resolved (e.g. the dispatcher added
   the customer via the 6.4A Add Client dialog), `load.client` still holds the
   raw as-typed token frozen at parse time. Using it would store
   "test timber 999" instead of the canonical "Test Timber 999".

   Rule: if the current resolution for the load's token is "matched", use the
   canonical resolved customer name; otherwise fall back to the raw token. */

import type { ParseResult } from "./parser";

export type ClientResolutionLite = {
  clientInput: string;
  resolved?: string;
  status: string;
};

export function buildAddLoadsPayload(
  parsed: ParseResult,
  clientResolutions: ClientResolutionLite[],
  boardDate: string
): {
  loadDate: string;
  client: string;
  fromLocations: string[];
  toLocations: string[];
}[] {
  const resolutionByInput = new Map(
    clientResolutions.map((r) => [r.clientInput.toLowerCase(), r])
  );

  return parsed.loads.map((load) => {
    const res = resolutionByInput.get(load.clientInput.toLowerCase());
    const client =
      res?.status === "matched" && res.resolved?.trim()
        ? res.resolved.trim()
        : load.clientInput;

    return {
      loadDate: parsed.date || boardDate,
      client,
      fromLocations: load.fromLocations,
      toLocations: load.toLocations,
    };
  });
}