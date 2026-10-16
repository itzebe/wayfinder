/**
 * Severe-weather and emergency-notice adapters.
 *
 * Sources here are national meteorological and emergency authorities:
 *
 *  - US National Weather Service (`api.weather.gov`) — official active alerts,
 *    including the CAP severity/certainty fields, keyed by US state.
 *  - Deutscher Wetterdienst (DWD) — the German national weather service's public
 *    warning feed, keyed by German state code.
 *  - USGS earthquake feed — official seismic events, used as an emergency signal.
 *
 * The critical design rule: a forecast is not a warning and a warning is not an
 * evacuation order. Only `ALERT`/`WARNING`-class CAP events become warnings; a
 * statement or advisory is classified as information. Nothing here ever
 * synthesises an evacuation instruction — the advice always points at the
 * authority that would issue one.
 */

import { z } from "zod";

import { fetchJson, HttpError } from "@/lib/core/http";
import { nowIso, toIso } from "@/lib/core/time";
import type { SourceKind, SourceRef } from "@/lib/core/types";
import type { Translate } from "@/lib/i18n/translator";
import type { Provider, ProviderContext } from "../provider";
import type {
  AssistanceCategory,
  AssistanceQuery,
  ProviderReport,
  ServiceCondition,
} from "../types";

function safeT(t: Translate, key: string, params?: Record<string, string | number>): string {
  const value = t(key, params);
  return value === key ? key : value;
}

