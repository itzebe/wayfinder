/**
 * Aviation weather from the NOAA / National Weather Service Aviation Weather
 * Center. These are official, freely published aviation products:
 *   METAR — current observed conditions
 *   TAF   — aerodrome forecast
 *
 * Public API, no key required.
 *   https://aviationweather.gov/api/data/metar
 *   https://aviationweather.gov/api/data/taf
 */

import { cachedFetch } from "@/lib/core/cache";
import { fetchJson } from "@/lib/core/http";
import { unixSecondsToIso } from "@/lib/core/time";
import type { DataState, WeatherForecast, WeatherObservation } from "@/lib/core/types";

const BASE = "https://aviationweather.gov/api/data";
const METAR_TTL_MS = 10 * 60 * 1000;
const TAF_TTL_MS = 30 * 60 * 1000;

export const AVIATION_WEATHER_SOURCE = {
  organization: "NOAA / National Weather Service — Aviation Weather Center",
  url: "https://aviationweather.gov/",
} as const;

interface RawMetar {
  icaoId?: string;
  name?: string;
  reportTime?: string;
  receiptTime?: string;
  obsTime?: number;
  temp?: number | null;
  dewp?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  altim?: number | null;
  fltCat?: string | null;
  cover?: string | null;
  rawOb?: string | null;
}

interface RawTafCloud {
  cover?: string | null;
  base?: number | null;
}

interface RawTafPeriod {
  timeFrom?: number;
  timeTo?: number;
  fcstChange?: string | null;
  probability?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  wxString?: string | null;
  clouds?: RawTafCloud[] | null;
}

interface RawTaf {
  icaoId?: string;
  name?: string;
  issueTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  rawTAF?: string | null;
  fcsts?: RawTafPeriod[] | null;
}

function normaliseVisibility(value: number | string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  return Number.isFinite(value) ? `${value} SM` : undefined;
}

function normaliseWindDirection(value: number | string | null | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toObservation(raw: RawMetar): WeatherObservation {
  return {
    icao: (raw.icaoId ?? "").toUpperCase(),
    stationName: raw.name ?? undefined,
    observedAt: unixSecondsToIso(raw.obsTime),
    reportedAt: raw.reportTime ?? undefined,
    flightCategory: raw.fltCat?.toUpperCase() || undefined,
    windDirectionDeg: normaliseWindDirection(raw.wdir),
    windSpeedKt: typeof raw.wspd === "number" ? raw.wspd : undefined,
    visibility: normaliseVisibility(raw.visib),
    temperatureC: typeof raw.temp === "number" ? raw.temp : undefined,
    dewpointC: typeof raw.dewp === "number" ? raw.dewp : undefined,
    altimeterHpa: typeof raw.altim === "number" ? raw.altim : undefined,
    cloudCover: raw.cover ?? undefined,
    raw: raw.rawOb?.trim() || undefined,
  };
}

function toForecast(raw: RawTaf): WeatherForecast {
  const periods = (raw.fcsts ?? [])
    .map((period) => ({
      from: unixSecondsToIso(period.timeFrom) ?? "",
      to: unixSecondsToIso(period.timeTo) ?? "",
      changeType: period.fcstChange ?? undefined,
      probability: typeof period.probability === "number" ? period.probability : undefined,
      windDirectionDeg: normaliseWindDirection(period.wdir),
      windSpeedKt: typeof period.wspd === "number" ? period.wspd : undefined,
      windGustKt: typeof period.wgst === "number" ? period.wgst : undefined,
      visibility: normaliseVisibility(period.visib),
      cloudLayers: (period.clouds ?? [])
        .filter((cloud) => cloud.cover)
        .map(
          (cloud) =>
            `${cloud.cover}${
              typeof cloud.base === "number" ? String(cloud.base).padStart(3, "0") : ""
            }`,
        ),
      weather: period.wxString ? period.wxString.split(/\s+/).filter(Boolean) : [],
    }))
    .filter((period) => period.from && period.to);

  return {
    icao: (raw.icaoId ?? "").toUpperCase(),
    stationName: raw.name ?? undefined,
    issuedAt: raw.issueTime ?? undefined,
    validFrom: unixSecondsToIso(raw.validTimeFrom),
    validTo: unixSecondsToIso(raw.validTimeTo),
    raw: raw.rawTAF?.trim() || undefined,
    periods,
  };
}

export interface WeatherResult {
  observation?: WeatherObservation;
  state: DataState;
  error?: string;
}

/** Latest METAR observation for one ICAO station. */
export async function getMetar(icao: string): Promise<WeatherResult> {
  const code = icao.trim().toUpperCase();
  try {
    const outcome = await cachedFetch<RawMetar[]>(
      `metar:${code}`,
      async (revalidation) => {
        return fetchJson<RawMetar[]>(
          `${BASE}/metar?ids=${encodeURIComponent(code)}&format=json`,
          { timeoutMs: 8_000, retries: 2, etag: revalidation.etag },
        );
      },
      { ttlMs: METAR_TTL_MS },
    );
    const raw = Array.isArray(outcome.value) ? outcome.value[0] : undefined;
    if (!raw) {
      return { state: "unavailable", error: `No weather observation published for ${code}.` };
    }
    return { observation: toObservation(raw), state: outcome.freshness };
  } catch (error) {
    return {
      state: "unavailable",
      error: error instanceof Error ? error.message : "Weather lookup failed.",
    };
  }
}

export interface ForecastResult {
  forecast?: WeatherForecast;
  state: DataState;
  error?: string;
}

/** Latest TAF aerodrome forecast for one ICAO station. */
export async function getTaf(icao: string): Promise<ForecastResult> {
  const code = icao.trim().toUpperCase();
  try {
    const outcome = await cachedFetch<RawTaf[]>(
      `taf:${code}`,
      async (revalidation) => {
        return fetchJson<RawTaf[]>(
          `${BASE}/taf?ids=${encodeURIComponent(code)}&format=json`,
          { timeoutMs: 8_000, retries: 2, etag: revalidation.etag },
        );
      },
      { ttlMs: TAF_TTL_MS },
    );
    const raw = Array.isArray(outcome.value) ? outcome.value[0] : undefined;
    if (!raw) {
      return { state: "unavailable", error: `No forecast published for ${code}.` };
    }
    return { forecast: toForecast(raw), state: outcome.freshness };
  } catch (error) {
    return {
      state: "unavailable",
      error: error instanceof Error ? error.message : "Forecast lookup failed.",
    };
  }
}
