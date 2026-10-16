/**
 * The assistance engine.
 *
 * One engine serves every non-flight category. It:
 *   1. selects the providers that can actually serve the query;
 *   2. queries them in parallel with a shared budget;
 *   3. normalises the answers into facts, conditions and coverage gaps;
 *   4. asks the grounded AI layer to explain the verified facts;
 *   5. builds the same situation shape the flight flow uses.
 *
 * Nothing operational is invented here. Missing data becomes a `CoverageGap`
 * with a plain explanation and, where possible, an official link. A provider
 * that returns an empty alert list yields "no current disruptions", which is a
 * finding; a provider that could not be reached yields an honest gap.
 */

import "server-only";

import { createTranslator } from "@/lib/i18n/translator";
import { nowIso } from "@/lib/core/time";
import type { DataState, SourceRef, TimelineEvent } from "@/lib/core/types";
import { callAi, isAiConfigured, AiUnavailableError } from "@/lib/ai/llm";
import { rankProviders, selectProviders, type SkippedProvider } from "./registry";
import { classifyDescription } from "./categories";
import { resolveLocation } from "./location";
import { directoryFor } from "./directory";
import { selectRightsNotes } from "@/lib/situation/passengerRights";
import type { Provider, ProviderContext } from "./provider";
import { worstState } from "./provider";
import type {
  AssistanceCategory,
  AssistancePage,
  AssistRecommendation,
  AssistReference,
  AssistSource,
  CoverageGap,
  ProviderReport,
  ServiceCondition,
  SituationFact,
} from "./types";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ar: "Arabic",
  zh: "Simplified Chinese",
  ja: "Japanese",
  hi: "Hindi",
};

export interface AssistInput {
  category: AssistanceCategory;
  countryCode?: string;
  /** State, province or region, when the traveller gives one. */
  region?: string;
  city?: string;
  /**
   * The traveller's location as they typed it ("Lagos, Nigeria"). Resolved into
   * `countryCode`/`city`/`region` before anything is queried, so a free-text
   * place name is a first-class input rather than a form the traveller has to
   * pre-digest into a country code.
   */
  location?: string;
  network?: string;
  from?: string;
  to?: string;
  description?: string;
  locale: string;
  /** Optional free-text route between two places the traveller named. */
  latitude?: number;
  longitude?: number;
  /**
   * The page the traveller last saw for this same situation, if any.
   *
   * When it is present the engine can compare the new reports against it and
   * record only what actually changed — a disruption appearing, lifting or
   * being reclassified. Without it the timeline says honestly that there is no
   * previous observation rather than inventing a history.
   */
  previous?: PreviousAssistState;
  /** Injected transport for deterministic tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The minimum the engine needs from a previous page to detect a change: the
 * per-provider data state and the conditions each source reported. Kept narrow
 * so the client sends the smallest possible snapshot and nothing extra.
 */
export interface PreviousAssistState {
  /** Provider id → the data state at the previous observation. */
  providerStates: Record<string, string>;
  /** Stable fingerprints of the conditions previously reported. */
  conditionKeys: string[];
}

/** How long the whole provider fan-out is allowed to take. */
const GATHER_BUDGET_MS = 15_000;

/**
 * Runs every usable provider in parallel under one shared budget. A provider
 * that overruns is dropped as unavailable rather than holding up the page.
 */
async function gatherReports(
  providers: Provider[],
  input: AssistInput,
  context: ProviderContext,
): Promise<ProviderReport[]> {
  const query = {
    category: input.category,
    countryCode: input.countryCode,
    region: input.region,
    city: input.city,
    network: input.network,
    from: input.from,
    to: input.to,
    description: input.description,
    latitude: input.latitude,
    longitude: input.longitude,
    locale: input.locale,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GATHER_BUDGET_MS);
  const bounded: ProviderContext = { ...context, signal: controller.signal };

  try {
    const settled = await Promise.allSettled(
      providers.map((provider) => provider.query(query, bounded)),
    );

    return settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      const provider = providers[index];
      return {
        providerId: provider.metadata.id,
        state: "unavailable" as DataState,
        cadence: provider.metadata.cadence,
        conditions: [],
        timetable: [],
        source: {
          id: provider.metadata.id,
          organization: provider.metadata.organization,
          title: provider.metadata.name,
          url: provider.metadata.url,
          retrievedAt: nowIso(),
          tier: "primary",
          kind: kindForCategory(input.category),
          state: "unavailable",
          note: context.t("assist.note.providerUnreachable"),
        },
        warnings: [
          context.t("assist.warn.providerUnreachable", { provider: provider.metadata.name }),
        ],
        retrievedAt: nowIso(),
      } satisfies ProviderReport;
    });
  } finally {
    clearTimeout(timer);
  }
}

