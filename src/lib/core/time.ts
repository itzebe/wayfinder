/** Time helpers. All stored timestamps are ISO-8601 UTC strings. */

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: string | number | Date | undefined | null): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Unix seconds (as used by aviationweather.gov) to ISO-8601 UTC. */
export function unixSecondsToIso(seconds: number | undefined | null): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

export function isValidIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

/** Compact relative age, e.g. "just now", "4 min ago", "2 hr ago". */
export function relativeAge(iso: string | undefined, reference: number = Date.now()): string {
  if (!iso) return "unknown";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diff = reference - then;
  if (diff < 0) return "in the future";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function minutesBetween(from: string | undefined, to: string | undefined): number | undefined {
  if (!from || !to) return undefined;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.round((b - a) / 60_000);
}

export function addMinutes(iso: string, minutes: number): string | undefined {
  const base = Date.parse(iso);
  if (Number.isNaN(base)) return undefined;
  return new Date(base + minutes * 60_000).toISOString();
}

/**
 * Formats an instant in a specific IANA time zone with an explicit zone label,
 * so an airport-local time can never be mistaken for the traveller's own.
 */
export function formatInZone(
  iso: string | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
      ...options,
    }).format(date);
  } catch {
    return undefined;
  }
}

/** Short zone abbreviation for an airport, e.g. "BST" for Europe/London in July. */
export function zoneAbbreviation(iso: string | undefined, timeZone: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value;
  } catch {
    return undefined;
  }
}

export function formatDateInZone(iso: string | undefined, timeZone: string): string | undefined {
  return formatInZone(iso, timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Signed UTC offset for a zone at a given instant, e.g. "+01:00". */
export function zoneOffset(iso: string, timeZone: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = raw.match(/GMT([+-]\d{2}:\d{2})?/);
    return match?.[1] ?? "+00:00";
  } catch {
    return undefined;
  }
}

export function isSameUtcDay(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.slice(0, 10) === b.slice(0, 10);
}

/**
 * Coarse IANA zone inference from an airport's country code. Aviation weather
 * data does not carry a time zone, so we fall back to the country's primary zone
 * and always label the result, never silently presenting it as exact.
 */
export function inferTimeZone(countryCode: string | undefined): string | undefined {
  if (!countryCode) return undefined;
  return COUNTRY_PRIMARY_ZONE[countryCode.toUpperCase()];
}

const COUNTRY_PRIMARY_ZONE: Record<string, string> = {
  US: "America/New_York",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  IT: "Europe/Rome",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  GR: "Europe/Athens",
  TR: "Europe/Istanbul",
  RU: "Europe/Moscow",
  UA: "Europe/Kyiv",
  AE: "Asia/Dubai",
  QA: "Asia/Qatar",
  SA: "Asia/Riyadh",
  IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  LK: "Asia/Colombo",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  TW: "Asia/Taipei",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  ID: "Asia/Jakarta",
  PH: "Asia/Manila",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg",
  EG: "Africa/Cairo",
  KE: "Africa/Nairobi",
  NG: "Africa/Lagos",
  MA: "Africa/Casablanca",
  ET: "Africa/Addis_Ababa",
};
