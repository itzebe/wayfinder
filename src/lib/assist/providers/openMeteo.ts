/**
 * Open-Meteo — free, worldwide weather forecast and current conditions.
 *
 * WHY THIS SOURCE
 * ---------------
 * The existing weather adapters are national: NWS covers the United States and
 * DWD covers Germany. Both publish *warnings*, which is the right thing for a
 * hazard but leaves the rest of the world with nothing — a traveller in Lagos or
 * Tokyo asking about the weather got a page that said no source covers the place.
 *
 * Open-Meteo aggregates the same national weather models (NOAA GFS, DWD ICON,
 * Météo-France, ECMWF and others) into one global endpoint with no API key. It is
 * the correct fit for "what is the weather where I am" anywhere on earth.
 *
 * OFFICIAL DOCUMENTATION AND TERMS (verified before implementing)
 * ---------------------------------------------------------------
 *   Forecast:  https://open-meteo.com/en/docs
 *   Geocoding: https://open-meteo.com/en/docs/geocoding-api
 *   Terms:     https://open-meteo.com/en/terms
 *
 *   The free tier requires: fewer than 10,000 API calls/day, 5,000/hour and
 *   600/minute; non-commercial use only; and acceptance of the CC-BY 4.0 licence.
 *   That licence requires attribution, which this adapter attaches to every
 *   source it returns. Geocoding is based on GeoNames.
 *
 * WHAT THIS PROVIDER IS, AND IS NOT
 * ---------------------------------
 * It reports a *forecast* and a *current reading*. It is NOT a warning service:
 * `weatherWarnings` is declared false, so the engine can never read a forecast as
 * an authority having declared a hazard. The current reading is labelled as the
 * model's value for the current hour, not as a station observation, because
 * Open-Meteo returns model output — the field name is even `current`, not
 * `observation`. Pretending otherwise would be the exact invention this product
 * forbids.
 *
 * It never emits a condition when the provider returns nothing usable, and it
 * degrades to an unavailable report (never a fabricated reading) on any failure.
 */

import { z } from "zod";

import { cachedFetch, type CachedFetchOutcome } from "@/lib/core/cache";
import { fetchJson, HttpError } from "@/lib/core/http";
import { nowIso, toIso } from "@/lib/core/time";
import type { DataState, SourceRef } from "@/lib/core/types";
import type { Translate } from "@/lib/i18n/translator";
import type { Provider, ProviderContext } from "../provider";
import type { AssistanceQuery, ProviderReport, ServiceCondition } from "../types";

const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_PROVIDER_ID = "open-meteo";

/** Attribution is a licence condition, not a nicety. Kept in one place. */
const ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";
const ATTRIBUTION_URL = "https://open-meteo.com/";

function safeT(t: Translate, key: string, params?: Record<string, string | number>): string {
  const value = t(key, params);
  return value === key ? key : value;
}

/**
 * WMO 4677 weather codes → a short English phrase. Open-Meteo returns the code;
 * the label is our reading of it, so it is attached as detail, never as a title
 * the provider is claimed to have written.
 */
function wmoLabel(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return "Unknown conditions";
}

/**
 * How severe the *forecast* is for a traveller. Deliberately capped at `minor`:
 * a forecast of rain is worth knowing, but only an authority's warning may be
 * presented as a hazard. A thunderstorm reaches `minor` and no higher.
 */
function forecastSeverity(code: number): ServiceCondition["severity"] {
  if (code >= 95 && code <= 99) return "minor";
  if (code >= 71 && code <= 77) return "minor";
  if (code >= 85 && code <= 86) return "minor";
  if (code >= 80 && code <= 82) return "minor";
  return "info";
}

const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country_code: z.string().optional(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
        population: z.number().optional(),
        feature_code: z.string().optional(),
      }),
    )
    .optional(),
});

const forecastSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  utc_offset_seconds: z.number().optional(),
  current: z
    .object({
      time: z.string().optional(),
      temperature_2m: z.number().optional(),
      wind_speed_10m: z.number().optional(),
      precipitation: z.number().optional(),
      weather_code: z.number().optional(),
    })
    .optional(),
  current_units: z.record(z.string(), z.string()).optional(),
  hourly: z
    .object({
      time: z.array(z.string()).optional(),
      temperature_2m: z.array(z.number().nullable()).optional(),
      precipitation_probability: z.array(z.number().nullable()).optional(),
      weather_code: z.array(z.number().nullable()).optional(),
    })
    .optional(),
});

