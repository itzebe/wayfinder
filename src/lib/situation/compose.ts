/**
 * Situation composition.
 *
 * Assembles the full payload behind the situation page: verified intel, derived
 * assessment, prioritised steps, official sources, rights references, and a
 * timeline that only ever contains events that actually happened.
 *
 * The AI layer contributes only two prose fields (`explanation`). Everything
 * operational — flight identifiers, times, sources, steps — is composed from
 * retrieved data, so a model cannot fabricate a fact that appears as one.
 */

import "server-only";

import { gatherFlightIntel, overallDataState } from "./gatherIntel";
import { buildRecommendations, deriveSignals, detectChanges } from "./derive";
import { selectRightsNotes } from "./passengerRights";
import { buildGroundedFacts, interpretSituation } from "@/lib/ai/interpret";
import type { Interpretation } from "@/lib/ai/interpret";
import type { LocaleCode } from "@/lib/i18n/locales";
import { createTranslator } from "@/lib/i18n/translator";
import type { Translate } from "@/lib/i18n/translator";
import { nowIso } from "@/lib/core/time";
import type {
  AssistanceNeed,
  DataState,
  DerivedSignals,
  FlightIntel,
  Recommendation,
  RightsNote,
  SourceRef,
  TimelineEvent,
} from "@/lib/core/types";

/** Language names used when instructing the AI layer. */
const LANGUAGE_NAMES: Record<LocaleCode, string> = {
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

export interface SituationInput {
  need: AssistanceNeed;
  flightNumber: string;
  travelDate?: string;
  originAirport?: string;
  destinationAirport?: string;
  connectionAirport?: string;
  connectionFlightNumber?: string;
  connectionMinutes?: number;
  bookingReference?: string;
  locale: string;
  description?: string;
}

export interface ConnectionIntel {
  flightNumber: string;
  airport?: string;
  minutesAvailable?: number;
  /** True when the connection window is short enough to need attention. */
  tight: boolean;
}

export interface SituationPage {
  id: string;
  need: AssistanceNeed;
  locale: LocaleCode;
  createdAt: string;
  updatedAt: string;
  travelDate?: string;
  description?: string;

  intel: FlightIntel;
  signals: DerivedSignals;
  recommendations: Recommendation[];
  sources: SourceRef[];
  rightsNotes: RightsNote[];
  timeline: TimelineEvent[];
  connection?: ConnectionIntel;

  explanation: Interpretation;

  /** Least reliable upstream state, shown in the status banner. */
  overallState: DataState;
  /** Headline statement. Never asserts a status we cannot verify. */
  headline: string;
  /** What is known, in short factual phrases. */
  known: string[];
  /** What remains uncertain, in short factual phrases. */
  uncertain: string[];
  aiConfigured: boolean;
}

/** Headline wording that stays honest about what we do and do not know. */
function buildHeadline(
  need: AssistanceNeed,
  signals: DerivedSignals,
  intel: FlightIntel,
  t: Translate,
): string {
  const disruption =
    signals.disruptionLabel === "high"
      ? t("headline.disruption.high")
      : signals.disruptionLabel === "elevated"
        ? t("headline.disruption.elevated")
        : signals.disruptionLabel === "moderate"
          ? t("headline.disruption.moderate")
          : t("headline.disruption.low");

  return t(`headline.${need}`, { flight: intel.flightNumber, disruption });
}

function buildKnown(intel: FlightIntel, t: Translate): string[] {
  const known: string[] = [];

  if (intel.origin && intel.destination) {
    known.push(
      t("known.routeReference", {
        flight: intel.flightNumber,
        origin: intel.origin.iata ?? intel.origin.icao ?? "",
        destination: intel.destination.iata ?? intel.destination.icao ?? "",
      }),
    );
  }

  if (intel.originWeather?.flightCategory && intel.origin) {
    known.push(
      t("known.reportingConditions", {
        airport: intel.origin.iata ?? intel.origin.icao ?? "",
        category: intel.originWeather.flightCategory,
      }),
    );
  }
  if (intel.destinationWeather?.flightCategory && intel.destination) {
    known.push(
      t("known.reportingConditions", {
        airport: intel.destination.iata ?? intel.destination.icao ?? "",
        category: intel.destinationWeather.flightCategory,
      }),
    );
  }

  const constraints = [...intel.originConstraints, ...intel.destinationConstraints];
  for (const constraint of constraints) {
    known.push(
      t("known.faaConstraint", {
        program: constraint.programType.replace(/_/g, " "),
        airport: constraint.airport,
        reason: constraint.reason ? t("prose.becauseOf", { reason: constraint.reason }) : "",
      }),
    );
  }

  if (intel.liveTrack?.altitudeFt !== undefined) {
    known.push(
      intel.liveTrack.altitudeFt > 500
        ? t("known.observedAirborne", { callsign: intel.liveTrack.callsign ?? "" })
        : t("known.observedOnGround", { callsign: intel.liveTrack.callsign ?? "" }),
    );
  }

  if (known.length === 0) {
    known.push(t("known.none"));
  }

  return known;
}

function buildUncertain(intel: FlightIntel, signals: DerivedSignals, t: Translate): string[] {
  const uncertain: string[] = [
    t("uncertain.flightStatus"),
    t("uncertain.scheduleDetails"),
  ];

  if (!intel.origin || !intel.destination) {
    uncertain.push(t("uncertain.itinerary"));
  }

  if (signals.phase === "no_signal") {
    uncertain.push(t("uncertain.whetherFlown"));
  }

  if (intel.weatherState === "unavailable" || intel.weatherState === "stale") {
    uncertain.push(t("uncertain.weather"));
  }

  if (intel.airportStatusState === "unavailable" || intel.airportStatusState === "stale") {
    uncertain.push(t("uncertain.airportStatus"));
  }

  if (intel.origin?.countryCode && intel.origin.countryCode !== "US") {
    uncertain.push(t("uncertain.nonUsRestrictions"));
  }

  uncertain.push(t("uncertain.entitlements"));

  return uncertain;
}

/** Builds the timeline from retrieval events and detected changes only. */
function buildTimeline(
  intel: FlightIntel,
  changes: { key: string; label: string; detail?: string }[],
  t: Translate,
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: "retrieved",
      at: intel.retrievedAt,
      label: t("timeline.sourcesChecked"),
      detail: t(
        intel.sources.length === 1
          ? "timeline.sourcesQueried"
          : "timeline.sourcesQueried.plural",
        { count: intel.sources.length },
      ),
    },
  ];

  changes.forEach((change, index) => {
    events.push({
      id: `change-${index}-${change.key}`,
      at: intel.retrievedAt,
      label: change.label,
      detail: change.detail,
      change: true,
    });
  });

  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Builds the complete situation page.
 *
 * `previous` is the last snapshot held by the client, used only to detect real
 * changes for the timeline. It is validated before use.
 */
