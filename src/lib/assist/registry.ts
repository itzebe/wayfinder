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
