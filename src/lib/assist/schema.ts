/**
 * Validation for the generic assistance endpoint.
 *
 * Mirrored on the flight schema's discipline: every value crossing the network
 * is parsed here, every issue message is a translation key, and there is no
 * field for passport, payment or password data because ordinary assistance
 * never needs it.
 */

import { z } from "zod";

import { translate } from "@/lib/i18n/messages";
import type { LocaleCode } from "@/lib/i18n/locales";

export const ASSIST_CATEGORIES = [
  "flights",
  "metro",
  "rail",
  "bus",
  "road",
  "weather",
  "stranded",
  "public_service",
  "other",
] as const;

export const assistCategorySchema = z.enum(ASSIST_CATEGORIES);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((value) => (value === "" ? undefined : value));

const optionalCountryCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value === "" || /^[A-Z]{2}$/.test(value), {
    message: "validation.countryCodeFormat",
  })
  .optional()
  .or(z.literal(""))
  .transform((value) => (value === "" ? undefined : value));

export const assistRequestSchema = z
  .object({
    category: assistCategorySchema,
    countryCode: optionalCountryCode,
    region: optionalText(80),
    city: optionalText(80),
    /**
     * A single free-text location, as a person would type it: "Lagos, Nigeria",
     * "Ikeja, Lagos, Nigeria", "Tokyo, Japan". This is the field the flow now
     * uses; the structured fields above remain supported so existing callers and
     * the flight flow keep working.
     */
    location: optionalText(160),
    network: optionalText(120),
    from: optionalText(120),
    to: optionalText(120),
    description: optionalText(2_000),
    locale: z.string().trim().min(2).max(10).default("en"),
  })
  .refine(
    // A location or a description is required: without either there is nothing
    // to retrieve, and we would rather say so than return an empty page.
    (value) =>
      Boolean(
        value.location || value.countryCode || value.city || value.description || value.from,
      ),
    { message: "validation.assistLocationRequired", path: ["location"] },
  );

export type AssistRequest = z.infer<typeof assistRequestSchema>;

/**
 * Turns a Zod error into field-keyed, localized messages the form can show
 * inline. Zod's own "Required" default is mapped to a translated key.
 */
export function assistFieldErrors(
  error: z.ZodError,
  locale: LocaleCode = "en",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (result[key]) continue;
    result[key] = issue.message.startsWith("validation.")
      ? translate(locale, issue.message)
      : translate(locale, "validation.required");
  }
  return result;
}
