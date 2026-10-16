/**
 * Immediate recognition of a bare country name.
 *
 * "Iceland" names no place to look up, so no source can answer it and the page
 * must ask for a city. The engine knows this, but only after a round trip — on
 * production that is 0.3–1.2s of skeleton before the prompt appears, and the
 * traveller is left staring at a spinner to be asked a question we already knew
 * we were going to ask.
 *
 * This module decides the same thing on the client, from data the server
 * publishes, so the prompt appears at the earliest reliable point.
 *
 * Two rules keep it honest:
 *
 *   1. It never decides *coverage* — only whether a place is needed. Whether a
 *      source actually covers a place, and what it reports, stays the engine's
 *      judgement. A country this module declines to preempt is always sent to
 *      the server as before.
 *   2. It only preempts a request that carries nothing but a country name. Some
 *      providers decide coverage from the traveller's own words, and a client
 *      cannot evaluate those. A request with a description, network or route is
 *      therefore always sent to the server.
 *
 * The signal it consumes — which countries each category can answer with no
 * place — is derived on the server from the providers' own `supports()`
 * functions (see `countryLevelCoverage`), so the interface cannot disagree with
 * the engine about what needs a place.
 */

import { countryName, resolveLocation } from "./location";
import type { AssistanceCategory } from "./types";

/** Category -> country codes that can be answered from the country name alone. */
export type CountryLevelCoverage = Record<string, string[]>;

/** The minimum of a request this decision depends on. */
export interface CountryHintInput {
  category: AssistanceCategory;
  location?: string;
  description?: string;
  network?: string;
  from?: string;
  to?: string;
}

/**
 * The country a request names on its own, or `undefined` when the request is not
 * a bare country name at all.
 *
 * This part needs no published coverage, so a caller can ask "could this query
 * need a place?" before the coverage arrives — which is what lets a bare country
 * wait one tick for it while a city query proceeds without waiting.
 */
export function bareCountryOf(
  request: CountryHintInput,
): { countryCode: string; countryName: string } | undefined {
  // The traveller's own words can change which providers apply, and only the
  // server holds them. Anything beyond a bare place name goes to the engine.
  const freeText = [request.description, request.network, request.from, request.to];
  if (freeText.some((value) => (value ?? "").trim().length > 0)) return undefined;

  const resolved = resolveLocation(request.location);
  // A country is needed, and nothing inside it was named. A city or region in
  // the same string means the request is already specific.
  if (!resolved.countryCode || resolved.city || resolved.region) return undefined;
  // An ambiguous name has its own prompt; do not answer for it here.
  if (resolved.countryAlternatives?.length) return undefined;

  return {
    countryCode: resolved.countryCode,
    countryName: countryName(resolved.countryCode) ?? resolved.countryCode,
  };
}

/**
 * The country a request names on its own, when that country has no source that
 * can answer without a place. `undefined` means "do not preempt — ask the
 * server", which is the safe answer for anything this module cannot decide.
 *
 * `coverage` being absent (not yet loaded, or the fetch failed) also yields
 * `undefined`, so a missing catalogue can only ever cost the shortcut, never
 * produce a wrong prompt.
 */
export function needsPlacePrompt(
  request: CountryHintInput,
  coverage: CountryLevelCoverage | undefined,
): { countryCode: string; countryName: string } | undefined {
  if (!coverage) return undefined;

  const bare = bareCountryOf(request);
  if (!bare) return undefined;

  const answerable = coverage[request.category] ?? [];
  if (answerable.includes(bare.countryCode.toUpperCase())) return undefined;

  return bare;
}

/**
 * The published country-level coverage, fetched once per session.
 *
 * The payload is a few kilobytes of country codes and is served `no-store`, so
 * the promise is cached for the tab's lifetime: the support form and the
 * situation page share one request, and a remount does not repeat it.
 *
 * A failure resolves to `undefined`, which disables the shortcut rather than
 * guessing — the traveller then waits for the engine exactly as before.
 */
let coveragePromise: Promise<CountryLevelCoverage | undefined> | undefined;

export function loadCountryLevelCoverage(): Promise<CountryLevelCoverage | undefined> {
  coveragePromise ??= (async () => {
    try {
      const response = await fetch("/api/assist");
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { countryLevelCoverage?: CountryLevelCoverage };
      return payload.countryLevelCoverage;
    } catch {
      return undefined;
    }
  })();
  return coveragePromise;
}

/** Test seam: forget the cached payload. */
export function resetCountryLevelCoverage(): void {
  coveragePromise = undefined;
}
