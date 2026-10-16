/**
 * Generic assistance domain model.
 *
 * The flight experience keeps its own richer `FlightIntel`; every other
 * category — transit, roads, weather, public notices, stranded travel and the
 * open-ended "something else" case — is expressed with the same small set of
 * normalised shapes defined here. That is what lets one situation interface,
 * one recommendation engine and one source panel serve all of them.
 *
 * The organising rule is unchanged from flights: a value cannot reach the UI
 * without a `DataState` and, where it came from outside, a `SourceRef`.
 */

import type {
  Confidence,
  DataState,
  Recommendation,
  RightsNote,
  SourceRef,
  TimelineEvent,
} from "@/lib/core/types";

/**
 * The categories a traveller can ask for help with.
 *
 * `flights` keeps its dedicated, richer flow. `other` is the open-ended entry
 * point: the traveller describes the problem and the system routes it to the
 * best-supported category rather than pretending it understood everything.
 */
export type AssistanceCategory =
  | "flights"
  | "metro"
  | "rail"
  | "bus"
  | "road"
  | "weather"
  | "stranded"
  | "public_service"
  | "other";

/** How a provider's data behaves in time. Shown to the traveller verbatim. */
export type Cadence = "live" | "scheduled" | "periodic" | "manual";

/**
 * What a provider is allowed to tell us about a place it covers.
 *
 * Declaring `serviceAlerts: false` is how a provider says "I can give you
 * schedules but I cannot tell you whether the service is running now". The UI
 * must never upgrade a schedule into an operational fact.
 */
export interface ProviderCapabilities {
  /** Current disruptions, suspensions, closures. */
  serviceAlerts: boolean;
  /** Line or route level status. */
  lineStatus: boolean;
  /** Timetabled departures — always presented as scheduled, never as live. */
  schedule: boolean;
  /** Per-vehicle positions or trip updates. */
  realtime: boolean;
  /** Severe weather warnings. */
  weatherWarnings: boolean;
  /**
   * A general forecast or current-conditions reading. This is NOT a warning: a
   * forecast says what is expected, a warning says an authority has declared a
   * hazard. A provider with `forecast: true` and `weatherWarnings: false` can
   * describe the weather but must never be read as confirming a hazard exists.
   */
  forecast: boolean;
  /** Emergency or public-safety notices. */
  emergencyNotices: boolean;
  /** Road closures, incidents, official diversions. */
  roadEvents: boolean;
  /** Official service notices that are not transport disruptions. */
  publicNotices: boolean;
}

/** Which countries a provider actually covers, and how completely. */
export interface ProviderCoverage {
  /** ISO 3166-1 alpha-2 country codes, e.g. ["GB"]. */
  countries: string[];
  /** Human-readable areas, e.g. ["Greater London"]. */
  areas: string[];
  /**
   * True when the provider covers the whole country. False means only the areas
   * listed are supported, and the UI says so.
   */
  nationwide: boolean;
}

export interface ProviderMetadata {
  id: string;
  name: string;
  /** The publishing body, e.g. "Transport for London". */
  organization: string;
  /** Where the traveller can read the original, for the source panel. */
  url: string;
  /** True only when the data is published by the responsible authority itself. */
  official: boolean;
  categories: AssistanceCategory[];
  cadence: Cadence;
  coverage: ProviderCoverage;
  capabilities: ProviderCapabilities;
  /** Names of environment variables required to use this provider, if any. */
  requiredEnv: string[];
  /** Plain statements of what this provider cannot do, shown to the traveller. */
  limitations: string[];
}

/** The query a category adapter hands to its providers. */
export interface AssistanceQuery {
  category: AssistanceCategory;
  countryCode?: string;
  /** State, province or region within the country, where the source needs it. */
  region?: string;
  city?: string;
  /** Operator, network or line, e.g. "Victoria" or "MTA Subway". */
  network?: string;
  /** Origin station or stop, free text as typed by the traveller. */
  from?: string;
  to?: string;
  /** Free-text description of the problem, if the traveller gave one. */
  description?: string;
  /** Latitude/longitude when the traveller has shared or picked a location. */
  latitude?: number;
  longitude?: number;
  locale: string;
}

