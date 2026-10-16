/**
 * Google-powered web discovery.
 *
 * WHY THIS AND NOT THE CUSTOM SEARCH JSON API
 * -------------------------------------------
 * The obvious Google search API for a product like this — the Custom Search JSON
 * API — is closed to new customers and is scheduled for discontinuation on
 * January 1, 2027 (see Google's own overview page, "Existing Custom Search JSON
 * API customers have until January 1, 2027 to transition to an alternative
 * solution"). The Site Restricted JSON API, its sibling, ceased serving traffic
 * on January 8, 2025. Building on either would be building on a service a
 * new deployment cannot sign up for and a live one is being migrated off.
 *
 * The supported Google path available to a *new* implementation is grounding
 * with Google Search on the Gemini API (`generativelanguage.googleapis.com`).
 * Enabling the `google_search` tool makes the model run real Google searches and
 * return the sources it used as structured `groundingChunks`. That is exactly
 * what discovery needs: the user's question goes to Google, and the pages Google
 * found come back with their original URLs and titles.
 *
 * WHAT THIS PROVIDER IS, AND IS NOT
 * ---------------------------------
 * This is a *discovery* provider. It does two things and deliberately no more:
 *   1. asks Google, via Gemini, which pages are relevant to this situation;
 *   2. returns those pages as `SearchFinding`s — leads with their original URL,
 *      title, domain and discovery time.
 *
 * It never turns a search result into a `ServiceCondition`. A search result is
 * not a verified incident: it is a page someone should look at. Consequential
 * claims stay with the live providers that retrieved and normalised real data.
 * This is enforced by construction — the adapter returns `conditions: []` always.
 *
 * CONFIGURATION (server-only; never bundled into client JavaScript)
 * ----------------------------------------------------------------
 *   WAYFINDER_GOOGLE_API_KEY       — Gemini API key (required)
 *   WAYFINDER_GOOGLE_MODEL         — model id; defaults to gemini-2.5-flash
 *   WAYFINDER_GOOGLE_SEARCH_MODEL  — overrides only the discovery model
 *
 * COST: grounding with Google Search is a paid feature. On the Gemini "3.x"
 * line it includes 5,000 free search requests per month then $14 per 1,000; on
 * 2.5-era models it includes 1,500 grounded prompts/day on the paid tier then
 * $35 per 1,000. There is no free tier for the Search tool. Account setup, key
 * creation and billing are documented in .env.example and README.md. This
 * adapter does not assume the key exists and degrades to the curated directory
 * and the other providers when it does not.
 */

import "server-only";

import { z } from "zod";

import { cachedFetch, type CachedFetchOutcome } from "@/lib/core/cache";
import { fetchJson } from "@/lib/core/http";
import { nowIso } from "@/lib/core/time";
import type { DataState, SourceRef } from "@/lib/core/types";
import type { Translate } from "@/lib/i18n/translator";
import type { Provider, ProviderContext } from "../provider";
import type {
  AssistanceCategory,
  AssistanceQuery,
  ProviderReport,
  SearchFinding,
} from "../types";

const GOOGLE_SEARCH_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
export const GOOGLE_PROVIDER_ID = "google-discovery";

/**
 * The slice of the Gemini response this adapter reads.
 *
 * Grounding chunks are `{ web: { uri, title, domain } }`; the model's text is
 * used only as rationale for the *human* reading the page, never parsed into
 * facts. Everything optional, because grounding is only present when the model
 * actually searched.
 */
