/**
 * Category definitions and the open-ended classifier.
 *
 * Each category declares which providers can serve it, so coverage can be
 * computed rather than asserted. `other` is special: the traveller's own words
 * are classified into the best-supported category, and when the words do not
 * map cleanly the system says so instead of guessing.
 */

import { PROVIDERS } from "./registry";
import type { AssistanceCategory } from "./types";

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

/**
 * Classifier rules, most specific mode first.
 *
 * `weight` distinguishes an explicit mode word ("subway", "train") from a
 * generic word that only suggests a mode ("line", "closed"). The order here is
 * also the tie-break order: the more specific mode wins an equal score.
 */
const CLASSIFIER_RULES: { category: AssistanceCategory; re: RegExp; weight: number }[] = [
  {
    category: "flights",
    re: /\b(flight|airline|aeroplane|airplane|plane|boarding pass|baggage claim|departure gate)\b/gi,
    weight: 3,
  },
  { category: "metro", re: /\b(metro|subway|underground|tube|u-?bahn|métro|dlr|light rail)\b/gi, weight: 3 },
  { category: "rail", re: /\b(train|railway|railroad|national rail|commuter rail|intercity|rail)\b/gi, weight: 3 },
  { category: "bus", re: /\b(bus|coach|shuttle|bus stop|bus route)\b/gi, weight: 3 },
  {
    category: "weather",
    re: /\b(storm|flood|hurricane|typhoon|cyclone|snow|heatwave|heat wave|earthquake|wildfire|tsunami|weather warning|evacuat)\b/gi,
    weight: 3,
  },
  {
    category: "road",
    re: /\b(motorway|highway|freeway|road closure|detour|diversion|traffic|accident|congestion)\b/gi,
    weight: 3,
  },
  { category: "stranded", re: /\b(stranded|stuck|missed connection|missed my|nowhere to stay|overnight)\b/gi, weight: 3 },
  {
    category: "public_service",
    re: /\b(public notice|office closed|service interruption|power outage|water outage|facility|permit)\b/gi,
    weight: 3,
  },
  { category: "metro", re: /\b(line|platform|station)\b/gi, weight: 1 },
  { category: "road", re: /\b(road)\b/gi, weight: 1 },
  { category: "public_service", re: /\b(closed)\b/gi, weight: 1 },
];

/** Below this total score a description is treated as unclassified. */
const CLASSIFIER_MIN_SCORE = 1;

/** Order used for tie-breaking: more specific mode wins. */
const CLASSIFIER_ORDER: AssistanceCategory[] = [
  "flights",
  "metro",
  "rail",
  "bus",
  "road",
  "weather",
  "stranded",
  "public_service",
];

/**
 * Classifies a free-text description into a category.
 *
 * Scoring rather than first-match: a sentence can legitimately name more than
 * one kind of transport ("the Victoria line is suspended and I cannot reach the
 * airport"), so the category with the strongest signal wins and ties break
 * towards the more specific mode. Strong signals (an explicit mode word) count
 * for more than weak ones (a generic word like "line" or "closed").
 *
 * Returns `other` when nothing clears the threshold. That is a real outcome: the
 * platform then explains what it can and cannot verify rather than forcing the
 * words into a category it cannot serve.
 */
export function classifyDescription(
  description: string,
): { category: AssistanceCategory; matched: boolean; label: string } {
  const text = description.toLowerCase();
  const scores = new Map<AssistanceCategory, number>();

  for (const rule of CLASSIFIER_RULES) {
    const { re, weight } = rule;
    let count = 0;
    while (re.exec(text) !== null) {
      count += 1;
      if (re.lastIndex === 0) break;
    }
    if (count > 0) {
      scores.set(rule.category, (scores.get(rule.category) ?? 0) + count * weight);
    }
  }

  let best: { category: AssistanceCategory; score: number } | undefined;
  for (const category of CLASSIFIER_ORDER) {
    const score = scores.get(category) ?? 0;
    if (score > 0 && (best === undefined || score > best.score)) {
      best = { category, score };
    }
  }

  if (!best || best.score < CLASSIFIER_MIN_SCORE) {
    return { category: "other", matched: false, label: "other" };
  }
  return { category: best.category, matched: true, label: best.category };
}
