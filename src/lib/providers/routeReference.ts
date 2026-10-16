/**
 * Route and airline reference lookup.
 *
 * Given an IATA flight number we need the operating airline, the ICAO callsign
 * used by tracking networks, and the scheduled origin/destination. This is
 * reference data (a route table), not live status, and the UI labels it as such.
 *
 * Source: https://api.adsbdb.com/ (community aircraft/route database)
 */

import { cachedFetch } from "@/lib/core/cache";
import { fetchJson } from "@/lib/core/http";
import { inferTimeZone } from "@/lib/core/time";
import type { AirlineRef, AirportRef, Confidence, DataState } from "@/lib/core/types";

const BASE = "https://api.adsbdb.com/v0";
const ROUTE_TTL_MS = 24 * 60 * 60 * 1000;
const AIRLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ROUTE_SOURCE = {
  organization: "adsbdb (community aircraft and route database)",
  url: "https://www.adsbdb.com/",
} as const;

interface RawAirport {
  iata_code?: string | null;
  icao_code?: string | null;
  name?: string | null;
  municipality?: string | null;
  country_name?: string | null;
  country_iso_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation?: number | null;
}

interface RawRoute {
  callsign?: string;
  callsign_icao?: string;
  callsign_iata?: string;
  airline?: {
    name?: string;
    iata?: string | null;
    icao?: string | null;
    country?: string | null;
  } | null;
  origin?: RawAirport | null;
  destination?: RawAirport | null;
}

interface RawCallsignResponse {
  response?:
    | { flightroute?: RawRoute | null }
    | string;
}

interface RawAirlineResponse {
  response?:
    | Array<{ name?: string; iata?: string | null; icao?: string | null; country?: string | null }>
    | string;
}

function toAirportRef(raw: RawAirport | null | undefined): AirportRef | undefined {
  if (!raw) return undefined;
  const countryCode = raw.country_iso_name?.toUpperCase() || undefined;
  return {
    iata: raw.iata_code?.toUpperCase() || undefined,
    icao: raw.icao_code?.toUpperCase() || undefined,
    name: raw.name ?? undefined,
    municipality: raw.municipality ?? undefined,
    countryCode,
    countryName: raw.country_name ?? undefined,
    latitude: typeof raw.latitude === "number" ? raw.latitude : undefined,
    longitude: typeof raw.longitude === "number" ? raw.longitude : undefined,
    elevationM: typeof raw.elevation === "number" ? raw.elevation : undefined,
    timeZone: inferTimeZone(countryCode),
  };
}

export interface RouteLookup {
  airline?: AirlineRef;
  origin?: AirportRef;
  destination?: AirportRef;
  callsignIcao?: string;
  callsignIata?: string;
  /** "reference" means route table only — no live status was retrieved. */
  state: DataState;
  confidence: Confidence;
  error?: string;
}

/** Splits a flight designator into its airline prefix and numeric part. */
export function splitFlightNumber(input: string): { airlineCode: string; number: string } | null {
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  const match = cleaned.match(/^([A-Z]{2,3})(\d{1,4})([A-Z]?)$/);
  if (!match) return null;
  return { airlineCode: match[1], number: `${match[2]}${match[3]}` };
}

/**
 * Resolves an airline IATA/ICAO prefix to its operating identity.
 * Returns the first candidate, which for IATA prefixes is the principal carrier.
 */
export async function lookupAirline(code: string): Promise<AirlineRef | undefined> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,3}$/.test(normalised)) return undefined;
  try {
    const outcome = await cachedFetch<RawAirlineResponse>(
      `airline:${normalised}`,
      async (revalidation) =>
        fetchJson<RawAirlineResponse>(`${BASE}/airline/${normalised}`, {
          timeoutMs: 7_000,
          retries: 1,
          etag: revalidation.etag,
        }),
      { ttlMs: AIRLINE_TTL_MS },
    );
    const list = Array.isArray(outcome.value?.response) ? outcome.value.response : [];
    const first = list.find((entry) => entry?.name);
    if (!first) return undefined;
    return {
      name: first.name as string,
      iata: first.iata?.toUpperCase() || undefined,
      icao: first.icao?.toUpperCase() || undefined,
      country: first.country ?? undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Resolves a route from an IATA flight number.
 *
 * Two attempts are made: once with the airline's ICAO callsign prefix (the form
 * tracking networks publish) and once with the IATA designator. Only a route
 * whose own airline matches the requested prefix is accepted, which prevents
 * prefix collisions from returning a different carrier's flight.
 */
export async function lookupRoute(flightNumber: string): Promise<RouteLookup> {
  const split = splitFlightNumber(flightNumber);
  if (!split) {
    return {
      state: "unavailable",
      confidence: "unknown",
      error: "That flight number format is not recognised.",
    };
  }

  const airline = await lookupAirline(split.airlineCode);
  const candidates: string[] = [];
  if (airline?.icao) candidates.push(`${airline.icao}${split.number}`);
  candidates.push(`${split.airlineCode}${split.number}`);

  let lastError: string | undefined;

  for (const candidate of candidates) {
    try {
      const outcome = await cachedFetch<RawCallsignResponse>(
        `route:${candidate}`,
        async (revalidation) =>
          fetchJson<RawCallsignResponse>(`${BASE}/callsign/${candidate}`, {
            timeoutMs: 7_000,
            retries: 1,
            etag: revalidation.etag,
          }),
        { ttlMs: ROUTE_TTL_MS },
      );

      const payload = outcome.value?.response;
      if (!payload || typeof payload === "string") {
        lastError = "No route is published for this flight number.";
        continue;
      }
      const route = payload.flightroute;
      if (!route) {
        lastError = "No route is published for this flight number.";
        continue;
      }

      const routeAirline: AirlineRef | undefined = route.airline?.name
        ? {
            name: route.airline.name,
            iata: route.airline.iata?.toUpperCase() || undefined,
            icao: route.airline.icao?.toUpperCase() || undefined,
            country: route.airline.country ?? undefined,
          }
        : airline;

      // Reject a route belonging to a different carrier with a colliding prefix.
      const prefixMatches =
        routeAirline?.icao?.toUpperCase() === split.airlineCode ||
        routeAirline?.iata?.toUpperCase() === split.airlineCode ||
        airline?.icao?.toUpperCase() === split.airlineCode;
      if (airline && routeAirline && !prefixMatches) {
        lastError = "The published route did not match this airline prefix.";
        continue;
      }

      return {
        airline: routeAirline,
        origin: toAirportRef(route.origin),
        destination: toAirportRef(route.destination),
        callsignIcao: route.callsign_icao?.toUpperCase() || undefined,
        callsignIata: route.callsign_iata?.toUpperCase() || undefined,
        state: outcome.freshness,
        confidence: outcome.freshness === "live" ? "verified" : "corroborated",
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Route lookup failed.";
    }
  }

  return {
    airline,
    state: "unavailable",
    confidence: "unknown",
    error: lastError ?? "No route is published for this flight number.",
  };
}