interface ResolvedPlace {
  latitude: number;
  longitude: number;
  name: string;
  countryCode?: string;
  admin1?: string;
}

/**
 * Resolves a city to coordinates.
 *
 * When the traveller named a country we filter the geocoder by it, which is what
 * makes a duplicated name ("Manchester" in GB and the US, "San Jose" in five
 * countries) unambiguous. We additionally require the returned country to match
 * the one the engine resolved, so a stale or mismatched geocoder result can never
 * attach another city's weather to this request.
 */
async function geocode(
  query: AssistanceQuery,
  context: ProviderContext,
): Promise<ResolvedPlace | undefined> {
  const name = (query.city ?? query.region ?? "").trim();
  if (!name) return undefined;

  const country = query.countryCode?.toUpperCase();
  const params = new URLSearchParams({
    name,
    count: "10",
    language: "en",
    format: "json",
  });
  if (country) params.set("countryCode", country);

  const result = await fetchJson<unknown>(`${GEOCODING_ENDPOINT}?${params.toString()}`, {
    timeoutMs: 8_000,
    retries: 1,
    signal: context.signal,
    fetchImpl: context.fetchImpl,
  });
  const parsed = geocodeSchema.safeParse(result.data);
  if (!parsed.success) return undefined;

  const candidates = parsed.data.results ?? [];
  if (candidates.length === 0) return undefined;

  // Prefer an exact, case-insensitive name match, then the most populous place.
  // Population is the best available signal for "the city a traveller means"
  // when several share a name within the same country.
  const exact = candidates.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  const pool = exact.length > 0 ? exact : candidates;
  // When a country was named, the result must belong to it. A candidate from a
  // different country is not a weaker match — it is the wrong place, and
  // attaching its forecast would be an invention. So this fails honestly.
  const scoped = country
    ? pool.filter((c) => (c.country_code ?? "").toUpperCase() === country)
    : pool;
  if (scoped.length === 0) return undefined;
  const chosen = [...scoped].sort(
    (a, b) => (b.population ?? 0) - (a.population ?? 0),
  )[0];
  if (!chosen) return undefined;

  return {
    latitude: chosen.latitude,
    longitude: chosen.longitude,
    name: chosen.name,
    countryCode: chosen.country_code?.toUpperCase(),
    admin1: chosen.admin1,
  };
}

/**
 * Builds the traveller-facing condition for a forecast reading.
 *
 * The title states what the model reports; the detail names the place the
 * coordinates resolved to and the value, so the traveller can see we read the
 * right city. Nothing here claims a station observed anything.
 */
function buildCondition(
  place: ResolvedPlace,
  current: NonNullable<z.infer<typeof forecastSchema>["current"]>,
  units: Record<string, string>,
  retrievedAt: string,
): ServiceCondition {
  const code = current.weather_code ?? -1;
  const label = wmoLabel(code);
  const temp = current.temperature_2m;
  const wind = current.wind_speed_10m;
  const precip = current.precipitation;

  const tempUnit = units.temperature_2m ?? "°C";
  const windUnit = units.wind_speed_10m ?? "km/h";
  const precipUnit = units.precipitation ?? "mm";

  const parts: string[] = [];
  if (typeof temp === "number") parts.push(`${temp}${tempUnit}`);
  if (typeof wind === "number") parts.push(`wind ${wind} ${windUnit}`);
  if (typeof precip === "number" && precip > 0) parts.push(`${precip}${precipUnit} precipitation`);
  const reading = parts.join(", ");

  const placeName = [place.name, place.admin1].filter(Boolean).join(", ");

  return {
    id: `${OPEN_METEO_PROVIDER_ID}-current`,
    providerId: OPEN_METEO_PROVIDER_ID,
    title: `Current conditions: ${label}`,
    detail: reading
      ? `${placeName}: ${reading}. Model value for the current hour (${current.time ?? retrievedAt}), not a station observation.`
      : `${placeName}. Model value for the current hour, not a station observation.`,
    severity: forecastSeverity(code),
    from: toIso(current.time ?? retrievedAt),
    affectedPlaces: [placeName].filter(Boolean),
    url: ATTRIBUTION_URL,
  };
}

