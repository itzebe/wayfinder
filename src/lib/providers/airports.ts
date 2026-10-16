/**
 * Airport reference data.
 *
 * IATA→ICAO resolution comes from the NOAA/NWS Aviation Weather Center station
 * catalogue. That catalogue is the authoritative index behind the same METAR and
 * TAF products we consume, so origin, destination and weather all resolve from a
 * single consistent source of truth.
 *
 * Source: https://aviationweather.gov/data/cache/stations.cache.json.gz
 */

import { gunzipSync } from "node:zlib";

import { cachedFetch } from "@/lib/core/cache";
import { fetchJson } from "@/lib/core/http";
import { inferTimeZone } from "@/lib/core/time";
import type { AirportRef, DataState } from "@/lib/core/types";

const STATIONS_URL = "https://aviationweather.gov/data/cache/stations.cache.json.gz";
const STATION_INFO_URL = "https://aviationweather.gov/api/data/stationinfo";
const STATIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SINGLE_STATION_TTL_MS = 24 * 60 * 60 * 1000;

interface RawStation {
  id?: string;
  icaoId?: string | null;
  iataId?: string | null;
  faaId?: string | null;
  site?: string | null;
  lat?: number | null;
  lon?: number | null;
  elev?: number | null;
  country?: string | null;
  siteType?: string[] | null;
}

interface StationIndex {
  byIata: Map<string, RawStation>;
  byIcao: Map<string, RawStation>;
  fetchedAt: string;
}

let indexPromise: Promise<StationIndex> | undefined;

async function loadStationIndex(): Promise<StationIndex> {
  const outcome = await cachedFetch<StationIndex>(
    "stations:index",
    async () => {
      const response = await fetch(STATIONS_URL, {
        headers: { Accept: "application/gzip,application/octet-stream" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Station catalogue returned HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const raw = JSON.parse(gunzipSync(buffer).toString("utf8")) as RawStation[];

      const byIata = new Map<string, RawStation>();
      const byIcao = new Map<string, RawStation>();
      for (const station of raw) {
        const icao = station.icaoId?.trim().toUpperCase();
        const iata = station.iataId?.trim().toUpperCase();
        if (icao) {
          const existing = byIcao.get(icao);
          // Prefer stations that actually publish aviation weather products.
          const isWeather = station.siteType?.some((t) =>
            ["METAR", "TAF", "SIGMET"].includes(t),
          );
          if (!existing || isWeather) byIcao.set(icao, station);
        }
        if (iata && icao) {
          const existing = byIata.get(iata);
          const isWeather = station.siteType?.some((t) =>
            ["METAR", "TAF"].includes(t),
          );
          if (!existing || isWeather) byIata.set(iata, station);
        }
      }
      return {
        data: { byIata, byIcao, fetchedAt: new Date().toISOString() },
        retrievedAt: new Date().toISOString(),
        notModified: false,
      };
    },
    { ttlMs: STATIONS_TTL_MS },
  );

  return outcome.value;
}

function getIndex(): Promise<StationIndex> {
  if (!indexPromise) {
    indexPromise = loadStationIndex().catch((error) => {
      indexPromise = undefined;
      throw error;
    });
  }
  return indexPromise;
}

function toAirportRef(station: RawStation): AirportRef {
  const countryCode = station.country?.trim().toUpperCase() || undefined;
  return {
    iata: station.iataId?.trim().toUpperCase() || undefined,
    icao: station.icaoId?.trim().toUpperCase() || undefined,
    name: station.site?.trim() || undefined,
    countryCode,
    latitude: typeof station.lat === "number" ? station.lat : undefined,
    longitude: typeof station.lon === "number" ? station.lon : undefined,
    elevationM: typeof station.elev === "number" ? station.elev : undefined,
    timeZone: inferTimeZone(countryCode),
  };
}

export interface AirportLookup {
  airport?: AirportRef;
  state: DataState;
  note?: string;
}

/**
 * Resolves an IATA or ICAO code to a full airport reference.
 *
 * Falls back to the single-station endpoint when the bulk catalogue is
 * unavailable, so a catalogue outage degrades coverage rather than breaking the
 * whole flow.
 */
export async function lookupAirport(code: string): Promise<AirportLookup> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z]{3,4}$/.test(normalised)) {
    return { state: "unavailable", note: "Airport codes are three or four letters." };
  }

  try {
    const index = await getIndex();
    const station =
      normalised.length === 4
        ? index.byIcao.get(normalised)
        : index.byIata.get(normalised);
    if (station) {
      return { airport: toAirportRef(station), state: "live" };
    }
    return {
      state: "unavailable",
      note: `No airport reference found for "${normalised}".`,
    };
  } catch {
    // Catalogue unavailable — try the single-station endpoint instead.
    try {
      const outcome = await cachedFetch<RawStation[]>(
        `station:${normalised}`,
        async () => {
          const result = await fetchJson<RawStation[]>(
            `${STATION_INFO_URL}?ids=${encodeURIComponent(normalised)}&format=json`,
            { timeoutMs: 7_000, retries: 1 },
          );
          return result;
        },
        { ttlMs: SINGLE_STATION_TTL_MS },
      );
      const station = outcome.value?.[0];
      if (station) {
        return { airport: toAirportRef(station), state: outcome.freshness };
      }
      return {
        state: "unavailable",
        note: `No airport reference found for "${normalised}".`,
      };
    } catch {
      return {
        state: "unavailable",
        note: "The airport reference catalogue could not be reached.",
      };
    }
  }
}

export async function resolveAirportCodes(
  codes: (string | undefined)[],
): Promise<Map<string, AirportRef>> {
  const resolved = new Map<string, AirportRef>();
  const unique = [...new Set(codes.filter((c): c is string => Boolean(c)))];
  await Promise.all(
    unique.map(async (code) => {
      const result = await lookupAirport(code);
      if (result.airport) resolved.set(code.trim().toUpperCase(), result.airport);
    }),
  );
  return resolved;
}
