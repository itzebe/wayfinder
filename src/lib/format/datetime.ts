import { relativeAge, formatInZone } from "@/lib/core/time";

/**
 * Display formatting for timestamps.
 *
 * Timestamps are rendered in the traveller's own device time zone by default,
 * because a traveller cares about "when can I act", not the publisher's zone.
 * Airport-local times are formatted separately and always labelled with their
 * zone so the two can never be confused.
 */

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = dateTimeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatterCache.set(key, formatter);
  }
  return formatter;
}

/** Compact relative age, e.g. "just now", "4 min ago". */
export function formatRelative(iso: string | undefined): string {
  return relativeAge(iso);
}

/** Date and time in the device's zone, e.g. "15 Oct 2026, 14:05". */
export function formatAbsolute(iso: string | undefined, locale = "en-GB"): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return getFormatter(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Time only, in the device's zone. Used in the update timeline. */
export function formatClock(iso: string | undefined, locale = "en-GB"): string {
  if (!iso) return "--:--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return getFormatter(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Airport-local time with an explicit zone label, e.g. "14:05 BST".
 * Always labelled, so an airport-local time is never mistaken for local time.
 */
export function formatAirportTime(
  iso: string | undefined,
  timeZone: string | undefined,
  zoneLabel?: string,
): string | undefined {
  if (!iso || !timeZone) return undefined;
  const time = formatInZone(iso, timeZone);
  if (!time) return undefined;
  return zoneLabel ? `${time} ${zoneLabel}` : `${time} (${timeZone})`;
}

/** Converts an ISO instant into the `datetime-local` input format. */
export function toDateTimeLocalValue(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Today's date as `YYYY-MM-DD`, used to prefill the travel-date field. */
export function todayDateValue(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
