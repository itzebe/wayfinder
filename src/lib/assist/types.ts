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
  retrievedAt: string;
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
}
