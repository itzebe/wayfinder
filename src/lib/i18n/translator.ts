/**
 * Server-side message lookup.
 *
 * The situation page is composed on the server, so its generated prose has to be
 * translated there rather than in the browser. `createTranslator` binds the
 * message catalogue to a locale and returns the same `t` signature the client
 * components use, which keeps one wording source for both sides.
 *
 * Operational identifiers — flight numbers, airport codes, times, gates — are
 * always passed as parameters and substituted verbatim, so switching language
 * can never alter them.
 */

import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from "./locales";
import { translate } from "./messages";

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function createTranslator(locale: string | undefined): {
  locale: LocaleCode;
  t: Translate;
} {
  const resolved: LocaleCode = isLocaleCode(locale) ? locale : DEFAULT_LOCALE;
  return {
    locale: resolved,
    t: (key, params) => translate(resolved, key, params),
  };
}
