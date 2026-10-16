/**
 * Live aircraft position from the community ADS-B network.
 *
 * This tells us whether an aircraft is actually airborne, which is the only
 * *observed* signal available to us. It is deliberately NOT treated as flight
 * status: an aircraft that is not currently transmitting is usually out of
 * receiver coverage, not cancelled. The UI says so explicitly.
 *
 * Source: https://api.adsb.lol/ (open ADS-B aggregator, ODbL data)
 */

import { cachedFetch } from "@/lib/core/cache";
import { fetchJson } from "@/lib/core/http";
import type { DataState, LiveTrack } from "@/lib/core/types";

const BASE = "https://api.adsb.lol/v2";
/**
 * A conservative floor between upstream calls. The provider is a volunteer-
 * funded service and publishes no quota headers, so we cache aggressively and
 * de-duplicate in-flight requests rather than risk being rate limited.
 */
const TRACK_TTL_MS = 90 * 1000;

export const LIVE_TRACKING_SOURCE = {
  organization: "adsb.lol — community ADS-B network",
  url: "https://api.adsb.lol/",
} as const;

interface RawAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | string | null;
  gs?: number | null;
  track?: number | null;
  lat?: number | null;
  lon?: number | null;
  squawk?: string | null;
  emergency?: string | null;
  seen?: number | null;
  seen_pos?: number | null;
}

interface RawResponse {
  ac?: RawAircraft[] | null;
  msg?: string;
  now?: number;
  total?: number;
}

export interface LiveTrackResult {
  track?: LiveTrack;
  state: DataState;
  /** True when the network replied successfully but had no contact. */
  notObserved: boolean;
  error?: string;
}

/**
 * Looks up an aircraft by ICAO callsign. A successful response with zero
 * aircraft is a meaningful answer ("not currently observed") and is reported as
 * such rather than as an error.
 */
export async function getLiveTrack(callsignIcao: string): Promise<LiveTrackResult> {
  const callsign = callsignIcao.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2,8}$/.test(callsign)) {
    return { state: "unavailable", notObserved: false, error: "Invalid callsign." };
  }

  try {
    const outcome = await cachedFetch<RawResponse>(
      `track:${callsign}`,
      async (revalidation) =>
        fetchJson<RawResponse>(`${BASE}/callsign/${encodeURIComponent(callsign)}`, {
          timeoutMs: 8_000,
          retries: 1,
          etag: revalidation.etag,
        }),
      { ttlMs: TRACK_TTL_MS },
    );

    const aircraft = Array.isArray(outcome.value?.ac) ? outcome.value.ac : [];
    if (aircraft.length === 0) {
      return { state: outcome.freshness, notObserved: true };
    }

    // Prefer the most recently heard transmission for this callsign.
    const best = [...aircraft].sort(
      (a, b) => (a.seen_pos ?? a.seen ?? 999) - (b.seen_pos ?? b.seen ?? 999),
    )[0];

    const altitude =
      typeof best.alt_baro === "number"
        ? best.alt_baro
        : best.alt_baro === "ground"
          ? 0
          : undefined;

    return {
      state: outcome.freshness,
      notObserved: false,
      track: {
        callsign: best.flight?.trim() || callsign,
        registration: best.r?.trim() || undefined,
        aircraftType: best.t?.trim() || undefined,
        altitudeFt: altitude,
        groundSpeedKt: typeof best.gs === "number" ? best.gs : undefined,
        headingDeg: typeof best.track === "number" ? best.track : undefined,
        latitude: typeof best.lat === "number" ? best.lat : undefined,
        longitude: typeof best.lon === "number" ? best.lon : undefined,
        squawk: best.squawk ?? undefined,
        emergency:
          best.emergency && best.emergency !== "none" ? best.emergency : undefined,
        seenSeconds:
          typeof best.seen_pos === "number"
            ? best.seen_pos
            : typeof best.seen === "number"
              ? best.seen
              : undefined,
        observedAt:
          typeof outcome.value?.now === "number"
            ? new Date(outcome.value.now).toISOString()
            : outcome.storedAt,
      },
    };
  } catch (error) {
    return {
      state: "unavailable",
      notObserved: false,
      error: error instanceof Error ? error.message : "Live tracking unavailable.",
    };
  }
}
