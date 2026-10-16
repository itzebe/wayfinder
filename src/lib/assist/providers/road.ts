/**
 * Road-disruption and public-notice adapters.
 *
 *  - Caltrans District 3 (California) changeable-message-sign status: official
 *    California Department of Transportation data on current road notices.
 *  - GOV.UK search API: the UK government's own publication index, used for
 *    public notices and official guidance.
 *
 * Neither adapter proposes a route. Caltrans publishes notices, not turn-by-turn
 * directions, so the assistant reports the official notice and directs the
 * traveller to the road authority. We never invent a detour.
 */

import { z } from "zod";

import { fetchJson, HttpError } from "@/lib/core/http";
import { nowIso } from "@/lib/core/time";
import type { SourceKind, SourceRef } from "@/lib/core/types";
import type { Translate } from "@/lib/i18n/translator";
import type { Provider, ProviderContext } from "../provider";
import type { AssistanceQuery, ProviderReport, ServiceCondition } from "../types";

function safeT(t: Translate, key: string, params?: Record<string, string | number>): string {
  const value = t(key, params);
  return value === key ? key : value;
}

function source(
  id: string,
  organization: string,
  title: string,
  url: string,
  kind: SourceKind,
  retrievedAt: string,
  note?: string,
): SourceRef {
  return { id, organization, title, url, retrievedAt, tier: "primary", kind, state: "live", note };
}