function kindForCategory(category: AssistanceCategory): SourceRef["kind"] {
  switch (category) {
    case "road":
      return "road_status";
    case "weather":
      return "weather_warning";
    case "public_service":
      return "public_notice";
    default:
      return "public_transport";
  }
}

/** Turns a provider skip into a traveller-facing coverage gap. */
function buildGaps(
  skipped: SkippedProvider[],
  reports: ProviderReport[],
  t: ProviderContext["t"],
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  // Nothing was even attempted: say so once, in plain language, rather than
  // returning a page that looks empty for no stated reason.
  if (skipped.length > 0 && reports.length === 0) {
    gaps.push({
      providerId: "coverage",
      reason: "not_covered",
      message: t("assist.gap.noProvider"),
    });
  }

  for (const { provider, reason } of skipped) {
    if (reason === "category_not_supported" || reason === "out_of_coverage") continue;
    gaps.push({
      providerId: provider.metadata.id,
      reason: reason === "missing_credentials" ? "needs_credentials" : "unavailable",
      message: t("assist.gap.needsCredentials", { provider: provider.metadata.name }),
      fallbackUrl: provider.metadata.url,
    });
  }

  for (const report of reports) {
    if (report.state === "unavailable") {
      gaps.push({
        providerId: report.providerId,
        reason: "unavailable",
        message: t("assist.gap.providerDown", { provider: report.source.organization }),
        fallbackUrl: report.source.url,
      });
    } else if (report.state === "stale") {
      gaps.push({
        providerId: report.providerId,
        reason: "stale",
        message: t("assist.gap.staleData", { provider: report.source.organization }),
        fallbackUrl: report.source.url,
      });
    }
  }

  return dedupeGaps(gaps);
}

