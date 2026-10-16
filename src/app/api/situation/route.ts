/**
 * Situation API.
 *
 * POST /api/situation
 *   Builds a situation page from a validated request.
 *
 * The route is `no-store` and never persists traveller data server-side: the
 * request is used to answer this one call, and the client owns any storage.
 */

import { NextResponse } from "next/server";

import { composeSituation } from "@/lib/situation/compose";
import { situationRequestSchema, fieldErrors } from "@/lib/validation/schemas";
import { clearCache } from "@/lib/core/cache";
import { translate } from "@/lib/i18n/messages";
import { isLocaleCode, DEFAULT_LOCALE } from "@/lib/i18n/locales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads the requested locale from a raw payload, if it is a usable locale code. */
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

type LocaleCode = Parameters<typeof translate>[0];

/** Guards against a single client hammering the upstream providers. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const requestLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  requestLog.set(key, recent);

  if (requestLog.size > 5_000) {
    // Bound memory: drop the oldest entries.
    for (const [entryKey, timestamps] of requestLog) {
      if (timestamps.every((timestamp) => now - timestamp > RATE_LIMIT_WINDOW_MS)) {
        requestLog.delete(entryKey);
      }
      if (requestLog.size <= 4_000) break;
    }
  }

  return recent.length > RATE_LIMIT_MAX;
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

  const parsed = situationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: translate(locale, "error.invalidRequest"),
        fields: fieldErrors(parsed.error, locale),
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { bookingReference, ...rest } = parsed.data;

  // The empty-string case for optional numeric fields is normalised away so the
  // composition layer only ever sees numbers or nothing at all.
  const input = {
    ...rest,
    connectionMinutes:
      typeof rest.connectionMinutes === "number" ? rest.connectionMinutes : undefined,
  };

  try {
    const situation = await composeSituation(input);
    return NextResponse.json(
      { situation, bookingReference: bookingReference || undefined },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Log the detail server-side, return something actionable to the traveller.
    console.error("[wayfinder] situation build failed:", error);
    return NextResponse.json(
      { error: translate(locale, "error.providerUnavailable") },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/**
 * DELETE /api/situation
 * Clears the server-side provider cache. Used by the "delete my data" action so
 * a traveller's request also drops any cached upstream response tied to it.
 */
export async function DELETE() {
  clearCache();
  return NextResponse.json(
    { cleared: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
