/**
 * Generic assistance API.
 *
 * POST /api/assist
 *   Builds a situation page for any non-flight category from a validated
 *   request. Like the flight endpoint it is `no-store` and persists nothing
 *   server-side: the request answers this one call and the client owns any
 *   storage.
 *
 * GET /api/assist
 *   Reports the current provider coverage so the interface can state which
 *   regions and categories actually have live integrations — rather than
 *   implying global coverage.
 */

import { NextResponse } from "next/server";

import { composeAssistance } from "@/lib/assist/engine";
import { assistRequestSchema, assistFieldErrors } from "@/lib/assist/schema";
import { providerCatalogue, providersForCategory, countryLevelCoverage } from "@/lib/assist/registry";
import { categoriesWithProviders, supportedCountries, CATEGORY_ORDER } from "@/lib/assist/categories";
import { clearCache } from "@/lib/core/cache";
import { translate } from "@/lib/i18n/messages";
import { isLocaleCode, DEFAULT_LOCALE } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LocaleCode = Parameters<typeof translate>[0];

function localeFrom(payload: unknown): LocaleCode {
  if (
    payload &&
    typeof payload === "object" &&
    "locale" in payload &&
    isLocaleCode((payload as { locale?: unknown }).locale)
  ) {
    return (payload as { locale: LocaleCode }).locale;
  }
  return DEFAULT_LOCALE;
}

/** Guards a single client from hammering the upstream providers. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  requestLog.set(key, recent);

  if (requestLog.size > 5_000) {
    for (const [entryKey, timestamps] of requestLog) {
      if (timestamps.every((timestamp) => now - timestamp > RATE_LIMIT_WINDOW_MS)) {
        requestLog.delete(entryKey);
      }
      if (requestLog.size <= 4_000) break;
    }
  }

  return recent.length > RATE_LIMIT_MAX;
}

export async function GET() {
  const catalogue = providerCatalogue().map((metadata) => ({
    id: metadata.id,
    name: metadata.name,
    organization: metadata.organization,
    url: metadata.url,
    official: metadata.official,
    categories: metadata.categories,
    cadence: metadata.cadence,
    countries: metadata.coverage.countries,
    areas: metadata.coverage.areas,
    nationwide: metadata.coverage.nationwide,
    capabilities: metadata.capabilities,
    requiredEnv: metadata.requiredEnv,
    limitations: metadata.limitations,
  }));

  return NextResponse.json(
    {
      categories: CATEGORY_ORDER.map((category) => ({
        id: category,
        providers: providersForCategory(category).map((provider) => provider.metadata.id),
        // A category is only "available" when a provider that serves it exists.
        available: providersForCategory(category).length > 0,
      })),
      categoriesWithProviders: categoriesWithProviders(),
      supportedCountries: supportedCountries(),
      // Which countries each category can answer from a country name alone.
      // Derived from the providers' own supports(), so the interface can ask for
      // a city immediately instead of after a round trip — and cannot disagree
      // with the engine about what needs one.
      countryLevelCoverage: countryLevelCoverage(),
      providers: catalogue,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: translate(DEFAULT_LOCALE, "error.invalidJson") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const locale = localeFrom(payload);

  if (isRateLimited(clientKey)) {
    return NextResponse.json(
      { error: translate(locale, "error.rateLimited") },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
    );
  }

  const parsed = assistRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: translate(locale, "error.invalidRequest"),
        fields: assistFieldErrors(parsed.error, locale),
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const page = await composeAssistance(parsed.data);
    return NextResponse.json({ assistance: page }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[wayfinder] assistance build failed:", error);
    return NextResponse.json(
      { error: translate(locale, "error.providerUnavailable") },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE() {
  clearCache();
  return NextResponse.json({ cleared: true }, { headers: { "Cache-Control": "no-store" } });
}
