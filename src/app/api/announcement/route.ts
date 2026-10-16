/**
 * Announcement translation API.
 *
 * POST /api/announcement
 *   Translates and explains announcement text in the traveller's language.
 *
 * The text is treated strictly as data: it is length-limited, delimited in the
 * prompt, and the model is instructed to ignore any instructions inside it.
 */

import { NextResponse } from "next/server";

import { translateAnnouncement } from "@/lib/ai/interpret";
import { announcementRequestSchema, fieldErrors } from "@/lib/validation/schemas";
import { getLocaleMeta, isLocaleCode, DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { LocaleCode } from "@/lib/i18n/locales";
import { translate } from "@/lib/i18n/messages";

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

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ar: "Arabic",
  zh: "Simplified Chinese",
  ja: "Japanese",
  hi: "Hindi",
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: translate(DEFAULT_LOCALE, "error.invalidJson") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requestedLocale = localeFrom(payload);

  const parsed = announcementRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: translate(requestedLocale, "error.announcementUnreadable"),
        fields: fieldErrors(parsed.error, requestedLocale),
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }

  const locale = isLocaleCode(parsed.data.locale) ? parsed.data.locale : DEFAULT_LOCALE;
  const meta = getLocaleMeta(locale);

  const result = await translateAnnouncement(
    parsed.data.text,
    LANGUAGE_NAMES[locale] ?? meta.name,
  );

  return NextResponse.json(
    { ...result, locale },
    { headers: { "Cache-Control": "no-store" } },
  );
}
