/**
 * Locale registry.
 *
 * Guidance is generated as message keys with parameters rather than as
 * pre-rendered sentences. Operational identifiers (flight numbers, airport
 * codes, times, gates) are always parameters and are therefore never passed
 * through a translation step — they cannot be altered by switching language.
 */

export type LocaleCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "pt"
  | "ar"
  | "zh"
  | "ja"
  | "hi";

export interface LocaleMeta {
  code: LocaleCode;
  /** English name, for the language menu's accessible label. */
  name: string;
  /** Endonym — what speakers of the language call it. */
  nativeName: string;
  /** Text direction. */
  dir: "ltr" | "rtl";
  /** BCP-47 tag used for Intl formatting. */
  tag: string;
  /**
   * How much of the interface this catalogue actually translates.
   *
   * "partial" means untranslated strings fall back to English. The selector
   * says so rather than implying complete translation, because a traveller who
   * cannot read English needs to know before relying on it.
   */
  coverage: "full" | "partial";
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr", tag: "en-GB", coverage: "full" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr", tag: "es-ES", coverage: "full" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr", tag: "fr-FR", coverage: "partial" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr", tag: "de-DE", coverage: "partial" },
  { code: "pt", name: "Portuguese", nativeName: "Português", dir: "ltr", tag: "pt-PT", coverage: "partial" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl", tag: "ar", coverage: "partial" },
  { code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr", tag: "zh-Hans", coverage: "partial" },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr", tag: "ja-JP", coverage: "partial" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr", tag: "hi-IN", coverage: "partial" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export function getLocaleMeta(code: string | undefined): LocaleMeta {
  return (
    LOCALES.find((locale) => locale.code === code) ?? LOCALES[0]
  );
}

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === "string" && LOCALES.some((locale) => locale.code === value);
}

/** Normalises browser language tags such as "es-MX" down to a supported code. */
export function matchLocale(tag: string | undefined): LocaleCode | undefined {
  if (!tag) return undefined;
  const base = tag.toLowerCase().split("-")[0];
  const direct = LOCALES.find((locale) => locale.code === base);
  if (direct) return direct.code;
  if (base === "zh") return "zh";
  return undefined;
}