const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional() })).optional(),
          })
          .optional(),
        groundingMetadata: z
          .object({
            webSearchQueries: z.array(z.string()).optional(),
            groundingChunks: z
              .array(
                z.object({
                  web: z
                    .object({
                      uri: z.string().optional(),
                      title: z.string().optional(),
                      domain: z.string().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

/** Reads the Google key from the server environment. Never logged, never client. */
function googleApiKey(): string | undefined {
  const value = process.env.WAYFINDER_GOOGLE_API_KEY?.trim();
  return value ? value : undefined;
}

function googleModel(): string {
  return (
    process.env.WAYFINDER_GOOGLE_SEARCH_MODEL?.trim() ||
    process.env.WAYFINDER_GOOGLE_MODEL?.trim() ||
    "gemini-2.5-flash"
  );
}

export function isGoogleDiscoveryConfigured(): boolean {
  return googleApiKey() !== undefined;
}

/**
 * Domains that are, or are overwhelmingly likely to be, the responsible
 * authority. Used only to *label* a lead as plausibly official — never to claim
 * its content was verified. A `.gov`, `.gov.uk`, `.go.jp`, `.gouv.fr` and their
 * like are government second-level domains; `.gov` style suffixes are what a
 * reader recognises as official.
 */
const OFFICIAL_DOMAIN_PATTERNS: RegExp[] = [
  /\.gov(\.[a-z]{2})?$/i,
  /\.gob(\.[a-z]{2})?$/i,
  /\.gouv(\.[a-z]{2})?$/i,
  /\.go(\.[a-z]{2})?$/i,
  /\.govt(\.[a-z]{2})?$/i,
  /^([a-z0-9-]+\.)*gov\.[a-z]{2}$/i,
  /\.mil(\.[a-z]{2})?$/i,
  /\.int$/i,
  /\.europa\.eu$/i,
  /\.govt\.nz$/i,
  /\.gc\.ca$/i,
  /\.gov\.hk$/i,
  /\.gov\.sg$/i,
  /\.gov\.in$/i,
  /\.gov\.au$/i,
];

export function looksOfficial(domain: string): boolean {
  const d = domain.toLowerCase().trim();
  if (!d) return false;
  return OFFICIAL_DOMAIN_PATTERNS.some((pattern) => pattern.test(d));
}

/** Extracts a bare domain from a URL, tolerating the redirector Google uses. */
function domainFromUrl(url: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback.trim().toLowerCase();
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

/**
 * Builds the question put to Google. It carries the traveller's own words, the
 * place and the category, and it asks specifically for the authority's page —
 * which is what makes the discovered leads useful rather than generic.
 */
function buildSearchPrompt(query: AssistanceQuery): string {
  const where = [query.city, query.region, query.countryCode].filter(Boolean).join(", ");
  const categoryWords: Record<AssistanceCategory, string> = {
    flights: "flight cancellations, delays and airport operations",
    metro: "metro, subway and urban rail service status",
    rail: "train and rail service status",
    bus: "bus and coach service status",
    road: "road closures, traffic incidents and diversions",
    weather: "severe weather warnings and public safety advisories",
    stranded: "travel disruption, accommodation and onward transport",
    public_service: "public service notices and office or service interruptions",
    other: "public disruption affecting travellers",
  };
  const network = query.network ? ` Specifically: ${query.network}.` : "";
  const description = query.description ? ` The traveller reports: "${query.description}".` : "";
  const today = new Date().toISOString().slice(0, 10);

  return [
    `Find the official pages that report current ${categoryWords[query.category]} for ${where || "the traveller's location"}.`,
    network + description,
    `Today is ${today}. Prefer the responsible government authority, transport operator or emergency service for that place.`,
    "Return the most relevant official and reputable pages. Do not speculate about conditions and do not state a status; only identify pages worth checking.",
  ].join(" ");
}

/**
 * The discovery provider.
 *
 * It declares no live capabilities: it cannot say whether a service is running,
 * only which pages talk about it. Its `supports` is intentionally broad — it is
 * the provider that covers the whole world the curated directory does not — but
 * it is selected *after* the authoritative live providers, so a place London's
 * TfL covers is answered by TfL first and Google only adds leads.
 */
export const googleDiscoveryProvider: Provider = {
  metadata: {
    id: GOOGLE_PROVIDER_ID,
    name: "Google web discovery (Gemini with Google Search)",
    organization: "Google",
    url: "https://ai.google.dev/gemini-api/docs/google-search",
    official: false,
    categories: [
      "flights",
      "metro",
      "rail",
      "bus",
      "road",
      "weather",
      "stranded",
      "public_service",
      "other",
    ],
    cadence: "live",
    coverage: { countries: [], areas: ["Worldwide"], nationwide: true },
    capabilities: {
      // It discovers pages; it does not report statuses. Every capability that
      // would let a search result become a fact is off, on purpose.
      serviceAlerts: false,
      lineStatus: false,
      schedule: false,
      realtime: false,
      weatherWarnings: false,
      emergencyNotices: false,
      roadEvents: false,
      publicNotices: false,
    },
    requiredEnv: ["WAYFINDER_GOOGLE_API_KEY"],
    limitations: [
      "Returns pages relevant to a situation, not the situation itself. A discovered page has not been read or verified.",
      "Requires a Google Gemini API key with billing; search grounding has no free tier.",
      "Search result ordering reflects Google's index, not an authority's ranking.",
    ],
  },

  supports(query) {
    // It can attempt any category anywhere. It is a discovery layer, so it does
    // not gate on geography; if the key is absent the registry skips it with a
    // "needs_credentials" reason and everything else still works.
    return this.metadata.categories.includes(query.category);
  },

  async query(query, context) {
    const retrievedAt = nowIso();
    const key = googleApiKey();
    const model = googleModel();
    const prompt = buildSearchPrompt(query);

    const baseSource: SourceRef = {
      id: GOOGLE_PROVIDER_ID,
      organization: "Google",
      title: "Google Search results (via Gemini grounding)",
      url: "https://ai.google.dev/gemini-api/docs/google-search",
      retrievedAt,
      tier: "secondary",
      kind: "public_notice",
      state: "unavailable",
    };

    // Without a key this provider is skipped by the registry before it is ever
    // called; this guard makes the failure honest if it is called directly.
    if (!key) {
      return {
        providerId: GOOGLE_PROVIDER_ID,
        state: "unavailable",
        cadence: "live",
        conditions: [],
        timetable: [],
        source: { ...baseSource, note: safeT(context.t, "assist.discovery.notConfigured") },
        warnings: [safeT(context.t, "assist.discovery.notConfigured")],
        retrievedAt,
        findings: [],
      };
    }

    // Cache discovery results for a few minutes. Google charges per search and
    // the answer to "which pages are relevant here" does not change second to
    // second, so this is both cheaper and kinder to the quota.
    const cacheKey = `google-discovery:${model}:${prompt}`;
    let outcome: CachedFetchOutcome<unknown> | undefined;
    let failure: string | undefined;
    try {
      outcome = await cachedFetch<unknown>(
        cacheKey,
        async () => {
          const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            // Grounding with the Search tool is incompatible with a hard JSON
            // response format, so the structured data comes from groundingMetadata
            // rather than from the model's prose.
            generationConfig: { temperature: 0.1 },
          };
          const result = await fetchJson<unknown>(
            `${GOOGLE_SEARCH_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              body,
              timeoutMs: 12_000,
              retries: 1,
              signal: context.signal,
              fetchImpl: context.fetchImpl,
              headers: { "x-goog-api-key": key },
            },
          );
          return { data: result.data, retrievedAt: result.retrievedAt, notModified: false };
        },
        { ttlMs: 5 * 60_000 },
      );
    } catch (error) {
      // A discovery failure must never break the page: the live providers and
      // the directory still answer. Surface it as a warning instead. The
      // upstream message is not echoed, because it can contain credential hints.
      failure = error instanceof Error ? error.name : "unknown";
    }

    const failed = failure !== undefined || outcome?.refreshFailed === true;
    const state: DataState = failed
      ? "unavailable"
      : outcome?.freshness === "live"
        ? "live"
        : "cached";

    const findings = failed || !outcome ? [] : normaliseFindings(outcome.value, retrievedAt);

    const warnings: string[] = [];
    if (failed) {
      warnings.push(safeT(context.t, "assist.discovery.unreachable"));
    } else if (findings.length === 0) {
      warnings.push(safeT(context.t, "assist.discovery.noResults"));
    }

    return {
      providerId: GOOGLE_PROVIDER_ID,
      state,
      cadence: "live",
      conditions: [],
      timetable: [],
      source: {
        ...baseSource,
        state,
        note: safeT(context.t, "assist.discovery.note"),
      },
      warnings,
      retrievedAt,
      findings,
    };
  },
};

/** Turns a grounded Gemini response into deduplicated, URL-preserving findings. */
export function normaliseFindings(payload: unknown, discoveredAt: string): SearchFinding[] {
  const parsed = geminiResponseSchema.safeParse(payload);
  if (!parsed.success) return [];

  const chunks = parsed.data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const findings: SearchFinding[] = [];

  for (const chunk of chunks) {
    const url = chunk.web?.uri?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const domain = domainFromUrl(url, chunk.web?.domain);
    const title = chunk.web?.title?.trim() || domain;
    findings.push({
      id: `google-${findings.length}-${domain}`,
      organization: title,
      title,
      url,
      domain,
      discoveredAt,
      reason: safeString(chunk.web?.title),
      verification: "discovered",
      likelyOfficial: looksOfficial(domain),
    });
    // A handful is enough to be useful without becoming a wall of links.
    if (findings.length >= 6) break;
  }

  return findings;
}

function safeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function safeT(t: Translate, key: string, params?: Record<string, string | number>): string {
  const value = t(key, params);
  return value === key ? key : value;
}