function weatherSource(
  id: string,
  organization: string,
  title: string,
  url: string,
  retrievedAt: string,
  kind: SourceKind,
  note?: string,
): SourceRef {
  return {
    id,
    organization,
    title,
    url,
    retrievedAt,
    tier: "primary",
    kind,
    state: "live",
    note,
  };
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

/**
 * Major US cities → state code. NWS indexes alerts by state, so a city name
 * alone is not enough. This lets "New York" or "Sacramento" resolve without
 * forcing a traveller to know that NWS wants a two-letter code.
 */
const US_CITY_TO_STATE: Record<string, string> = {
  "new york": "NY", brooklyn: "NY", queens: "NY", bronx: "NY", manhattan: "NY",
  "los angeles": "CA", "san francisco": "CA", "san diego": "CA", "san jose": "CA",
  sacramento: "CA", oakland: "CA", fresno: "CA", "long beach": "CA",
  chicago: "IL", houston: "TX", dallas: "TX", austin: "TX", "san antonio": "TX",
  phoenix: "AZ", philadelphia: "PA", pittsburgh: "PA",
  seattle: "WA", spokane: "WA", portland: "OR", denver: "CO", boston: "MA",
  atlanta: "GA", miami: "FL", orlando: "FL", tampa: "FL", jacksonville: "FL",
  detroit: "MI", minneapolis: "MN", "st. paul": "MN", "saint paul": "MN",
  "las vegas": "NV", "salt lake city": "UT", baltimore: "MD", washington: "DC",
  "washington dc": "DC", "washington, dc": "DC", nashville: "TN", memphis: "TN",
  "new orleans": "LA", cleveland: "OH", columbus: "OH", cincinnati: "OH",
  "kansas city": "MO", "st. louis": "MO", "saint louis": "MO", milwaukee: "WI",
  raleigh: "NC", charlotte: "NC", richmond: "VA", "virginia beach": "VA",
  honolulu: "HI", anchorage: "AK", albuquerque: "NM", tucson: "AZ",
  omaha: "NE", tulsa: "OK", "oklahoma city": "OK", louisville: "KY",
  buffalo: "NY", hartford: "CT", providence: "RI", newark: "NJ",
  "jersey city": "NJ", "fort worth": "TX", "el paso": "TX", "colorado springs": "CO",
};

/** Resolves the US state code from an explicit region or a known city name. */
function resolveUsState(query: { region?: string; city?: string }): string | undefined {
  const region = (query.region ?? "").trim().toUpperCase();
  if (US_STATE_NAMES[region]) return region;
  const city = (query.city ?? "").trim().toLowerCase();
  if (city && US_CITY_TO_STATE[city]) return US_CITY_TO_STATE[city];
  return undefined;
}

/** Maps CAP severity + urgency to our shared severity scale. */
function capSeverity(severity: string | undefined, urgency: string | undefined): ServiceCondition["severity"] {
  const s = (severity ?? "").toLowerCase();
  const u = (urgency ?? "").toLowerCase();
  if (s === "extreme") return "severe";
  if (s === "severe" && (u === "immediate" || u === "expected")) return "major";
  if (s === "severe") return "major";
  if (s === "moderate") return "minor";
  return "info";
}

const nwsAlertSchema = z.object({
  features: z.array(
    z.object({
      id: z.string().optional(),
      properties: z.object({
        id: z.string().optional(),
        event: z.string().optional(),
        headline: z.string().optional(),
        description: z.string().optional(),
        instruction: z.string().optional(),
        severity: z.string().optional(),
        urgency: z.string().optional(),
        certainty: z.string().optional(),
        areaDesc: z.string().optional(),
        sent: z.string().optional(),
        effective: z.string().optional(),
        onset: z.string().optional(),
        ends: z.string().optional(),
        expires: z.string().optional(),
        senderName: z.string().optional(),
      }),
    }),
  ),
});

export const nwsAlertsProvider: Provider = {
  metadata: {
    id: "nws-alerts",
    name: "US National Weather Service active alerts",
    organization: "NOAA / National Weather Service",
    url: "https://api.weather.gov/alerts/active",
    official: true,
    categories: ["weather", "road", "other"],
    cadence: "live",
    coverage: { countries: ["US"], areas: ["United States"], nationwide: true },
    capabilities: {
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      weatherWarnings: true,
      emergencyNotices: true,
      roadEvents: false,
      publicNotices: false,
    },
    requiredEnv: [],
    limitations: [
      "Covers the United States only. It cannot report warnings for other countries.",
      "It publishes official warnings; it does not issue evacuation orders, which come from local emergency authorities.",
      "Alerts are indexed by state, so a region within a large state may report warnings that do not apply to the exact location.",
    ],
  },

  supports(query) {
    // Weather alerts only reach the United States, and only when we can resolve
    // a state for them. Answering a query we cannot place would attach US
    // warnings to an unrelated city, so we stay silent instead.
    if (query.category === "weather" || query.category === "other") {
      return (
        Boolean(query.countryCode && query.countryCode.toUpperCase() === "US") &&
        resolveUsState(query) !== undefined
      );
    }
    if (query.category === "road") {
      const text = `${query.description ?? ""} ${query.network ?? ""}`;
      return (
        Boolean(query.countryCode && query.countryCode.toUpperCase() === "US") &&
        resolveUsState(query) !== undefined &&
        /\b(snow|ice|flood|storm|wind|fog|weather|hurricane|wildfire)\b/i.test(text)
      );
    }
    return false;
  },

  async query(query, context) {
    const retrievedAt = nowIso();
    // NWS indexes alerts by US state, so a state or territory code is required.
    const stateCode = resolveUsState(query) ?? "";
    if (!US_STATE_NAMES[stateCode]) {
      return emptyReport(
        "nws-alerts",
        "NOAA / National Weather Service",
        "US National Weather Service active alerts",
        "https://api.weather.gov/alerts/active",
        retrievedAt,
        safeT(context.t, "assist.warn.regionRequired", { provider: "National Weather Service" }),
        context.t,
        "weather_warning",
      );
    }

    const url = `https://api.weather.gov/alerts/active?area=${stateCode}&severity=Moderate,Severe,Extreme`;
    try {
      const result = await fetchJson<unknown>(url, {
        timeoutMs: 12_000,
        retries: 1,
        signal: context.signal,
        headers: { Accept: "application/geo+json" },
        fetchImpl: context.fetchImpl,
      });
      const parsed = nwsAlertSchema.safeParse(result.data);
      if (!parsed.success) {
        throw new HttpError("parse_error", "Unexpected NWS alerts shape");
      }

      const conditions: ServiceCondition[] = [];
      for (const feature of parsed.data.features) {
        const p = feature.properties;
        const severity = capSeverity(p.severity, p.urgency);
        // Only genuine warnings/alerts become warning-class conditions. A
        // "Statement" or "Advisory" is still shown, but at information level.
        const event = p.event ?? safeT(context.t, "assist.weather.eventFallback");
        const isWarning = /warning|emergency/i.test(event);
        conditions.push({
          id: `nws-${p.id ?? feature.id ?? conditions.length}`,
          providerId: "nws-alerts",
          title: p.headline?.trim() || event,
          detail: p.instruction?.trim() || p.description?.trim()?.slice(0, 600),
          severity: isWarning ? severity : severity === "severe" ? "major" : "info",
          from: toIso(p.onset ?? p.effective ?? p.sent),
          to: toIso(p.ends ?? p.expires),
          affectedPlaces: p.areaDesc ? p.areaDesc.split(";").map((s) => s.trim()).slice(0, 6) : undefined,
          url: "https://api.weather.gov/alerts/active",
        });
      }

      return {
        providerId: "nws-alerts",
        state: "live",
        cadence: "live",
        conditions,
        timetable: [],
        source: weatherSource(
          "nws-alerts",
          "NOAA / National Weather Service",
          `Active NWS alerts for ${US_STATE_NAMES[stateCode]}`,
          url,
          retrievedAt,
          "weather_warning",
          safeT(context.t, "assist.note.nwsScope"),
        ),
        warnings: [],
        retrievedAt,
      };
    } catch {
      return emptyReport(
        "nws-alerts",
        "NOAA / National Weather Service",
        "US National Weather Service active alerts",
        url,
        retrievedAt,
        safeT(context.t, "assist.warn.providerUnreachable", { provider: "National Weather Service" }),
        context.t,
        "weather_warning",
      );
    }
  },
};

const dwdSchema = z
  .object({
    time: z.number().optional(),
    warnings: z.record(z.string(), z.array(z.unknown())).optional(),
    vorabInformation: z.record(z.string(), z.array(z.unknown())).optional(),
  })
  .passthrough();

/** DWD level 1..4 → severity. 4 is the most severe (extreme). */
function dwdSeverity(level: number | undefined): ServiceCondition["severity"] {
  if (level === 4) return "severe";
  if (level === 3) return "major";
  if (level === 2) return "minor";
  return "info";
}

export const dwdWarningsProvider: Provider = {
  metadata: {
    id: "dwd-warnings",
    name: "DWD Germany weather warnings",
    organization: "Deutscher Wetterdienst (DWD)",
    url: "https://www.dwd.de/EN/weather/warnings/warnings_node.html",
    official: true,
    categories: ["weather", "road", "other"],
    cadence: "live",
    coverage: { countries: ["DE"], areas: ["Germany"], nationwide: true },
    capabilities: {
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      weatherWarnings: true,
      emergencyNotices: false,
      roadEvents: false,
      publicNotices: false,
    },
    requiredEnv: [],
    limitations: [
      "Covers Germany only.",
      "It reports weather warnings published by DWD; it does not issue evacuation orders.",
      "The feed is published per region, so several warnings may apply to one area.",
    ],
  },

  supports(query) {
    if (!["weather", "road", "other"].includes(query.category)) return false;
    return Boolean(query.countryCode && query.countryCode.toUpperCase() === "DE");
  },

  async query(_query, context) {
    const retrievedAt = nowIso();
    const url = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json";
    try {
      const text = await fetchDwdText(url, context);
      // DWD wraps the JSON in a JS callback: `warnWetter.loadWarnings({...});`.
      const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = dwdSchema.safeParse(JSON.parse(jsonText));
      if (!parsed.success) throw new HttpError("parse_error", "Unexpected DWD warnings shape");

      const conditions: ServiceCondition[] = [];
      const groups = [parsed.data.warnings, parsed.data.vorabInformation];
      for (const group of groups) {
        if (!group) continue;
        for (const entries of Object.values(group)) {
          for (const entry of entries) {
            const record = entry as {
              level?: number;
              type?: number;
              regionName?: string;
              headline?: string;
              description?: string;
              start?: number;
              end?: number;
            };
            conditions.push({
              id: `dwd-${conditions.length}`,
              providerId: "dwd-warnings",
              title: record.headline?.trim() || record.regionName || safeT(context.t, "assist.weather.eventFallback"),
              detail: record.description?.trim(),
              severity: dwdSeverity(record.level),
              from: record.start ? new Date(record.start).toISOString() : undefined,
              to: record.end ? new Date(record.end).toISOString() : undefined,
              affectedPlaces: record.regionName ? [record.regionName] : undefined,
              url,
            });
          }
        }
      }

      return {
        providerId: "dwd-warnings",
        state: "live",
        cadence: "live",
        conditions,
        timetable: [],
        source: weatherSource(
          "dwd-warnings",
          "Deutscher Wetterdienst (DWD)",
          "DWD weather warnings for Germany",
          url,
          retrievedAt,
          "weather_warning",
          safeT(context.t, "assist.note.dwdScope"),
        ),
        warnings: [],
        retrievedAt,
      };
    } catch {
      return emptyReport(
        "dwd-warnings",
        "Deutscher Wetterdienst (DWD)",
        "DWD weather warnings for Germany",
        url,
        retrievedAt,
        safeT(context.t, "assist.warn.providerUnreachable", { provider: "DWD" }),
        context.t,
        "weather_warning",
      );
    }
  },
};

/**
 * Words a traveller uses when an earthquake is what they are dealing with. The
 * USGS feed cannot be filtered by place without geocoding, so the provider stays
 * silent unless the report itself is seismic.
 */
const SEISMIC_HINT = new RegExp(
  [
    // Latin scripts can use word boundaries safely.
    "\\b(?:earthquake|quake|seismic|tremor|aftershock|terremoto|sismo|se[íi]smo|temblor|erdbeben|s[ée]isme)\\b",
    // Arabic, CJK and Devanagari do not: match the bare word instead.
    "زلزال",
    "地震",
    "भूकंप",
  ].join("|"),
  "i",
);

const usgsSchema = z.object({
  features: z.array(
    z.object({
      id: z.string().optional(),
      properties: z.object({
        mag: z.number().optional(),
        place: z.string().optional(),
        time: z.number().optional(),
        title: z.string().optional(),
        url: z.string().optional(),
        tsunami: z.number().optional(),
      }),
    }),
  ),
});

export const usgsEarthquakeProvider: Provider = {
  metadata: {
    id: "usgs-earthquakes",
    name: "USGS significant earthquakes",
    organization: "U.S. Geological Survey (USGS)",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
    official: true,
    categories: ["weather", "other"],
    cadence: "periodic",
    coverage: { countries: [], areas: ["Worldwide"], nationwide: true },
    capabilities: {
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      weatherWarnings: false,
      emergencyNotices: true,
      roadEvents: false,
      publicNotices: false,
    },
    requiredEnv: [],
    limitations: [
      "Reports significant earthquakes worldwide over the last day, above magnitude 4.5.",
      "It is an emergency signal, not a local alert service; local instructions come from local authorities.",
    ],
  },

  supports(query) {
    if (query.category !== "other" && query.category !== "weather") return false;
    // A worldwide feed means nothing until we know where the traveller is, so
    // never let it answer a query with no place attached.
    if (!query.countryCode && !query.city) return false;
    // The feed has no location filter we can apply without geocoding, so it is
    // only surfaced when the traveller's own report points at a seismic event.
    // Otherwise a distant earthquake would be presented as their situation.
    const haystack = [query.description, query.network, query.from, query.to]
      .filter(Boolean)
      .join(" ");
    return SEISMIC_HINT.test(haystack);
  },

  async query(_query, context) {
    const retrievedAt = nowIso();
    const url =
      "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=5&orderby=time";
    try {
      const result = await fetchJson<unknown>(url, {
        timeoutMs: 12_000,
        retries: 1,
        signal: context.signal,
        fetchImpl: context.fetchImpl,
      });
      const parsed = usgsSchema.safeParse(result.data);
      if (!parsed.success) throw new HttpError("parse_error", "Unexpected USGS shape");

      const conditions: ServiceCondition[] = parsed.data.features
        .filter((f) => f.properties.mag !== undefined)
        .map((f, index) => ({
          id: `usgs-${f.id ?? index}`,
          providerId: "usgs-earthquakes",
          title:
            f.properties.title ??
            safeT(context.t, "assist.weather.quakeFallback", { mag: f.properties.mag ?? 0 }),
          detail: f.properties.tsunami === 1 ? safeT(context.t, "assist.weather.tsunamiFlag") : undefined,
          severity: (f.properties.mag ?? 0) >= 6 ? "major" : "minor",
          from: f.properties.time ? new Date(f.properties.time).toISOString() : undefined,
          affectedPlaces: f.properties.place ? [f.properties.place] : undefined,
          url: f.properties.url,
        }));

      return {
        providerId: "usgs-earthquakes",
        state: "live",
        cadence: "periodic",
        conditions,
        timetable: [],
        source: weatherSource(
          "usgs-earthquakes",
          "U.S. Geological Survey (USGS)",
          "Significant earthquakes (last 24 hours)",
          url,
          retrievedAt,
          "emergency_notice",
          safeT(context.t, "assist.note.usgsScope"),
        ),
        warnings: [],
        retrievedAt,
      };
    } catch {
      return emptyReport(
        "usgs-earthquakes",
        "U.S. Geological Survey (USGS)",
        "Significant earthquakes (last 24 hours)",
        url,
        retrievedAt,
        safeT(context.t, "assist.warn.providerUnreachable", { provider: "USGS" }),
        context.t,
        "emergency_notice",
      );
    }
  },
};

async function fetchDwdText(url: string, context: ProviderContext): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  context.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await context.fetchImpl(url, {
      headers: { Accept: "application/json, text/plain, */*", "User-Agent": "WAYFINDER/1.0 (weather assistance)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new HttpError("server_error", `DWD returned ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", onAbort);
  }
}

function emptyReport(
  providerId: string,
  organization: string,
  title: string,
  url: string,
  retrievedAt: string,
  warning: string,
  t: Translate,
  kind: SourceKind,
): ProviderReport {
  return {
    providerId,
    state: "unavailable",
    cadence: "live",
    conditions: [],
    timetable: [],
    source: {
      id: providerId,
      organization,
      title,
      url,
      retrievedAt,
      tier: "primary",
      kind,
      state: "unavailable",
      note: safeT(t, "assist.note.providerUnreachable"),
    },
    warnings: [warning],
    retrievedAt,
  };
}