const caltransSchema = z.object({
  data: z.array(
    z.object({
      cms: z.object({
        index: z.union([z.string(), z.number()]).optional(),
        location: z
          .object({
            district: z.union([z.string(), z.number()]).optional(),
            route: z.string().optional(),
            direction: z.string().optional(),
            county: z.string().optional(),
            nearbyPlace: z.string().optional(),
            locationName: z.string().optional(),
            milepost: z.union([z.string(), z.number()]).optional(),
            description: z.string().optional(),
            latitude: z.union([z.string(), z.number()]).optional(),
            longitude: z.union([z.string(), z.number()]).optional(),
          })
          .optional(),
        message: z
          .object({
            display: z.string().optional(),
            phase1: z
              .object({
                phase1Line1: z.string().optional(),
                phase1Line2: z.string().optional(),
                phase1Line3: z.string().optional(),
              })
              .optional(),
            phase2: z
              .object({
                phase2Line1: z.string().optional(),
                phase2Line2: z.string().optional(),
                phase2Line3: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    }),
  ),
});

/** Joins the sign's displayed lines, ignoring the "Blank"/"Not Reported" fillers. */
function caltransSignText(message: z.infer<typeof caltransSchema>["data"][number]["cms"]["message"]): string {
  if (!message) return "";
  const ignore = new Set(["", "blank", "not reported", "none"]);
  const lines = [
    message.phase1?.phase1Line1,
    message.phase1?.phase1Line2,
    message.phase1?.phase1Line3,
    message.phase2?.phase2Line1,
    message.phase2?.phase2Line2,
    message.phase2?.phase2Line3,
  ];
  return lines
    .map((line) => line?.trim() ?? "")
    .filter((line) => line !== "" && !ignore.has(line.toLowerCase()))
    .join(" ")
    .trim();
}

/** California districts Caltrans publishes sign status for: 1–12. */
const CALTRANS_DISTRICTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export const caltransRoadProvider: Provider = {
  metadata: {
    id: "caltrans-cms",
    name: "Caltrans changeable message signs (California)",
    organization: "California Department of Transportation (Caltrans)",
    url: "https://cwwp2.dot.ca.gov/documentation/cms/cms.htm",
    official: true,
    categories: ["road", "other"],
    cadence: "live",
    coverage: { countries: ["US"], areas: ["California"], nationwide: false },
    capabilities: {
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      weatherWarnings: false,
      forecast: false,
      emergencyNotices: false,
      roadEvents: true,
      publicNotices: false,
    },
    requiredEnv: [],
    limitations: [
      "Covers California only, and only the notices currently displayed on Caltrans changeable message signs.",
      "These are a subset of all road events; Caltrans publishes fuller incident data separately.",
      "It does not provide routing or detours, so no alternative route is suggested.",
    ],
  },

  supports(query) {
    if (!["road", "other"].includes(query.category)) return false;
    return Boolean(query.countryCode && query.countryCode.toUpperCase() === "US");
  },

  async query(query, context) {
    const retrievedAt = nowIso();
    const results = await Promise.all(
      CALTRANS_DISTRICTS.map(async (district) => {
        const url = `https://cwwp2.dot.ca.gov/data/d${district}/cms/cmsStatusD${district.padStart(2, "0")}.json`;
        try {
          const result = await fetchJson<unknown>(url, {
            timeoutMs: 14_000,
            retries: 1,
            signal: context.signal,
            fetchImpl: context.fetchImpl,
          });
          const parsed = caltransSchema.safeParse(result.data);
          return parsed.success ? { url, data: parsed.data } : undefined;
        } catch {
          return undefined;
        }
      }),
    );

    const answered = results.filter((r): r is NonNullable<typeof r> => r !== undefined);
    if (answered.length === 0) {
      return unavailable(
        "caltrans-cms",
        "California Department of Transportation (Caltrans)",
        "Caltrans changeable message sign status",
        `https://cwwp2.dot.ca.gov/data/d${query.region ?? "3"}/cms/cmsStatusD${String(query.region ?? "3").padStart(2, "0")}.json`,
        "road_status",
        retrievedAt,
        safeT(context.t, "assist.warn.providerUnreachable", { provider: "Caltrans" }),
        context.t,
      );
    }

    const conditions: ServiceCondition[] = [];
    const seen = new Set<string>();
    for (const { url, data } of answered) {
      for (const entry of data.data) {
        const text = caltransSignText(entry.cms.message);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const severity: ServiceCondition["severity"] = /closed|closure|crash|collision|slide|flood|ice|snow/i.test(
          text,
        )
          ? "major"
          : /detour|construction|delay|slow|wind|fog/i.test(text)
            ? "minor"
            : "info";

        const route = entry.cms.location?.route;
        const county = entry.cms.location?.county;
        const place = [route, county].filter(Boolean).join(", ");
        conditions.push({
          id: `caltrans-${entry.cms.location?.district ?? "?"}-${entry.cms.index ?? conditions.length}`,
          providerId: "caltrans-cms",
          title: text.slice(0, 200),
          detail: place || undefined,
          severity,
          affectedPlaces: place ? [place] : undefined,
          url,
        });
      }
    }

    return {
      providerId: "caltrans-cms",
      state: "live",
      cadence: "live",
      conditions,
      timetable: [],
      source: source(
        "caltrans-cms",
        "California Department of Transportation (Caltrans)",
        "Caltrans changeable message sign status (all 12 districts)",
        "https://cwwp2.dot.ca.gov/documentation/cms/cms.htm",
        "road_status",
        retrievedAt,
        safeT(context.t, "assist.note.caltransScope"),
      ),
      warnings: [],
      retrievedAt,
    };
  },
};

const govUkResultSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  link: z.string().optional(),
  format: z.string().optional(),
});

export const govUkPublicNoticeProvider: Provider = {
  metadata: {
    id: "govuk-notices",
    name: "GOV.UK official guidance and notices",
    organization: "UK Government (GOV.UK)",
    url: "https://www.gov.uk/search",
    official: true,
    categories: ["public_service", "road", "other"],
    cadence: "periodic",
    coverage: { countries: ["GB"], areas: ["United Kingdom"], nationwide: true },
    capabilities: {
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      weatherWarnings: false,
      forecast: false,
      emergencyNotices: false,
      roadEvents: false,
      publicNotices: true,
    },
    requiredEnv: [],
    limitations: [
      "Covers UK government publications on GOV.UK only.",
      "It is a document search, not a live alert feed; it cannot confirm whether a specific service is operating now.",
      "Results are official publications, and the traveller should confirm details with the responsible body.",
    ],
  },

  supports(query) {
    return Boolean(query.countryCode && query.countryCode.toUpperCase() === "GB") &&
      ["public_service", "road", "other"].includes(query.category);
  },

  async query(query, context) {
    const retrievedAt = nowIso();
    const terms = [query.network, query.description, "disruption notice"]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join(" ")
      .slice(0, 120);
    const url = `https://www.gov.uk/api/search.json?count=5&q=${encodeURIComponent(terms)}`;
    try {
      const result = await fetchJson<unknown>(url, {
        timeoutMs: 12_000,
        retries: 1,
        signal: context.signal,
        fetchImpl: context.fetchImpl,
      });
      const parsed = z.object({ results: z.array(govUkResultSchema).optional() }).safeParse(result.data);
      if (!parsed.success) throw new HttpError("parse_error", "Unexpected GOV.UK shape");

      const conditions: ServiceCondition[] = (parsed.data.results ?? [])
        .map((r, index) => ({
          id: `govuk-${index}`,
          providerId: "govuk-notices",
          title: r.title?.trim() ?? "",
          detail: r.description?.trim()?.slice(0, 400),
          severity: "info" as const,
          url: r.link ? `https://www.gov.uk${r.link}` : url,
        }))
        .filter((c) => c.title !== "");

      return {
        providerId: "govuk-notices",
        state: "live",
        cadence: "periodic",
        conditions,
        timetable: [],
        source: source(
          "govuk-notices",
          "UK Government (GOV.UK)",
          `GOV.UK publications matching “${terms}”`,
          url,
          "public_notice",
          retrievedAt,
          safeT(context.t, "assist.note.govukScope"),
        ),
        warnings: [],
        retrievedAt,
      };
    } catch {
      return unavailable(
        "govuk-notices",
        "UK Government (GOV.UK)",
        "GOV.UK official guidance and notices",
        url,
        "public_notice",
        retrievedAt,
        safeT(context.t, "assist.warn.providerUnreachable", { provider: "GOV.UK" }),
        context.t,
      );
    }
  },
};

function unavailable(
  providerId: string,
  organization: string,
  title: string,
  url: string,
  kind: SourceKind,
  retrievedAt: string,
  warning: string,
  t: Translate,
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
