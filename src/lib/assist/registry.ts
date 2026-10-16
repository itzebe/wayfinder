/**
 * Provider registry and selection.
 *
 * The single place that knows which providers exist. Category adapters ask the
 * registry for the providers that can serve a query; they never enumerate
 * providers themselves. Adding a country, a city or an operator is an addition
 * here plus one adapter file — no changes to the request handler or the UI.
 *
 * `selectProviders` is deliberately conservative: a provider is only used when
 * it declares the category, covers the geography, and has whatever credentials
 * it needs. Anything skipped is reported with a machine-readable reason so the
 * traveller can be told *why* a source was not used.
 */

import { hasCredentials, type Provider, type ProviderSkipReason } from "./provider";
import { bartProvider, mtaSubwayProvider, tflBusProvider, tflRailProvider, tflTubeProvider } from "./providers/transit";
import { dwdWarningsProvider, nwsAlertsProvider, usgsEarthquakeProvider } from "./providers/weather";
import { openMeteoProvider } from "./providers/openMeteo";
import { caltransRoadProvider, govUkPublicNoticeProvider } from "./providers/road";
import { googleDiscoveryProvider } from "./providers/discovery";
import type { AssistanceQuery, ProviderMetadata } from "./types";

/** Every registered provider. Order is not significant — selection is by capability. */
export const PROVIDERS: Provider[] = [
  tflTubeProvider,
  tflRailProvider,
  tflBusProvider,
  mtaSubwayProvider,
  bartProvider,
  nwsAlertsProvider,
  dwdWarningsProvider,
  usgsEarthquakeProvider,
  // Global forecast: the national warning services above are authoritative but
  // cover only US and DE. Open-Meteo fills the rest of the world with a
  // forecast, and is ranked below them because it cannot declare a warning.
  openMeteoProvider,
  caltransRoadProvider,
  govUkPublicNoticeProvider,
  // Discovery goes last: it is the provider that can help anywhere, so it must
  // never displace a live authority that actually covers this place. It adds
  // leads alongside them, and carries a place the directory does not know.
  googleDiscoveryProvider,
];

export interface SkippedProvider {
  provider: Provider;
  reason: ProviderSkipReason;
}

export interface ProviderSelection {
  usable: Provider[];
  skipped: SkippedProvider[];
}

export function selectProviders(query: AssistanceQuery): ProviderSelection {
  const usable: Provider[] = [];
  const skipped: SkippedProvider[] = [];

  for (const provider of PROVIDERS) {
    if (!provider.metadata.categories.includes(query.category)) {
      skipped.push({ provider, reason: "category_not_supported" });
      continue;
    }
    if (!provider.supports(query)) {
      skipped.push({ provider, reason: "out_of_coverage" });
      continue;
    }
    if (!hasCredentials(provider)) {
      skipped.push({ provider, reason: "missing_credentials" });
      continue;
    }
    usable.push(provider);
  }

  return { usable, skipped };
}

/**
 * Ranks providers so the most authoritative and most specific answer is
 * presented first. Official sources outrank secondary ones; live data outranks
 * schedules; a provider that covers a single city outranks a national one for
 * that city's query, because it names the operator rather than a country.
 */
export function rankProviders(providers: Provider[]): Provider[] {
  const cadenceRank: Record<string, number> = { live: 0, periodic: 1, scheduled: 2, manual: 3 };
  return [...providers].sort((a, b) => {
    const official = Number(b.metadata.official) - Number(a.metadata.official);
    if (official !== 0) return official;
    const cadence =
      (cadenceRank[a.metadata.cadence] ?? 9) - (cadenceRank[b.metadata.cadence] ?? 9);
    if (cadence !== 0) return cadence;
    return a.metadata.name.localeCompare(b.metadata.name);
  });
}

/** Metadata for every provider, for the coverage/documentation surface. */
export function providerCatalogue(): ProviderMetadata[] {
  return PROVIDERS.map((provider) => provider.metadata);
}

/** Providers that can serve a given category anywhere we support. */
export function providersForCategory(category: AssistanceQuery["category"]): Provider[] {
  return PROVIDERS.filter((provider) => provider.metadata.categories.includes(category));
}

/**
 * Which countries can be answered from a country name alone, per category.
 *
 * This exists so the interface can tell, without a server round trip, that a
 * query like "Iceland" with no city has nothing to answer it. It is *derived*,
 * not declared: it asks each provider's own `supports()` the same question the
 * engine would, with the same fields, so the interface and the engine cannot
 * disagree. A hand-written table of "countries that work" would drift from the
 * providers the first time one changed its coverage.
 *
 * Only a country name is supplied — no city, region, network or description.
 * That is deliberate. Two providers make `supports()` depend on the traveller's
 * own words (USGS needs a seismic hint, DWD's road branch a weather word), and a
 * catalogue cannot know those. It does not need to: a request carrying free text
 * is not a bare country query, and the caller must not preempt one — see
 * `countryLevelAnswerable`.
 *
 * The returned lists name the countries that *can* be answered. Anything else
 * is where the engine will ask for a place, and the interface may say so at
 * once. A country that can be answered may still yield nothing to report, but
 * that is a coverage statement only the engine may make.
 */
export function countryLevelCoverage(): Record<string, string[]> {
  const answerable: Record<string, string[]> = {};

  // Categories are taken from the providers themselves rather than imported from
  // the category list, which imports this module: deriving them here keeps the
  // dependency one-way.
  const categories = new Set<AssistanceQuery["category"]>();
  for (const provider of PROVIDERS) {
    for (const category of provider.metadata.categories) categories.add(category);
  }

  for (const category of categories) {
    const providers = providersForCategory(category);
    // Every country any of this category's providers declares. A provider with
    // an empty country list (a global feed) can still answer a country-level
    // query when it does not need a point — Open-Meteo does need one, so it
    // declines here and the country is correctly left off the list.
    const declared = new Set<string>();
    for (const provider of providers) {
      for (const code of provider.metadata.coverage.countries) declared.add(code.toUpperCase());
    }

    const codes: string[] = [];
    for (const countryCode of declared) {
      const query: AssistanceQuery = { category, countryCode, locale: "en" };
      const canRespond = providers.some(
        (provider) => provider.supports(query) && hasCredentials(provider),
      );
      if (canRespond) codes.push(countryCode);
    }
    answerable[category] = codes.sort();
  }

  return answerable;
}