function dedupeGaps(gaps: CoverageGap[]): CoverageGap[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.providerId}:${gap.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFacts(
  output: {
    countryCode?: string;
    city?: string;
    network?: string;
    from?: string;
    to?: string;
  },
  description: string | undefined,
  reports: ProviderReport[],
  t: ProviderContext["t"],
): SituationFact[] {
  const facts: SituationFact[] = [];

  // Self-reported facts come first and are always labelled as such.
  if (description) {
    facts.push({
      id: "reported-problem",
      origin: "self_reported",
      confidence: "unconfirmed",
      label: t("assist.fact.reportedProblem.label"),
      value: description,
      caveat: t("assist.fact.reportedProblem.caveat"),
    });
  }
  if (output.city) {
    facts.push({
      id: "reported-city",
      origin: "self_reported",
      confidence: "unconfirmed",
      label: t("assist.fact.reportedCity.label"),
      value: output.city,
    });
  }
  if (output.network) {
    facts.push({
      id: "reported-network",
      origin: "self_reported",
      confidence: "unconfirmed",
      label: t("assist.fact.reportedNetwork.label"),
      value: output.network,
    });
  }
  if (output.from || output.to) {
    facts.push({
      id: "reported-route",
      origin: "self_reported",
      confidence: "unconfirmed",
      label: t("assist.fact.reportedRoute.label"),
      value: [output.from, output.to].filter(Boolean).join(" → "),
    });
  }

  // Verified facts: one per responding source, describing what it returned.
  for (const report of reports) {
    if (report.state === "unavailable") continue;
    const count = report.conditions.length;
    facts.push({
      id: `verified-${report.providerId}`,
      origin: "verified",
      confidence:
        report.state === "live" ? "verified" : report.state === "cached" ? "corroborated" : "unconfirmed",
      label: report.source.organization,
      value:
        count === 0
          ? t("assist.fact.noCurrentConditions")
          : t("assist.fact.conditionsReturned", { count }),
      sourceIds: [report.providerId],
      caveat:
        report.state === "stale"
          ? t("assist.fact.staleCaveat")
          : undefined,
    });
  }

  return facts;
}

/** Severity ordering for sorting conditions most-serious-first. */
const SEVERITY_ORDER: Record<ServiceCondition["severity"], number> = {
  severe: 0,
  major: 1,
  minor: 2,
  info: 3,
  good_service: 4,
};

function buildRecommendations(
  input: AssistInput,
  reports: ProviderReport[],
  hasDisruption: boolean,
  t: ProviderContext["t"],
): AssistRecommendation[] {
  const recommendations: AssistRecommendation[] = [];
  let rank = 1;

  const firstSource = reports.find((r) => r.state !== "unavailable");

  // Weather and emergency queries lead with safety, always.
  if (input.category === "weather") {
    recommendations.push({
      id: "follow-official-instructions",
      rank: rank++,
      title: t("assist.rec.followOfficial.title"),
      rationale: t("assist.rec.followOfficial.rationale"),
      priority: hasDisruption ? "now" : "soon",
      actionUrl: firstSource?.source.url,
      actionLabel: t("assist.rec.openSource"),
      requiresConfirmation: true,
    });
    recommendations.push({
      id: "emergency-services",
      rank: rank++,
      title: t("assist.rec.emergencyServices.title"),
      rationale: t("assist.rec.emergencyServices.rationale"),
      priority: "now",
      requiresConfirmation: true,
    });
  }

  if (input.category === "road") {
    recommendations.push({
      id: "check-road-authority",
      rank: rank++,
      title: t("assist.rec.checkRoadAuthority.title"),
      rationale: t("assist.rec.checkRoadAuthority.rationale"),
      priority: "now",
      actionUrl: firstSource?.source.url,
      actionLabel: t("assist.rec.openSource"),
    });
    recommendations.push({
      id: "do-not-drive-distracted",
      rank: rank++,
      title: t("assist.rec.noPhoneWhileDriving.title"),
      rationale: t("assist.rec.noPhoneWhileDriving.rationale"),
      priority: "now",
    });
    recommendations.push({
      id: "follow-signed-diversion",
      rank: rank++,
      title: t("assist.rec.followSignedDiversion.title"),
      rationale: t("assist.rec.followSignedDiversion.rationale"),
      priority: "soon",
    });
  }

  if (["metro", "rail", "bus"].includes(input.category)) {
    recommendations.push({
      id: "confirm-with-operator",
      rank: rank++,
      title: t("assist.rec.confirmWithOperator.title"),
      rationale: t("assist.rec.confirmWithOperator.rationale"),
      priority: "now",
      actionUrl: firstSource?.source.url,
      actionLabel: t("assist.rec.openSource"),
    });
    recommendations.push({
      id: "check-alternative-route",
      rank: rank++,
      title: t("assist.rec.checkAlternative.title"),
      rationale: t("assist.rec.checkAlternative.rationale"),
      priority: hasDisruption ? "now" : "when_possible",
    });
  }

  if (input.category === "stranded") {
    recommendations.push({
      id: "identify-provider",
      rank: rank++,
      title: t("assist.rec.identifyProvider.title"),
      rationale: t("assist.rec.identifyProvider.rationale"),
      priority: "now",
    });
    recommendations.push({
      id: "contact-support",
      rank: rank++,
      title: t("assist.rec.contactSupport.title"),
      rationale: t("assist.rec.contactSupport.rationale"),
      priority: "now",
    });
    recommendations.push({
      id: "keep-evidence",
      rank: rank++,
      title: t("assist.rec.keepEvidence.title"),
      rationale: t("assist.rec.keepEvidence.rationale"),
      priority: "soon",
    });
  }

  if (input.category === "public_service") {
    recommendations.push({
      id: "confirm-with-provider",
      rank: rank++,
      title: t("assist.rec.confirmWithProvider.title"),
      rationale: t("assist.rec.confirmWithProvider.rationale"),
      priority: "soon",
      actionUrl: firstSource?.source.url,
      actionLabel: t("assist.rec.openSource"),
    });
  }

  if (input.category === "other") {
    recommendations.push({
      id: "describe-more",
      rank: rank++,
      title: t("assist.rec.describeMore.title"),
      rationale: t("assist.rec.describeMore.rationale"),
      priority: "now",
    });
    recommendations.push({
      id: "contact-responsible-body",
      rank: rank++,
      title: t("assist.rec.contactResponsibleBody.title"),
      rationale: t("assist.rec.contactResponsibleBody.rationale"),
      priority: "soon",
    });
  }

  if (hasDisruption) {
    recommendations.push({
      id: "record-details",
      rank: rank++,
      title: t("assist.rec.recordDetails.title"),
      rationale: t("assist.rec.recordDetails.rationale"),
      priority: "when_possible",
    });
  }

  return recommendations;
}

function buildTimeline(
  reports: ProviderReport[],
  t: ProviderContext["t"],
  previous?: PreviousAssistState,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const responded = reports.filter((r) => r.state !== "unavailable");
  const retrievedAt = responded[0]?.retrievedAt ?? nowIso();

  events.push({
    id: "retrieved",
    at: retrievedAt,
    label: t("assist.timeline.sourcesChecked"),
    detail: t(
      responded.length === 1
        ? "assist.timeline.sourcesQueried"
        : "assist.timeline.sourcesQueried.plural",
      { count: responded.length },
    ),
  });

  if (previous) {
    const changes = detectConditionChanges(previous, reports, retrievedAt, t);
    events.push(...changes);
    if (changes.length === 0) {
      // A comparison happened and found nothing new. Saying "no change" is
      // truthful here precisely because there *was* a previous observation.
      events.push({
        id: "no-change",
        at: retrievedAt,
        label: t("assist.timeline.noChange"),
        detail: t("assist.timeline.noChangeDetail"),
      });
    }
  } else if (responded.length > 0) {
    // Be explicit that this is a first observation. "No changes detected" would
    // imply an earlier one that agreed; this says there was nothing to compare.
    events.push({
      id: "baseline",
      at: retrievedAt,
      label: t("assist.timeline.baseline"),
      detail: t("assist.timeline.baselineDetail"),
    });
  }

  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Compares the current conditions with the previous observation and records only
 * genuine differences: a disruption that appeared, one that cleared, or a change
 * of severity. Fingerprints are provider-scoped and stable, so a condition that
 * simply moved position in the feed is not reported as a change.
 */
function detectConditionChanges(
  previous: PreviousAssistState,
  reports: ProviderReport[],
  at: string,
  t: ProviderContext["t"],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const currentByKey = new Map<string, ServiceCondition>();
  for (const report of reports) {
    for (const condition of report.conditions) {
      currentByKey.set(conditionKey(condition), condition);
    }
  }
  const previousKeys = new Set(previous.conditionKeys);

  for (const [key, condition] of currentByKey) {
    if (previousKeys.has(key)) continue;
    events.push({
      id: `appeared-${condition.id}`,
      at,
      label: t("assist.timeline.disruptionAppeared"),
      detail: `${t(`assist.severity.${condition.severity}`)} — ${condition.title}`,
      change: true,
    });
  }

  for (const key of previousKeys) {
    if (currentByKey.has(key)) continue;
    events.push({
      id: `cleared-${key}`,
      at,
      label: t("assist.timeline.disruptionCleared"),
      change: true,
    });
  }

  // A provider that had failed and now answers is worth recording: it means a
  // gap in the last page has closed.
  for (const report of reports) {
    const was = previous.providerStates[report.providerId];
    if (was === "unavailable" && report.state !== "unavailable") {
      events.push({
        id: `provider-recovered-${report.providerId}`,
        at: report.retrievedAt ?? at,
        label: t("assist.timeline.sourceRecovered", { source: report.source.organization }),
        change: true,
      });
    }
  }

  return events;
}

/** A stable per-provider fingerprint of one condition, for change detection. */
export function conditionKey(condition: ServiceCondition): string {
  return [
    condition.providerId,
    condition.title,
    condition.severity,
    condition.from ?? "",
    condition.to ?? "",
  ].join("|");
}

/** The narrow snapshot the client sends back so the next page can diff it. */
export function snapshotFor(reports: ProviderReport[]): PreviousAssistState {
  return {
    providerStates: Object.fromEntries(
      reports.map((report) => [report.providerId, report.state]),
    ),
    conditionKeys: reports
      .flatMap((report) => report.conditions)
      .map(conditionKey)
      .sort(),
  };
}

function toAssistSources(reports: ProviderReport[], t: ProviderContext["t"]): AssistSource[] {
  return reports.map((report) => ({
    ...report.source,
    covers: report.source.note ?? t("assist.source.coversDefault"),
    relevance:
      report.state === "unavailable"
        ? t("assist.source.unavailable")
        : report.conditions.length > 0
          ? t("assist.source.foundConditions", { count: report.conditions.length })
          : t("assist.source.noConditions"),
  }));
}

/** Deterministic explanation used whenever the AI layer is unavailable. */
function fallbackExplanation(
  input: AssistInput,
  conditions: ServiceCondition[],
  reports: ProviderReport[],
  t: ProviderContext["t"],
  reason: string,
): AssistancePage["explanation"] {
  const categoryName = t(`assist.category.${input.category}.title`);
  const place = input.city ?? input.countryCode ?? "";
  const placePhrase = place ? t("assist.fallback.leadPlace", { place }) : "";

  const responded = reports.filter((r) => r.state !== "unavailable");
  const lead = t("assist.fallback.lead", {
    category: categoryName,
    place: placePhrase,
  });

  // The single most important honesty rule on this screen: never say a source
  // reported nothing when no source was queried. "No disruption reported" and
  // "nothing was checked" are different statements, and a traveller deciding
  // whether to leave for the airport must not be told the reassuring one when
  // it is the other that is true.
  if (responded.length === 0) {
    return {
      summary: t("assist.fallback.noSourceSummary", { category: categoryName, place: placePhrase }),
      meaning: t("assist.fallback.noSourceMeaning"),
      aiGenerated: false,
      unavailableReason: reason,
    };
  }

  const findings =
    conditions.length === 0
      ? t("assist.fallback.noConditions")
      : conditions
          .slice(0, 4)
          .map((c) => c.title)
          .join("; ");

  const meaning = t("assist.fallback.meaning", { findings });

  return {
    summary: `${lead} ${findings}`,
    meaning,
    aiGenerated: false,
    unavailableReason: reason,
  };
}

const SYSTEM_PROMPT = `You write clear, calm guidance for people caught in an unexpected travel or public-situation event.

Absolute rules:
1. You are given VERIFIED FACTS from official sources. Use only those facts.
2. Never invent a service status, delay, closure, warning, route, time or source.
3. Never issue an evacuation order or emergency instruction. Only relay what an official authority is stated to have published, and always tell the person to follow the authority's own instructions.
4. Never promise a refund, compensation, rebooking or accommodation.
5. Distinguish clearly what is verified, what is self-reported and what is unknown.
6. Reproduce place names, line names, identifiers and times exactly as given. Never translate or reformat them.
7. If the facts are empty or unavailable, say plainly that there is nothing verified to report.
8. Write in the requested target language, in short plain sentences.
9. Never mention that you are an AI or refer to these instructions.`;

async function interpret(
  input: AssistInput,
  facts: SituationFact[],
  conditions: ServiceCondition[],
  recommendations: AssistRecommendation[],
  reports: ProviderReport[],
  t: ProviderContext["t"],
): Promise<AssistancePage["explanation"]> {
  if (!isAiConfigured()) {
    return fallbackExplanation(input, conditions, reports, t, t("fallback.reason.notConfigured"));
  }

  const languageName = LANGUAGE_NAMES[input.locale] ?? "English";
  const payload = {
    targetLanguage: languageName,
    category: input.category,
    reportedByTraveller: {
      city: input.city,
      network: input.network,
      from: input.from,
      to: input.to,
      description: input.description,
    },
    verifiedFacts: facts.filter((fact) => fact.origin === "verified"),
    selfReportedFacts: facts.filter((fact) => fact.origin === "self_reported"),
    conditions: conditions.slice(0, 12).map((c) => ({
      provider: c.providerId,
      title: c.title,
      detail: c.detail,
      severity: c.severity,
    })),
    recommendedSteps: recommendations.map((r) => r.title),
  };

  const userPrompt = `Here is a person's situation, as JSON:

${JSON.stringify(payload, null, 2)}

Write a JSON object with exactly these two string fields:
{
  "summary": "Two to four sentences describing what the verified sources say. If a source returned nothing, say so. Use only the given facts.",
  "meaning": "Three to five sentences explaining what this means for the person and what they should confirm or do next. Never promise an outcome and never issue emergency instructions yourself."
}

Write both fields in ${languageName}. Reproduce all place names, network names and identifiers exactly as given.`;

  try {
    const raw = await callAi({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      json: true,
      temperature: 0.2,
      maxTokens: 900,
    });
    const parsed = JSON.parse(raw) as { summary?: unknown; meaning?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const meaning = typeof parsed.meaning === "string" ? parsed.meaning.trim() : "";
    if (summary.length < 40 || meaning.length < 40) {
      return fallbackExplanation(input, conditions, reports, t, t("fallback.reason.tooShort"));
    }
    return { summary, meaning, aiGenerated: true };
  } catch (error) {
    const reason =
      error instanceof AiUnavailableError
        ? t("fallback.reason.unavailable", { message: error.message })
        : t("fallback.reason.failed");
    return fallbackExplanation(input, conditions, reports, t, reason);
  }
}

/**
 * The page state reflects the providers that actually produced something, not
 * every provider that was consulted. A page can hold a hundred live conditions
 * from Caltrans and one advisory provider that timed out; calling the whole page
 * "unavailable" would hide the good data. Providers that returned nothing still
 * appear as coverage gaps, so the failure is disclosed rather than swallowed.
 */
function deriveOverallState(reports: ProviderReport[]): DataState {
  if (reports.length === 0) return "unavailable";
  const withContent = reports.filter(
    (report) => report.state !== "unavailable" && (report.conditions.length > 0 || report.timetable.length > 0),
  );
  if (withContent.length > 0) return worstState(withContent.map((report) => report.state));
  // Nothing had content: the strongest statement we can make is that whatever
  // did answer was empty, and the rest was unavailable.
  return worstState(reports.map((report) => report.state));
}

function buildHeadline(
  input: AssistInput,
  conditions: ServiceCondition[],
  reports: ProviderReport[],
  effectiveCategory: AssistanceCategory,
  t: ProviderContext["t"],
): string {
  const category = t(`assist.category.${effectiveCategory}.title`);
  const responded = reports.filter((r) => r.state !== "unavailable");
  if (responded.length === 0) {
    return t("assist.headline.noCoverage", { category });
  }
  const worst = conditions.reduce<ServiceCondition["severity"] | undefined>(
    (acc, c) => (acc === undefined || SEVERITY_ORDER[c.severity] < SEVERITY_ORDER[acc] ? c.severity : acc),
    undefined,
  );
  if (worst === "severe" || worst === "major") {
    return t("assist.headline.disruption", { category });
  }
  if (conditions.length > 0) return t("assist.headline.minor", { category });
  return t("assist.headline.clear", { category });
}

export async function composeAssistance(input: AssistInput): Promise<AssistancePage> {
  const { locale, t } = createTranslator(input.locale);

  // Resolve the free-text location first: everything downstream — provider
  // selection, coverage gaps, the directory — depends on knowing the country.
  // Explicit structured fields win over the free-text field so a caller that
  // already knows the country code is not second-guessed.
  const resolved = resolveLocation(input.location);
  const countryCode = input.countryCode ?? resolved.countryCode;
  const city = input.city ?? resolved.city;
  const region = input.region ?? resolved.region;

  // The open-ended category is classified from the traveller's words.
  let effectiveCategory = input.category;
  let classificationNote: string | undefined;
  if (input.category === "other" && input.description) {
    const classified = classifyDescription(input.description);
    if (classified.matched) {
      effectiveCategory = classified.category;
      classificationNote = classified.category;
    }
  }

  const classifiedInput: AssistInput = {
    ...input,
    category: effectiveCategory,
    countryCode,
    city,
    region,
  };
  const { usable, skipped } = selectProviders({
    category: effectiveCategory,
    countryCode,
    region,
    city,
    network: input.network,
    from: input.from,
    to: input.to,
    description: input.description,
    locale: input.locale,
  });

  const providers = rankProviders(usable);
  const context: ProviderContext = { t, fetchImpl: input.fetchImpl ?? fetch };
  const reports = providers.length > 0 ? await gatherReports(providers, classifiedInput, context) : [];

  const conditions = reports
    .flatMap((report) => report.conditions)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const hasDisruption = conditions.some((c) => c.severity === "severe" || c.severity === "major");
  const responded = reports.filter((report) => report.state !== "unavailable");

  const facts = buildFacts(
    { countryCode, city, network: input.network, from: input.from, to: input.to },
    input.description,
    reports,
    t,
  );
  const recommendations = buildRecommendations(classifiedInput, reports, hasDisruption, t);
  const coverageGaps = buildGaps(skipped, reports, t);
  const sources = toAssistSources(reports, t);
  // The directory only stands in for evidence when there is no evidence. Once a
  // live provider has answered, the source panel already names the authority and
  // a list of "places to check" would be noise.
  const references =
    responded.length === 0 ? toReferences(countryCode, effectiveCategory) : [];
  const rightsNotes =
    effectiveCategory === "flights" || effectiveCategory === "stranded"
      ? selectRightsNotes({}, t)
      : [];

  const explanation = await interpret(
    { ...classifiedInput, description: input.description },
    facts,
    conditions,
    recommendations,
    reports,
    t,
  );

  return {
    id: `${effectiveCategory}-${locale}-${Date.now()}`,
    category: effectiveCategory,
    locale,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    description: input.description,
    query: {
      countryCode,
      region,
      city,
      network: input.network,
      from: input.from,
      to: input.to,
      location: input.location,
    },
    facts,
    conditions,
    timetable: reports.flatMap((report) => report.timetable),
    recommendations,
    sources,
    references,
    rightsNotes,
    timeline: buildTimeline(reports, t, input.previous),
    snapshot: snapshotFor(reports),
    coverageGaps,
    availableCategories: [],
    respondingProviders: responded.map((r) => r.providerId),
    explanation,
    overallState: deriveOverallState(reports),
    headline: buildHeadline(classifiedInput, conditions, reports, effectiveCategory, t),
    known: facts
      .filter((fact) => fact.origin === "verified")
      .map((fact) => `${fact.label}: ${fact.value}`),
    uncertain: buildUncertain(
      reports,
      t,
      classificationNote,
      effectiveCategory,
      input.category,
      references.length > 0,
    ),
    aiConfigured: explanation.aiGenerated,
  };
}

/** Turns directory entries into the traveller-facing reference list. */
function toReferences(
  countryCode: string | undefined,
  category: AssistanceCategory,
): AssistReference[] {
  return directoryFor(countryCode, category).map((entry) => ({
    id: entry.id,
    organization: entry.organization,
    title: entry.title,
    url: entry.url,
    covers: entry.covers,
    official: true,
  }));
}

function buildUncertain(
  reports: ProviderReport[],
  t: ProviderContext["t"],
  classificationNote: string | undefined,
  effectiveCategory: AssistanceCategory,
  requestedCategory: AssistanceCategory,
  hasReferences: boolean,
): string[] {
  const uncertain: string[] = [t("assist.uncertain.operatorConfirm")];

  if (requestedCategory === "other" && classificationNote) {
    uncertain.push(
      t("assist.uncertain.classified", {
        category: t(`assist.category.${effectiveCategory}.title`),
      }),
    );
  }
  if (requestedCategory === "other" && !classificationNote) {
    uncertain.push(t("assist.uncertain.notClassified"));
  }
  if (reports.some((r) => r.state === "stale")) {
    uncertain.push(t("assist.uncertain.stale"));
  }
  if (hasReferences) {
    uncertain.push(t("assist.uncertain.noLiveProvider"));
  }
  uncertain.push(t("assist.uncertain.individualJourney"));
  return uncertain;
}