/** One retrieved condition, already normalised across provider formats. */
export interface ServiceCondition {
  id: string;
  /** Provider id this came from — resolves to a `SourceRef`. */
  providerId: string;
  /** Short headline, in the provider's own words where possible. */
  title: string;
  /** Extra detail, still the provider's own words. */
  detail?: string;
  /** Provider severity vocabulary mapped to a common scale. */
  severity: "severe" | "major" | "minor" | "info" | "good_service";
  /** Optional structured window the condition applies to, ISO-8601 UTC. */
  from?: string;
  to?: string;
  /** Places the condition names — stations, roads, line names. */
  affectedPlaces?: string[];
  /** The provider's own URL for this specific item, when it publishes one. */
  url?: string;
}

/** A timetabled departure. Never presented as live. */
export interface TimetableEntry {
  providerId: string;
  line?: string;
  destination?: string;
  /** Scheduled departure, ISO-8601 UTC. */
  scheduledDeparture?: string;
  expectedDeparture?: string;
  platform?: string;
  /** Explicit marker so the UI cannot mistake this for live data. */
  scheduled: true;
}

/** One provider's answer for one query. */
export interface ProviderReport {
  providerId: string;
  state: DataState;
  cadence: Cadence;
  conditions: ServiceCondition[];
  timetable: TimetableEntry[];
  source: SourceRef;
  /** Non-fatal problems, already localised by the provider adapter. */
  warnings: string[];
  /**
   * The classified reason a provider could not answer, when it failed. It is a
   * coarse HTTP taxonomy value (`timeout`, `rate_limited`, `client_error`…), not
   * the upstream text, so it is safe to surface. Without it the page cannot tell
   * "the source was never there" from "the source was there and refused us" —
   * the distinction the traveller needs.
   */
  errorKind?: string;
  retrievedAt: string;
  /**
   * Pages a discovery provider found that may bear on the situation. These are
   * NOT retrieved sources: nothing was fetched from them and no status was
   * established, so they can never substantiate a live claim. They exist to give
   * the traveller somewhere to look that the curated directory does not know.
   */
  findings?: SearchFinding[];
}

/**
 * A page surfaced by a web-search discovery provider.
 *
 * `verification` is always `discovered` for these: a search result is a lead, not
 * evidence. The distinction the UI must preserve is exactly this one — "a search
 * found this page" is not "this page says the service is down".
 */
export interface SearchFinding {
  id: string;
  /** Publisher, as far as the search result states it (usually the domain). */
  organization: string;
  /** The page title as returned by the provider. */
  title: string;
  /** The URL as returned by the provider, preserved verbatim. */
  url: string;
  /** The domain the provider attributes the page to. */
  domain: string;
  /** When the search discovered this page. */
  discoveredAt: string;
  /** A one-line indication of why it was surfaced, when the provider gives one. */
  reason?: string;
  /** Always `discovered` — a lead to check, never a retrieved source. */
  verification: "discovered";
  /** True when the domain looks like a government or authority domain. */
  likelyOfficial: boolean;
}

/** A single fact presented to the traveller, with its trust level attached. */
export interface SituationFact {
  id: string;
  /** `verified` = from a source; `self_reported` = told us; `inferred` = derived. */
  origin: "verified" | "self_reported" | "inferred" | "unknown";
  confidence: Confidence;
  label: string;
  value: string;
  sourceIds?: string[];
  /** Set for anything the traveller should not rely on, e.g. stale data. */
  caveat?: string;
}

/** One official source, presented in the source panel. */
export interface AssistSource extends SourceRef {
  /** What this source is able to tell us, in plain language. */
  covers: string;
  /** Why it is or is not relevant to this specific query. */
  relevance?: string;
}

/**
 * A place the traveller can check themselves.
 *
 * This is deliberately NOT an `AssistSource`: a directory entry carries no
 * status, no retrieval time and no condition, because nothing was retrieved from
 * it. Presenting it in the source panel would imply we had consulted it. It is
 * rendered in its own section, labelled as a directory of official pages rather
 * than as evidence about the situation.
 */
