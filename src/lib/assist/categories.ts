/**
 * Category definitions and the open-ended classifier.
 *
 * Each category declares which providers can serve it, so coverage can be
 * computed rather than asserted. `other` is special: the traveller's own words
 * are classified into the best-supported category, and when the words do not
 * map cleanly the system says so instead of guessing.
 */

import { PROVIDERS } from "./registry";
import { classifyDescription } from "./intent";
import type { AssistanceCategory } from "./types";

export { classifyDescription };

export interface CategoryDefinition {
  id: AssistanceCategory;
  /** Categories a traveller can pick directly (flights has its own flow). */
  selectable: boolean;
  /** Fields the flow should collect. */
  requiresLocation: boolean;
  requiresRoute: boolean;
  requiresNetwork: boolean;
}

export const CATEGORY_ORDER: AssistanceCategory[] = [
  "flights",
  "metro",
  "rail",
  "bus",
  "road",
  "weather",
  "stranded",
  "public_service",
  "other",
];

export const CATEGORIES: Record<AssistanceCategory, CategoryDefinition> = {
  flights: { id: "flights", selectable: true, requiresLocation: false, requiresRoute: true, requiresNetwork: false },
  metro: { id: "metro", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: true },
  rail: { id: "rail", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: true },
  bus: { id: "bus", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: true },
  road: { id: "road", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: false },
  weather: { id: "weather", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: false },
  stranded: { id: "stranded", selectable: true, requiresLocation: true, requiresRoute: true, requiresNetwork: false },
  public_service: { id: "public_service", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: false },
  other: { id: "other", selectable: true, requiresLocation: true, requiresRoute: false, requiresNetwork: false },
};

/** Which countries have at least one provider, derived from the registry. */
export function supportedCountries(): string[] {
  const set = new Set<string>();
  for (const provider of PROVIDERS) {
    for (const country of provider.metadata.coverage.countries) set.add(country);
  }
  return [...set].sort();
}

/** Categories that have at least one registered provider anywhere. */
export function categoriesWithProviders(): AssistanceCategory[] {
  const set = new Set<AssistanceCategory>();
  for (const provider of PROVIDERS) {
    for (const category of provider.metadata.categories) set.add(category);
  }
  return CATEGORY_ORDER.filter((category) => set.has(category));
}

