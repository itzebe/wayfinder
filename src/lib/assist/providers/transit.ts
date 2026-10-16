/**
 * Transit adapters.
 *
 * Two reusable provider shapes cover all certified transit integrations:
 *
 *  1. `tflProvider` — Transport for London's Unified API. Official, no key,
 *     line status plus disruption detail for tube, rail, DLR, Overground,
 *     Elizabeth line and bus.
 *  2. `gtfsRealtimeProvider` — a GTFS Realtime alerts feed (protobuf), as
 *     published by MTA New York City Transit, BART and others. Official,
 *     no key, live service alerts.
 *
 * Both normalise into `ServiceCondition`. Neither invents anything: when the
 * feed is empty that is reported as "no current disruptions", which is a real
 * finding, not a blank screen and not a fabricated delay.
 */

import GtfsRealtime from "gtfs-realtime-bindings";
import { z } from "zod";

import { cachedFetch } from "@/lib/core/cache";
import { fetchJson, HttpError } from "@/lib/core/http";
import { nowIso, unixSecondsToIso } from "@/lib/core/time";
import type { DataState, SourceRef } from "@/lib/core/types";
import type { Translate } from "@/lib/i18n/translator";
import type { Provider, ProviderContext } from "../provider";
import type {
  AssistanceCategory,
  AssistanceQuery,
  ProviderReport,
  ServiceCondition,
} from "../types";

/** Reads a `Translate` value, defaulting to the key so nothing renders blank. */
function safeT(t: Translate, key: string, params?: Record<string, string | number>): string {
  const value = t(key, params);
  return value === key ? key : value;
}

function sourceRef(
  providerId: string,
  organization: string,
  title: string,
  url: string,
  state: DataState,
  retrievedAt: string,
  note?: string,
): SourceRef {
  return {
    id: providerId,
    organization,
    title,
    url,
    retrievedAt,
    tier: "primary",
    kind: "public_transport",
    state,
    note,
  };
}

// ---------------------------------------------------------------------------
// Transport for London
// ---------------------------------------------------------------------------

const TFL_BASE = "https://api.tfl.gov.uk";
const TFL_SOURCE_URL = "https://api.tfl.gov.uk/swagger/ui/index.html";