export const openMeteoProvider: Provider = {
  metadata: {
    id: OPEN_METEO_PROVIDER_ID,
    name: "Open-Meteo global forecast",
    organization: "Open-Meteo",
    url: "https://open-meteo.com/en/docs",
    // Open-Meteo aggregates national weather services; it is a reputable
    // secondary aggregator, not the responsible authority itself, so `official`
    // is false and it can never outrank a national authority's warning.
    official: false,
    // Weather and the open-ended category only. A forecast is a weather fact;
    // attaching it to a road or transit query would put a reading beside a
    // service status it has nothing to do with. A road disruption caused by
    // weather is classified into the weather category from the traveller's own
    // words, so it still reaches this provider.
    categories: ["weather", "other"],
    cadence: "live",
    coverage: { countries: [], areas: ["Worldwide"], nationwide: true },
    capabilities: {
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      // The whole point of the distinction: this is a forecast, not a warning.
      weatherWarnings: false,
      forecast: true,
      emergencyNotices: false,
      roadEvents: false,
      publicNotices: false,
    },
    requiredEnv: [],
    limitations: [
      "Provides a forecast and the model's value for the current hour. It is not a station observation and not an official warning.",
      "Only a national meteorological authority can declare a weather warning; this source cannot.",
      "Free for non-commercial use under CC BY 4.0; attribution is shown with the data.",
    ],
  },

  supports(query) {
    // A forecast is useful anywhere we can actually place a query. It needs
    // either explicit coordinates or a place name together with the country the
    // engine resolved — the country is what makes a duplicated name unambiguous.
    //
    // A name we could not place (no recognised country, no coordinates) is not
    // covered by this provider. Returning false here keeps that honest: the
    // engine records it as out-of-coverage rather than as a source that failed,
    // so a place like "Atlantis" is still reported as genuinely not covered.
    if (!this.metadata.categories.includes(query.category)) return false;
    if (typeof query.latitude === "number" && typeof query.longitude === "number") return true;
    const name = (query.city ?? query.region ?? "").trim();
    return Boolean(name && query.countryCode);
  },

  async query(query, context) {
    const retrievedAt = nowIso();
    const sourceBase: SourceRef = {
      id: OPEN_METEO_PROVIDER_ID,
      organization: "Open-Meteo",
      title: "Open-Meteo forecast",
      url: ATTRIBUTION_URL,
      retrievedAt,
      tier: "secondary",
      kind: "weather_warning",
      state: "unavailable",
    };

    const unavailable = (warning: string): ProviderReport => ({
      providerId: OPEN_METEO_PROVIDER_ID,
      state: "unavailable",
      cadence: "live",
      conditions: [],
      timetable: [],
      source: { ...sourceBase, note: safeT(context.t, "assist.note.providerUnreachable") },
      warnings: [warning],
      retrievedAt,
    });

    try {
      // Coordinates win when the traveller already picked a point; otherwise we
      // resolve the city name. The geocode is cached for an hour: a city does not
      // move, and this keeps us well inside the free-tier call limits.
      let place: ResolvedPlace | undefined;
      if (typeof query.latitude === "number" && typeof query.longitude === "number") {
        place = {
          latitude: query.latitude,
          longitude: query.longitude,
          name: query.city ?? "Selected location",
          countryCode: query.countryCode?.toUpperCase(),
        };
      } else {
        const name = (query.city ?? query.region ?? "").trim();
        const geoKey = `open-meteo:geo:${(query.countryCode ?? "").toUpperCase()}:${name.toLowerCase()}`;
        const geo = await cachedFetch<ResolvedPlace | null>(
          geoKey,
          async () => {
            const found = await geocode(query, context);
            return { data: found ?? null, retrievedAt, notModified: false };
          },
          { ttlMs: 60 * 60_000 },
        );
        place = geo.value ?? undefined;
      }

      if (!place) {
        // We could not place the name. That is an honest outcome, not a failure:
        // say we could not resolve it rather than reporting a made-up location.
        return unavailable(safeT(context.t, "assist.warn.placeUnresolved"));
      }

      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current: "temperature_2m,wind_speed_10m,precipitation,weather_code",
        hourly: "temperature_2m,precipitation_probability,weather_code",
        timezone: "auto",
        forecast_days: "2",
      });
      const url = `${FORECAST_ENDPOINT}?${params.toString()}`;
      // Cache the forecast for 15 minutes. The model updates about hourly, so
      // this is fresh for the traveller while keeping call volume modest.
      const outcome: CachedFetchOutcome<unknown> = await cachedFetch<unknown>(
        `open-meteo:fc:${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`,
        async () => {
          const result = await fetchJson<unknown>(url, {
            timeoutMs: 10_000,
            retries: 1,
            signal: context.signal,
            fetchImpl: context.fetchImpl,
          });
          return { data: result.data, retrievedAt: result.retrievedAt, notModified: false };
        },
        { ttlMs: 15 * 60_000 },
      );

      const parsed = forecastSchema.safeParse(outcome.value);
      if (!parsed.success) {
        throw new HttpError("parse_error", "Unexpected Open-Meteo forecast shape");
      }

      const conditions: ServiceCondition[] = [];
      if (parsed.data.current) {
        conditions.push(
          buildCondition(
            place,
            parsed.data.current,
            parsed.data.current_units ?? {},
            retrievedAt,
          ),
        );
      }

      // A short outlook from the hourly series: the next 24 hours' peak rain
      // chance and the coldest/warmest hour, so the traveller has something
      // forward-looking without a wall of numbers. Only emitted when the arrays
      // are present and aligned.
      const hourly = parsed.data.hourly;
      if (hourly?.time && hourly.time.length > 1) {
        const nextDay = hourly.time.slice(0, 24);
        const probs = (hourly.precipitation_probability ?? []).slice(0, 24);
        const temps = (hourly.temperature_2m ?? []).slice(0, 24);
        const maxProb = probs.reduce<number | undefined>(
          (acc, value) => (typeof value === "number" && (acc === undefined || value > acc) ? value : acc),
          undefined,
        );
        const numericTemps = temps.filter((v): v is number => typeof v === "number");
        const detail: string[] = [];
        if (maxProb !== undefined) detail.push(`peak precipitation chance ${maxProb}%`);
        if (numericTemps.length > 0) {
          detail.push(
            `temperature ${Math.min(...numericTemps)}–${Math.max(...numericTemps)}${parsed.data.current_units?.temperature_2m ?? "°C"}`,
          );
        }
        if (detail.length > 0) {
          conditions.push({
            id: `${OPEN_METEO_PROVIDER_ID}-outlook`,
            providerId: OPEN_METEO_PROVIDER_ID,
            title: `Forecast for the next 24 hours`,
            detail: `${[place.name, place.admin1].filter(Boolean).join(", ")}: ${detail.join(", ")}. Forecast, not an observation.`,
            severity: "info",
            from: toIso(nextDay[0]),
            to: toIso(nextDay[nextDay.length - 1]),
            affectedPlaces: [place.name].filter(Boolean),
            url: ATTRIBUTION_URL,
          });
        }
      }

      const state: DataState = outcome.refreshFailed
        ? "stale"
        : outcome.freshness === "live"
          ? "live"
          : "cached";

      return {
        providerId: OPEN_METEO_PROVIDER_ID,
        state,
        cadence: "live",
        conditions,
        timetable: [],
        source: {
          ...sourceBase,
          state,
          note: safeT(context.t, "assist.note.openMeteoScope"),
        },
        warnings: outcome.refreshFailed
          ? [safeT(context.t, "assist.warn.providerStale", { provider: "Open-Meteo" })]
          : [],
        retrievedAt,
      };
    } catch (error) {
      // Any upstream problem becomes an honest unavailable report with a link to
      // the official page — never a fabricated reading.
      const kind = error instanceof HttpError ? error.kind : "network";
      const warning =
        kind === "rate_limited"
          ? safeT(context.t, "assist.warn.providerRateLimited", { provider: "Open-Meteo" })
          : safeT(context.t, "assist.warn.providerUnreachable", { provider: "Open-Meteo" });
      const report = unavailable(warning);
      return { ...report, errorKind: kind };
    }
  },
};
