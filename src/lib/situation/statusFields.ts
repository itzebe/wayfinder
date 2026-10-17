import type { FlightIntel } from "@/lib/core/types";

/**
 * Splits the current-status fields into what a reachable source actually
 * published and what it did not.
 *
 * This exists as a pure function because it encodes a product rule rather than
 * a layout detail: a field must only be presented as known when a source
 * genuinely supplied a value. Rendering an absent value as a fact would be the
 * same dishonesty as inventing one, so the rule is unit-tested directly.
 *
 * Scheduled times, gate and terminal are always unpublished: no public source
 * we reach publishes them, and only the airline can confirm them.
 */
export interface StatusFieldSplit {
  /** Fields a reachable source published, in presentation order. */
  known: string[];
  /** Fields no reachable source published, in presentation order. */
  unpublished: string[];
}

/** Field identifiers, mapped to localised labels by the caller. */
export const KNOWN_STATUS_FIELDS = ["flightNumber", "callsign", "airline", "origin", "destination"] as const;

export const UNPUBLISHED_STATUS_FIELDS = [
  "scheduledDeparture",
  "scheduledArrival",
  "gate",
  "terminal",
] as const;

export function splitStatusFields(intel: FlightIntel): StatusFieldSplit {
  const known: string[] = ["flightNumber"];
  const unpublished: string[] = [];

  (intel.callsignIcao ? known : unpublished).push("callsign");
  (intel.airline ? known : unpublished).push("airline");
  (intel.origin ? known : unpublished).push("origin");
  (intel.destination ? known : unpublished).push("destination");

  unpublished.push(...UNPUBLISHED_STATUS_FIELDS);

  return { known, unpublished };
}
