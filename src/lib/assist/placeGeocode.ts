/**
 * Bare-place geocoding.
 *
 * `location.ts` resolves places from a curated table, which covers the names
 * people type most often. The world is larger than any list we can keep by hand:
 * "Reykjavik", "Doha" and "Kathmandu" all fell through it, and a traveller who
 * typed one was told no source covers their country — for a place the global
 * weather source covers perfectly. That is a false statement about coverage, and
 * it is the failure this module exists to remove.
 *
 * The lookup is the same free, keyless, GeoNames-backed geocoder the weather
 * provider already uses. Three rules keep it honest:
 *
 *   1. Only an *exact* name match is considered. A geocoder result named
 *      something else is a different place and is discarded, so another city's
 *      country can never be attached to this query.
 *   2. A single matching country resolves. Several matching countries resolve
 *      only when the most populous exact match clearly dominates the rest (see
 *      `DOMINANCE_RATIO`), which is how a capital like Doha resolves to Qatar
 *      while a genuinely shared name like Salem does not.
 *   3. Anything else — several plausible countries, no match, a network or rate
 *      limit failure, an unexpected payload — returns no answer. The caller then
 *      keeps its existing honest "we could not place this" behaviour. A failure
 *      to reach the geocoder must never become a guess.
 *
 * The curated table always wins: this runs only for a name the table did not
 * already resolve, so "San Jose" still offers its choices rather than being
 * decided by population.
 */

import { z } from "zod";

import { cachedFetch } from "@/lib/core/cache";
import { fetchJson } from "@/lib/core/http";
import { countryName, resolveLocation, type ResolvedLocation } from "./location";

const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

/** A city does not move, so a resolved name is cached for a day. */
const GEOCODE_TTL_MS = 24 * 60 * 60_000;

/**
 * How far the most populous exact match must lead the next *different-country*
 * match before we accept it without asking: an order of magnitude.
 *
 * This is a principle, not a tuned constant. Measured against the live geocoder
 * the two populations separate cleanly around it — capitals and unique cities
 * lead their namesakes by 33× to 8500× (Doha 45×, Alexandria 33×, Quito 8500×),
 * while genuinely shared names sit at 1.1× to 7.9× (Cambridge 1.1×, Toledo 1.7×,
 * Barcelona 2.1×, Colombo 2.8×, Salem 5.2×, San Jose 7.0×). Nothing observed
 * lands between 8× and 33×, so the threshold sits in open space rather than on a
 * boundary. It also agrees with the curated table, which independently treats
 * "San Jose" as ambiguous — two sources reaching the same verdict.
 */
const DOMINANCE_RATIO = 10;

const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        country_code: z.string().optional(),
        country: z.string().optional(),
        population: z.number().optional(),
      }),
    )
    .optional(),
});

export interface PlaceCountryMatch {
  countryCode: string;
  countryName: string;
  /** The largest exact-match population found for this country. */
  population: number;
}

/** Strips diacritics, punctuation and case so "Reykjavík" == "Reykjavik". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The distinct countries whose place matches the requested name exactly, each
 * carrying its largest population, most populous first.
 */
function collectMatches(
  payload: z.infer<typeof geocodeSchema>,
  requested: string,
): PlaceCountryMatch[] {
  const wanted = fold(requested);
  const byCountry = new Map<string, PlaceCountryMatch>();

  for (const result of payload.results ?? []) {
    if (fold(result.name) !== wanted) continue;
    const code = result.country_code?.toUpperCase();
    if (!code) continue;
    const population = typeof result.population === "number" ? result.population : 0;
    const existing = byCountry.get(code);
    if (existing) {
      existing.population = Math.max(existing.population, population);
      continue;
    }
    byCountry.set(code, {
      countryCode: code,
      // Our own display name is preferred so the page reads "United Kingdom"
      // rather than whatever string the geocoder happens to return.
      countryName: countryName(code) ?? result.country ?? code,
      population,
    });
  }

  return [...byCountry.values()].sort((a, b) => b.population - a.population);
}

/**
 * Looks up the countries a bare place name could belong to, most populous first.
 *
 * Resolves to `[]` on any failure. An empty result means "we do not know", which
 * the caller must treat as unknown rather than as "no country".
 */
export async function lookupPlaceCountries(
  name: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<PlaceCountryMatch[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  try {
    const outcome = await cachedFetch<PlaceCountryMatch[]>(
      `open-meteo:place-countries:${fold(trimmed)}`,
      async () => {
        const params = new URLSearchParams({
          name: trimmed,
          count: "10",
          language: "en",
          format: "json",
        });
        const result = await fetchJson<unknown>(`${GEOCODING_ENDPOINT}?${params.toString()}`, {
          timeoutMs: 6_000,
          retries: 1,
          fetchImpl: options.fetchImpl,
        });
        const parsed = geocodeSchema.safeParse(result.data);
        const matches = parsed.success ? collectMatches(parsed.data, trimmed) : [];
        return { data: matches, retrievedAt: result.retrievedAt, notModified: false };
      },
      { ttlMs: GEOCODE_TTL_MS },
    );
    return outcome.value ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolves a free-text location, consulting the geocoder only for a bare place
 * name the curated table could not place.
 *
 * The table is tried first and its answer is final — including its refusal to
 * choose between "San Jose" and the like. Only a name that resolved to no
 * country at all, with no country part the traveller actually typed, reaches the
 * geocoder. A name whose country part we could not match is left alone: the
 * traveller named a country we do not recognise, and overriding that with a
 * geocoder guess would be inventing a fact.
 */
export async function resolveLocationWithGeocoder(
  input: string | undefined,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<ResolvedLocation> {
  const resolved = resolveLocation(input);

  if (resolved.countryCode) return resolved;
  if ((resolved.countryAlternatives?.length ?? 0) > 0) return resolved;
  if (resolved.countryUnrecognised) return resolved;

  const name = resolved.city?.trim();
  if (!name) return resolved;

  const matches = await lookupPlaceCountries(name, options);
  if (matches.length === 0) return resolved;

  if (matches.length === 1) {
    return { ...resolved, countryCode: matches[0].countryCode, countryInferred: true };
  }

  const [first, second] = matches;
  // Resolve without asking only when the leading country's place clearly
  // dominates. Equal or unknown populations mean we cannot tell, so the
  // traveller is offered the choices instead.
  if (first.population > 0 && first.population >= second.population * DOMINANCE_RATIO) {
    return { ...resolved, countryCode: first.countryCode, countryInferred: true };
  }

  return { ...resolved, countryAlternatives: matches };
}