const tflLineSchema = z.object({
  id: z.string(),
  name: z.string(),
  modeName: z.string().optional(),
  lineStatuses: z
    .array(
      z.object({
        statusSeverity: z.number().optional(),
        statusSeverityDescription: z.string().optional(),
        reason: z.string().optional(),
        validityPeriods: z
          .array(
            z.object({
              fromDate: z.string().optional(),
              toDate: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  disruptions: z
    .array(
      z.object({
        category: z.string().optional(),
        description: z.string().optional(),
        additionalInfo: z.string().optional(),
        affectedRoutes: z.array(z.object({ name: z.string().optional() })).optional(),
        affectedStops: z.array(z.object({ name: z.string().optional() })).optional(),
      }),
    )
    .optional(),
});

type TflLine = z.infer<typeof tflLineSchema>;

/**
 * TfL severity convention: 10 is "Good Service"; values below 10 are some form
 * of disruption. TfL reports a closure as "Part Suspended" (severity 5/6), so a
 * pure numeric split is not enough — suspension and closure wording also raises
 * the classification, which is what a traveller would expect.
 */
function severityFromTfl(
  statusSeverity: number | undefined,
  description: string | undefined,
): ServiceCondition["severity"] {
  if (statusSeverity === undefined) return "info";
  if (statusSeverity >= 10) return "good_service";
  if (/suspend|clos|no service|part closure|planned closure/i.test(description ?? "")) return "severe";
  if (statusSeverity <= 5) return "severe";
  if (statusSeverity <= 7) return "major";
  return "minor";
}

function buildTflProvider(config: {
  id: string;
  name: string;
  modes: string[];
  categories: AssistanceCategory[];
  areas: string[];
  url: string;
}): Provider {
  return {
    metadata: {
      id: config.id,
      name: config.name,
      organization: "Transport for London",
      url: config.url,
      official: true,
      categories: config.categories,
      cadence: "live",
      coverage: { countries: ["GB"], areas: config.areas, nationwide: false },
      capabilities: {
        serviceAlerts: true,
        lineStatus: true,
        schedule: false,
        realtime: true,
        weatherWarnings: false,
        emergencyNotices: false,
        roadEvents: false,
        publicNotices: false,
      },
      requiredEnv: [],
      limitations: [
        "Covers London services only; it cannot report on transport outside Greater London.",
        "It reports line and route status, not the status of an individual traveller's journey.",
      ],
    },

    supports(query) {
      if (!config.categories.includes(query.category)) return false;
      // TfL is London-only; require an explicit GB hint or a London city name.
      if (query.countryCode && query.countryCode.toUpperCase() !== "GB") return false;
      if (!query.countryCode && !isLondonCity(query.city)) return false;
      return true;
    },

    async query(query, context) {
      const modes = config.modes.join(",");
      const url = `${TFL_BASE}/Line/Mode/${modes}/Status`;
      const retrievedAt = nowIso();

      const outcome = await cachedFetch<TflLine[]>(
        `tfl-status:${modes}`,
        async () => {
          const result = await fetchJson<unknown>(url, {
            timeoutMs: 9_000,
            retries: 1,
            signal: context.signal,
            fetchImpl: context.fetchImpl,
          });
          const parsed = z.array(tflLineSchema).safeParse(result.data);
          if (!parsed.success) {
            throw new HttpError("parse_error", "Unexpected TfL line status shape");
          }
          return { data: parsed.data, retrievedAt: result.retrievedAt, notModified: result.notModified };
        },
        { ttlMs: 60_000 },
      );

      const state: DataState =
        outcome.freshness === "live" ? "live" : outcome.freshness === "cached" ? "cached" : "stale";

      const conditions: ServiceCondition[] = [];
      for (const line of outcome.value) {
        const status = line.lineStatuses?.[0];
        const severity = severityFromTfl(status?.statusSeverity, status?.statusSeverityDescription);
        if (severity === "good_service") continue;

        const validity = status?.validityPeriods?.[0];
        const affected = [
          ...(line.disruptions ?? []).flatMap((d) =>
            (d.affectedRoutes ?? []).map((r) => r.name).filter((n): n is string => Boolean(n)),
          ),
        ];

        conditions.push({
          id: `${config.id}-${line.id}`,
          providerId: config.id,
          title: `${line.name}: ${status?.statusSeverityDescription ?? safeT(context.t, "assist.transit.statusUnknown")}`,
          detail: status?.reason?.trim() || line.disruptions?.[0]?.description?.trim(),
          severity,
          from: validity?.fromDate,
          to: validity?.toDate,
          affectedPlaces: affected.length > 0 ? [...new Set(affected)] : [line.name],
          url: `${TFL_BASE}/Line/${line.id}/Status`,
        });
      }

      const warnings: string[] = [];
      if (outcome.refreshFailed) {
        warnings.push(safeT(context.t, "assist.warn.providerStale", { provider: config.name }));
      }

      return {
        providerId: config.id,
        state,
        cadence: "live",
        conditions,
        timetable: [],
        source: sourceRef(
          config.id,
          "Transport for London",
          config.name,
          url,
          state,
          retrievedAt,
          outcome.refreshFailed
            ? safeT(context.t, "assist.note.lastGoodShown")
            : undefined,
        ),
        warnings,
        retrievedAt,
      };
    },
  };
}

function isLondonCity(city: string | undefined): boolean {
  if (!city) return false;
  return /london/i.test(city);
}

export const tflTubeProvider = buildTflProvider({
  id: "tfl-tube",
  name: "London Underground status",
  modes: ["tube", "dlr", "overground", "elizabeth-line"],
  categories: ["metro", "rail", "other"],
  areas: ["Greater London"],
  url: `${TFL_BASE}/Line/Mode/tube/dlr/overground/elizabeth-line/Status`,
});

export const tflRailProvider = buildTflProvider({
  id: "tfl-rail",
  name: "London rail and tram status",
  modes: ["national-rail", "tram"],
  categories: ["rail", "other"],
  areas: ["Greater London"],
  url: `${TFL_BASE}/Line/Mode/national-rail/tram/Status`,
});

export const tflBusProvider = buildTflProvider({
  id: "tfl-bus",
  name: "London bus status",
  modes: ["bus"],
  categories: ["bus", "other"],
  areas: ["Greater London"],
  url: "https://api.tfl.gov.uk/Line/Mode/bus/Status",
});

// ---------------------------------------------------------------------------
// GTFS Realtime (protobuf)
// ---------------------------------------------------------------------------

interface GtfsConfig {
  id: string;
  name: string;
  organization: string;
  /** Direct URL of the protobuf alerts feed. */
  url: string;
  countries: string[];
  areas: string[];
  categories: AssistanceCategory[];
  /** Cities that should route to this provider when no country is given. */
  cityHints: string[];
  limitations: string[];
}

/**
 * GTFS Realtime encodes severity and effect as numeric enums, not strings.
 * Effect: 1 NO_SERVICE, 2 REDUCED_SERVICE, 3 SIGNIFICANT_DELAYS, 4 DETOUR,
 * 5 ADDITIONAL_SERVICE, 6 MODIFIED_SERVICE, 9 STOP_MOVED.
 * Severity: 1 UNKNOWN, 2 INFO, 3 WARNING, 4 SEVERE.
 * A NO_SERVICE or SIGNIFICANT_DELAYS effect is more serious than its severity
 * number suggests, so the effect takes precedence.
 */
function severityFromGtfs(
  severityLevel: number | undefined,
  effect: number | string | undefined,
): ServiceCondition["severity"] {
  const effectCode =
    typeof effect === "number"
      ? effect
      : typeof effect === "string" && /^\d+$/.test(effect)
        ? Number(effect)
        : effect === "NO_SERVICE"
          ? 1
          : effect === "REDUCED_SERVICE"
            ? 2
            : effect === "SIGNIFICANT_DELAYS"
              ? 3
              : effect === "DETOUR"
                ? 4
                : effect === "MODIFIED_SERVICE"
                  ? 6
                  : effect === "STOP_MOVED"
                    ? 9
                    : undefined;

  if (effectCode === 1 || effectCode === 3) return "severe";
  if (effectCode === 2 || effectCode === 4) return "major";
  if (effectCode === 6 || effectCode === 9) return "minor";
  if (severityLevel === 4) return "severe";
  if (severityLevel === 3) return "major";
  if (severityLevel === 2) return "minor";
  return "info";
}

function buildGtfsProvider(config: GtfsConfig): Provider {
  return {
    metadata: {
      id: config.id,
      name: config.name,
      organization: config.organization,
      url: config.url,
      official: true,
      categories: config.categories,
      cadence: "live",
      coverage: { countries: config.countries, areas: config.areas, nationwide: false },
      capabilities: {
        serviceAlerts: true,
        lineStatus: true,
        schedule: false,
        realtime: true,
        weatherWarnings: false,
        emergencyNotices: false,
        roadEvents: false,
        publicNotices: false,
      },
      requiredEnv: [],
      limitations: config.limitations,
    },

    supports(query) {
      if (!config.categories.includes(query.category)) return false;
      if (query.countryCode) {
        return config.countries.includes(query.countryCode.toUpperCase());
      }
      const city = (query.city ?? "").toLowerCase();
      return config.cityHints.some((hint) => city.includes(hint));
    },

    async query(query, context) {
      const retrievedAt = nowIso();
      let raw: Uint8Array | undefined;
      let state: DataState = "unavailable";
      let refreshFailed = false;

      try {
        raw = await fetchGtfsProto(config.url, context);
        state = "live";
      } catch {
        refreshFailed = true;
      }

      // Fall back to the last good copy held by the cache layer.
      if (!raw) {
        const cached = readGtfsCache(config.id);
        if (cached) {
          raw = cached.value;
          state = "stale";
        }
      }

      if (!raw) {
        return {
          providerId: config.id,
          state: "unavailable",
          cadence: "live",
          conditions: [],
          timetable: [],
          source: sourceRef(
            config.id,
            config.organization,
            config.name,
            config.url,
            "unavailable",
            retrievedAt,
            safeT(context.t, "assist.note.providerUnreachable"),
          ),
          warnings: [safeT(context.t, "assist.warn.providerUnreachable", { provider: config.name })],
          retrievedAt,
        };
      }

      writeGtfsCache(config.id, raw);

      let feed: ReturnType<typeof GtfsRealtime.transit_realtime.FeedMessage.decode>;
      try {
        feed = GtfsRealtime.transit_realtime.FeedMessage.decode(raw);
      } catch {
        return {
          providerId: config.id,
          state: "unavailable",
          cadence: "live",
          conditions: [],
          timetable: [],
          source: sourceRef(
            config.id,
            config.organization,
            config.name,
            config.url,
            "unavailable",
            retrievedAt,
            safeT(context.t, "assist.note.providerUnreadable"),
          ),
          warnings: [safeT(context.t, "assist.warn.providerUnreadable", { provider: config.name })],
          retrievedAt,
        };
      }

      const conditions: ServiceCondition[] = [];
      for (const entity of feed.entity) {
        const alert = entity.alert;
        if (!alert) continue;

        const header = alert.headerText?.translation?.[0]?.text?.trim();
        const description = alert.descriptionText?.translation?.[0]?.text?.trim();
        if (!header && !description) continue;

        const affected = (alert.informedEntity ?? [])
          .map((ie) => ie.routeId ?? ie.stopId ?? "")
          .filter((value) => value !== "");

        const period = alert.activePeriod?.[0];

        conditions.push({
          id: `${config.id}-${entity.id}`,
          providerId: config.id,
          title: header || description || safeT(context.t, "assist.transit.alertFallback"),
          detail: header && description && description !== header ? description : undefined,
          severity: severityFromGtfs(
            toNumber(alert.severityLevel ?? undefined),
            alert.effect === null || alert.effect === undefined ? undefined : (alert.effect as unknown as number),
          ),
          from: unixSecondsToIso(toNumber(period?.start)),
          to: unixSecondsToIso(toNumber(period?.end)),
          affectedPlaces: affected.length > 0 ? [...new Set(affected)] : undefined,
          url: config.url,
        });
      }

      const warnings: string[] = [];
      if (refreshFailed) {
        warnings.push(safeT(context.t, "assist.warn.providerStale", { provider: config.name }));
      }

      return {
        providerId: config.id,
        state,
        cadence: "live",
        conditions,
        timetable: [],
        source: sourceRef(
          config.id,
          config.organization,
          config.name,
          config.url,
          state,
          retrievedAt,
          refreshFailed ? safeT(context.t, "assist.note.lastGoodShown") : safeT(context.t, "assist.note.alertsFeed"),
        ),
        warnings,
        retrievedAt,
      };
    },
  };
}

/** protobufjs returns 64-bit integers as `Long`; normalise to a JS number. */
function toNumber(value: number | { toNumber(): number } | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/** Raw protobuf bytes are cached separately from the JSON cache. */
const gtfsCache = new Map<string, { value: Uint8Array; storedAt: number }>();
const GTFS_TTL_MS = 60_000;

function readGtfsCache(id: string): { value: Uint8Array } | undefined {
  const record = gtfsCache.get(id);
  if (!record) return undefined;
  if (Date.now() - record.storedAt > 6 * 60 * 60 * 1000) {
    gtfsCache.delete(id);
    return undefined;
  }
  return { value: record.value };
}

function writeGtfsCache(id: string, value: Uint8Array): void {
  gtfsCache.set(id, { value, storedAt: Date.now() });
}

/** True when a cached GTFS payload is still within its freshness window. */
export function gtfsCacheIsFresh(id: string): boolean {
  const record = gtfsCache.get(id);
  return Boolean(record && Date.now() - record.storedAt < GTFS_TTL_MS);
}

async function fetchGtfsProto(url: string, context: ProviderContext): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  const onAbort = () => controller.abort();
  context.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await context.fetchImpl(url, {
      headers: {
        Accept: "application/x-protobuf, application/octet-stream, */*",
        "User-Agent": "WAYFINDER/1.0 (transit assistance)",
      },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) {
      throw new HttpError(
        response.status === 429 ? "rate_limited" : "server_error",
        `GTFS feed ${url} returned ${response.status}`,
        { status: response.status },
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", onAbort);
  }
}

export const mtaSubwayProvider = buildGtfsProvider({
  id: "mta-subway",
  name: "MTA New York City Subway service alerts",
  organization: "MTA New York City Transit",
  url: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts",
  countries: ["US"],
  areas: ["New York City"],
  categories: ["metro", "other"],
  cityHints: ["new york", "nyc", "manhattan", "brooklyn", "queens", "bronx"],
  limitations: [
    "Covers the New York City Subway only; it cannot report on buses, commuter rail or other US cities.",
    "Alerts describe service conditions, not the status of an individual journey.",
  ],
});

export const bartProvider = buildGtfsProvider({
  id: "bart",
  name: "BART service alerts",
  organization: "Bay Area Rapid Transit (BART)",
  url: "https://api.bart.gov/gtfsrt/alerts.aspx",
  countries: ["US"],
  areas: ["San Francisco Bay Area"],
  categories: ["metro", "rail", "other"],
  cityHints: ["san francisco", "oakland", "berkeley", "bay area"],
  limitations: [
    "Covers the BART network only, which serves the San Francisco Bay Area.",
    "It cannot report on other US regions, and it does not publish per-journey status.",
  ],
});