export async function composeSituation(
  input: SituationInput,
  previous?: FlightIntel,
): Promise<SituationPage> {
  const { locale, t } = createTranslator(input.locale);

  const intel = await gatherFlightIntel({
    flightNumber: input.flightNumber,
    date: input.travelDate,
    originHint: input.originAirport || undefined,
    destinationHint: input.destinationAirport || undefined,
    t,
  });

  const signals = deriveSignals(intel, input.need, t);

  const connection: ConnectionIntel | undefined = input.connectionFlightNumber
    ? {
        flightNumber: input.connectionFlightNumber,
        airport: input.connectionAirport || undefined,
        minutesAvailable: input.connectionMinutes,
        tight:
          input.connectionMinutes !== undefined && input.connectionMinutes > 0
            ? input.connectionMinutes < 75
            : false,
      }
    : undefined;

  const recommendations = buildRecommendations({
    intel,
    need: input.need,
    hasConnection: Boolean(connection),
    airlineName: intel.airline?.name,
    t,
  });

  const rightsNotes = selectRightsNotes(
    {
      originCountryCode: intel.origin?.countryCode,
      destinationCountryCode: intel.destination?.countryCode,
      airlineCountry: intel.airline?.country,
    },
    t,
  );

  // Point the rights step at the most specific official instrument for this
  // route, so the traveller reaches the regulator's own page in one click. An
  // applicable jurisdiction wins over the general Montreal Convention.
  const rightsLink =
    rightsNotes.find((note) => note.possiblyApplies && note.id !== "montreal") ??
    rightsNotes.find((note) => note.possiblyApplies);
  if (rightsLink) {
    const step = recommendations.find((rec) => rec.id === "review-rights");
    if (step) {
      step.actionUrl = rightsLink.url;
      step.actionLabel = t("rec.openRightsGuidance");
    }
  }

  const facts = buildGroundedFacts(intel, signals, input.need, t);
  const explanation = await interpretSituation({
    facts,
    signals,
    recommendations,
    rightsNotes,
    targetLocale: locale,
    targetLanguageName: LANGUAGE_NAMES[locale] ?? "English",
    travellerDescription: input.description,
    t,
  });

  const changes = previous ? detectChanges(previous, intel, t) : [];
  const timeline = buildTimeline(intel, changes, t);

  return {
    id: `${intel.flightNumber}-${locale}`,
    need: input.need,
    locale,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    travelDate: input.travelDate || undefined,
    description: input.description,
    intel,
    signals,
    recommendations,
    sources: intel.sources,
    rightsNotes,
    timeline,
    connection,
    explanation,
    overallState: overallDataState(intel),
    headline: buildHeadline(input.need, signals, intel, t),
    known: buildKnown(intel, t),
    uncertain: buildUncertain(intel, signals, t),
    aiConfigured: explanation.aiGenerated,
  };
}