export interface AssistReference {
  id: string;
  /** The body responsible for the page. */
  organization: string;
  /** What the page is, in the publisher's terms. */
  title: string;
  url: string;
  /** What this page can and cannot tell them, in plain language. */
  covers: string;
  /** True when the publisher is the authority itself, not a third party. */
  official: boolean;
  /**
   * How this page came to be listed: from the curated official-source directory,
   * or surfaced by a web-search discovery provider. The UI must keep the two
   * visibly distinct — a discovered page is a lead, not a checked authority.
   */
  origin?: "directory" | "discovery";
  /** The domain, for display, when it came from discovery. */
  domain?: string;
  /** When a discovery provider surfaced it. */
  discoveredAt?: string;
}

export interface AssistRecommendation extends Recommendation {
  /** True when the step can only be confirmed by a human or a different source. */
  requiresConfirmation?: boolean;
}

/** Providers that could have helped but could not answer, and why. */
export interface CoverageGap {
  providerId: string;
  reason:
    | "not_covered"
    | "unavailable"
    | "needs_credentials"
    | "no_data"
    | "rate_limited"
    | "stale";
  /** Localised, traveller-facing explanation. */
  message: string;
  /** Official link the traveller can use instead, when one exists. */
  fallbackUrl?: string;
}

/**
 * What the optional web-search discovery layer did for this request.
 *
 * These states are deliberately distinct because they mean different things to
 * the traveller, and collapsing them is what produced a misleading "no source
 * covers this place" message:
 *   - `leads`          — discovery ran and returned pages to check;
 *   - `no_results`     — discovery ran, found nothing extra;
 *   - `not_configured` — no discovery credential in this deployment;
 *   - `unreachable`    — the credential exists but the provider refused/failed.
 */
export interface DiscoveryStatus {
  state: "leads" | "no_results" | "not_configured" | "unreachable";
  /** Number of pages discovery actually surfaced (after dedup/scoping). */
  leadCount: number;
  /**
   * Coarse, non-leaking failure classification when `state` is `unreachable`.
   * `rate_limited` and `client_error` here typically mean the configured key is
   * not permitted to run the paid Search-grounding tool.
   */
  errorKind?: string;
}

export interface AssistancePage {
  id: string;
  category: AssistanceCategory;
  locale: string;
  createdAt: string;
  updatedAt: string;
  /** The traveller's own words, echoed back unchanged. */
  description?: string;
  query: {
    countryCode?: string;
    region?: string;
    city?: string;
    network?: string;
    from?: string;
    to?: string;
    /** The location exactly as the traveller typed it, for display and re-runs. */
    location?: string;
    /**
     * True when the country was read from a bare place name rather than named by
     * the traveller ("Paris" → France). Surfaced so the page can say the match
     * was ours, and invite a correction.
     */
    countryInferred?: boolean;
  };

  /** Verified and self-reported facts, each labelled with its origin. */
  facts: SituationFact[];
  conditions: ServiceCondition[];
  timetable: TimetableEntry[];
  recommendations: AssistRecommendation[];
  sources: AssistSource[];
  /**
   * Official pages for places no live provider covers. Not evidence — places to
   * check. Empty when a live provider answered, since then the source panel
   * already carries the authority.
   */
  references: AssistReference[];
  rightsNotes: RightsNote[];
  timeline: TimelineEvent[];
  coverageGaps: CoverageGap[];

  /** The categories we can actually serve for this place, for the picker. */
  availableCategories: AssistanceCategory[];
  /** Providers that actually answered for this query. */
  respondingProviders: string[];

  /**
   * What the optional web-search discovery layer did, so the page never has to
   * guess. A failed or unconfigured discovery provider must be described as
   * exactly that — a deployment/availability fact about one source — and never
   * folded into a statement that "no source covers this place".
   */
  discovery: DiscoveryStatus;

  explanation: {
    summary: string;
    meaning: string;
    aiGenerated: boolean;
    unavailableReason?: string;
  };

  overallState: DataState;
  headline: string;
  known: string[];
  uncertain: string[];
  aiConfigured: boolean;

  /**
   * A narrow, non-identifying snapshot of what each source reported. The client
   * keeps only this and sends it back on the next visit so the engine can record
   * genuine changes. It is deliberately not the whole page.
   */
  snapshot?: {
    providerStates: Record<string, string>;
    conditionKeys: string[];
    conditionSeverities?: Record<string, string>;
  };
}
