/**
 * Input validation.
 *
 * Every value that crosses the network boundary is parsed here before it reaches
 * any provider or the UI. The schema deliberately has no field for passport
 * numbers, payment details, passwords or any other sensitive identifier —
 * ordinary assistance never needs them.
 *
 * Issue messages are message *keys*, not English sentences, so the API can
 * render them in the traveller's own language via `fieldErrors(error, locale)`.
 */

import { z } from "zod";

import { translate } from "@/lib/i18n/messages";
import type { LocaleCode } from "@/lib/i18n/locales";

export const ASSISTANCE_NEEDS = [
  "cancelled",
  "delayed",
  "connection",
  "gate_change",
  "announcement",
  "options",
  "other",
] as const;

export const assistanceNeedSchema = z.enum(ASSISTANCE_NEEDS);

/** Normalises a flight number to compact upper case, e.g. " ba 123 " → "BA123". */
export function normaliseFlightNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function normaliseAirportCode(value: string): string {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase();
}

const flightNumber = z
  .string()
  .trim()
  .transform(normaliseFlightNumber)
  .refine((value) => /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(value), {
    message: "validation.flightNumberFormat",
  });

const optionalAirportCode = z
  .string()
  .trim()
  .transform(normaliseAirportCode)
  .refine((value) => value === "" || /^[A-Z]{3,4}$/.test(value), {
    message: "validation.airportFormat",
  })
  .optional()
  .or(z.literal(""));

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), {
    message: "validation.dateInvalid",
  })
  .optional()
  .or(z.literal(""));

const optionalFlightNumber = z
  .string()
  .trim()
  .transform(normaliseFlightNumber)
  .refine((value) => value === "" || /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(value), {
    message: "validation.connectionFlightNumberFormat",
  })
  .optional()
  .or(z.literal(""));

const optionalBookingReference = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value === "" || /^[A-Z0-9]{6}$/.test(value), {
    message: "validation.bookingReferenceFormat",
  })
  .optional()
  .or(z.literal(""));

const optionalMinutes = z
  .union([z.coerce.number().int().min(0).max(2_880), z.literal("")])
  .optional();

export const situationRequestSchema = z.object({
  need: assistanceNeedSchema,
  flightNumber,
  travelDate: optionalDate,
  originAirport: optionalAirportCode,
  destinationAirport: optionalAirportCode,
  connectionAirport: optionalAirportCode,
  connectionFlightNumber: optionalFlightNumber,
  connectionMinutes: optionalMinutes,
  bookingReference: optionalBookingReference,
  locale: z.string().trim().min(2).max(10).default("en"),
  description: z.string().trim().max(2_000).optional(),
});

export type SituationRequest = z.infer<typeof situationRequestSchema>;

export const announcementRequestSchema = z.object({
  text: z.string().trim().min(3, "validation.announcementRequired").max(4_000),
  locale: z.string().trim().min(2).max(10).default("en"),
});

export type AnnouncementRequest = z.infer<typeof announcementRequestSchema>;

export const refreshRequestSchema = situationRequestSchema.omit({
  bookingReference: true,
  description: true,
});

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/**
 * Turns a Zod error into field-keyed messages the form can render inline.
 * Messages explain how to recover, not just what failed. Issue messages are
 * translation keys, resolved here so the API can answer in any locale.
 */
export function fieldErrors(
  error: z.ZodError,
  locale: LocaleCode = "en",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (result[key]) continue;
    // Every schema issue should carry a message key. Zod's own defaults (most
    // notably "Required" for a missing value) are English sentences that would
    // otherwise surface untranslated, so map those to a localized key.
    result[key] = issue.message.startsWith("validation.")
      ? translate(locale, issue.message)
      : translate(locale, "validation.required");
  }
  return result;
}
