/**
 * Derivation of meaning from raw observations.
 *
 * This module is where WAYFINDER is most careful. It converts measured facts
 * (weather reports, air traffic constraints, observed aircraft positions) into
 * an *assessment*. Everything it produces is labelled as an assessment, and each
 * signal keeps the reason it fired so the traveller can see the working.
 *
 * Hard rule: this module never asserts that a specific flight is cancelled,
 * delayed or protected. No public source we consume publishes per-flight status,
 * and inventing one would be the single most damaging thing this product could
 * do. We describe conditions and tell the traveller how to confirm.
 */

import type { Translate } from "@/lib/i18n/translator";
import type {
  AirportConstraint,
  DerivedSignals,
  FlightIntel,
  FlightPhase,
  Recommendation,
  WeatherForecast,
  WeatherObservation,
} from "@/lib/core/types";

const LIFR = "LIFR";
const IFR = "IFR";
const MVFR = "MVFR";

export const WEATHER_SEVERITY_ORDER = ["none", "low", "moderate", "high", "unknown"] as const;

function severityFromCategory(category: string | undefined): "none" | "low" | "moderate" | "high" | "unknown" {
  switch (category) {
    case "VFR":
      return "none";
    case MVFR:
      return "low";
    case IFR:
      return "moderate";
    case LIFR:
      return "high";
    default:
      return "unknown";
  }
}

function maxSeverity(
  a: "none" | "low" | "moderate" | "high" | "unknown",
  b: "none" | "low" | "moderate" | "high" | "unknown",
) {
  const order = { none: 0, low: 1, moderate: 2, high: 3, unknown: -1 };
  return order[b] > order[a] ? b : a;
}

/** "There is a 40% chance of this in the forecast period." when the source states one. */
function chance(t: Translate, probability: number | undefined): string {
  return probability !== undefined && probability < 100
    ? t("prose.chance", { probability })
    : "";
}

/**
 * Forecast visibility in statute miles, or undefined when the source stated no
 * usable value.
 *
 * The decoded TAF `visib` field is not typed consistently: a value below 6 SM
 * arrives as a number (a raw `4000` metres group decodes to 2.49) while "6 SM or
 * more" arrives as the string `"6+"`. `normaliseVisibility` renders both as a
 * display string, so the severity check has to parse rather than compare
 * numerically — comparing the string form was why low visibility raised no
 * hazard. Fractions are handled because they occur in human-entered bulletins.
 *
 * A missing or unparseable value returns undefined, which callers must treat as
 * "unknown", never as "clear".
 */
export function visibilityInStatuteMiles(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (!value) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  // "6+", and the older "P6SM" prefix form, both mean six or more. Six is above
  // every hazard threshold, so reading the floor cannot invent a hazard.
  const atLeast = text.match(/^P?(\d+(?:\.\d+)?)\s*(?:\+|SM)?$/i);
  if (atLeast) return Number.parseFloat(atLeast[1]);
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fraction) {
    const denominator = Number.parseFloat(fraction[2]);
    return denominator > 0 ? Number.parseFloat(fraction[1]) / denominator : undefined;
  }
  const leading = text.match(/^\d+(?:\.\d+)?/);
  if (!leading) return undefined;
  const parsed = Number.parseFloat(leading[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Gusts, low visibility and convective weather are the operationally hard ones.
 *
 * Each reason names the airport and folds the forecast probability into the same
 * sentence, so a bullet read on its own still says where and how likely.
 */
function forecastSeverity(
  forecast: WeatherForecast | undefined,
  where: string,
  t: Translate,
): {
  severity: "none" | "low" | "moderate" | "high" | "unknown";
  reasons: string[];
} {
  if (!forecast || forecast.periods.length === 0) {
    return { severity: "unknown", reasons: [] };
  }

  let severity: "none" | "low" | "moderate" | "high" = "none";

  // A forecast repeats the same condition across its change periods. Collapse
  // them per condition so one airport yields one bullet per hazard, carrying the
  // highest gust seen and the highest probability *only* when every occurrence
  // was a probability group — a condition stated in the main forecast period is
  // the expected outcome and must not be reported as a chance of it.
  interface Hazard {
    rank: number;
    severity: "low" | "moderate" | "high";
    probability?: number;
    gust: number;
    text: (probability: number | undefined, gust: number) => string;
  }
  const hazards = new Map<string, Hazard>();

  const record = (key: string, hazard: Hazard) => {
    const existing = hazards.get(key);
    if (!existing) {
      hazards.set(key, hazard);
      return;
    }
    existing.gust = Math.max(existing.gust, hazard.gust);
    existing.probability =
      existing.probability === undefined || hazard.probability === undefined
        ? undefined
        : Math.max(existing.probability, hazard.probability);
  };

  for (const period of forecast.periods) {
    const weather = period.weather ?? [];
    const cloudLayers = period.cloudLayers ?? [];
    const codes = [...weather, ...cloudLayers.map((layer) => layer.slice(0, 3))];
    const hasThunder = weather.some((w) => w.includes("TS"));
    const hasFreezing = weather.some((w) => w.includes("FZ"));
    const hasSnow = weather.some((w) => w.includes("SN"));
    const hasRain = weather.some((w) => w.includes("RA"));
    const hasFog = weather.some((w) => w.includes("FG"));
    const gust = period.windGustKt ?? 0;
    const lowCloud = codes.some((code) => code === "OVC" || code === "BKN");
    const visibilityMiles = visibilityInStatuteMiles(period.visibility);
    const lowVisibility = visibilityMiles !== undefined && visibilityMiles < 3;
    // `probability` is absent on a TEMPO/PROB group only when the source did not
    // state one; a plain forecast period has no probability and is not a chance.
    const probability = period.probability;

    if (hasThunder) {
      record("thunder", {
        rank: 4, severity: "high", probability, gust: 0,
        text: (p) => t("prose.thunderstorms", { where, chance: chance(t, p) }),
      });
    } else if (hasFreezing) {
      record("freezing", {
        rank: 3, severity: "high", probability, gust: 0,
        text: (p) => t("prose.freezingPrecip", { where, chance: chance(t, p) }),
      });
    } else if (hasSnow) {
      record("snow", {
        rank: 3, severity: "high", probability, gust: 0,
        text: (p) => t("prose.snow", { where, chance: chance(t, p) }),
      });
    }
    if (gust >= 25) {
      record("gust-strong", {
        rank: 3, severity: "moderate", probability, gust,
        text: (p, g) => t("prose.gusts", { gust: g, where, chance: chance(t, p) }),
      });
    } else if (gust >= 18) {
      record("gust-moderate", {
        rank: 1, severity: "low", probability, gust,
        text: (p, g) => t("prose.gusts", { gust: g, where, chance: chance(t, p) }),
      });
    }
    if (hasFog) {
      record("fog", {
        rank: 3, severity: "moderate", probability, gust: 0,
        text: (p) => t("prose.fog", { where, chance: chance(t, p) }),
      });
    } else if (lowVisibility) {
      record("low-visibility", {
        rank: 3, severity: "moderate", probability, gust: 0,
        text: (p) => t("prose.lowVisibility", { where, chance: chance(t, p) }),
      });
    }
    if (hasRain && lowCloud) {
      record("rain-low-cloud", {
        rank: 1, severity: "low", probability, gust: 0,
        text: (p) => t("prose.rainLowCloud", { where, chance: chance(t, p) }),
      });
    }
  }

  const order = { low: 1, moderate: 2, high: 3 } as const;
  const ordered = [...hazards.values()].sort((a, b) => b.rank - a.rank);
  for (const hazard of ordered) {
    if (severity === "none" || order[hazard.severity] > order[severity]) {
      severity = hazard.severity;
    }
  }

  return {
    severity,
    reasons: ordered.map((hazard) => hazard.text(hazard.probability, hazard.gust)),
  };
}

/** Live observation severity, including wind and visibility thresholds. */
function observationSeverity(
  observation: WeatherObservation | undefined,
  t: Translate,
): {
  severity: "none" | "low" | "moderate" | "high" | "unknown";
  reasons: string[];
} {
  if (!observation) return { severity: "unknown", reasons: [] };
  const reasons: string[] = [];
  let severity = severityFromCategory(observation.flightCategory);

  if (severity === "none" && observation.windSpeedKt !== undefined && observation.windSpeedKt >= 25) {
    severity = "low";
    reasons.push(t("prose.sustainedWinds", { speed: observation.windSpeedKt }));
  }
  if (severity !== "none" && severity !== "unknown") {
    reasons.push(
      t("prose.categoryConditions", { category: observation.flightCategory ?? "" }),
    );
  }
  return { severity, reasons };
}

function constraintSeverity(
  constraints: AirportConstraint[],
  t: Translate,
): {
  severity: "none" | "low" | "moderate" | "high";
  reasons: string[];
} {
  if (constraints.length === 0) return { severity: "none", reasons: [] };

  let severity: "none" | "low" | "moderate" | "high" = "none";
  const reasons: string[] = [];

  for (const constraint of constraints) {
    switch (constraint.programType) {
      case "ground_stop":
        severity = "high";
        reasons.push(
          t("prose.faaGroundStop", {
            airport: constraint.airport,
            reason: constraint.reason ? t("prose.becauseOf", { reason: constraint.reason }) : "",
          }),
        );
        break;
      case "closure":
        severity = "high";
        reasons.push(t("prose.faaClosure", { airport: constraint.airport }));
        break;
      case "ground_delay": {
        const average = Number.parseInt(constraint.averageDelay ?? "", 10);
        const isLong = Number.isFinite(average) && average >= 45;
        severity = severity === "high" ? "high" : isLong ? "moderate" : "low";
        reasons.push(
          t("prose.faaGroundDelay", {
            airport: constraint.airport,
            average: constraint.averageDelay
              ? t("prose.averaging", { average: constraint.averageDelay })
              : "",
            reason: constraint.reason
              ? t("prose.attributedTo", { reason: constraint.reason })
              : "",
          }),
        );
        break;
      }
      case "arrival_departure_delay":
        severity =
          severity === "high" ? "high" : severity === "moderate" ? "moderate" : "low";
        reasons.push(
          t("prose.faaArrivalDepartureDelay", {
            airport: constraint.airport,
            reason: constraint.reason ? t("prose.inParens", { value: constraint.reason }) : "",
          }),
        );
        break;
    }
  }

  return { severity, reasons: [...new Set(reasons)] };
}

/** Determines lifecycle phase purely from observed aircraft position. */
function derivePhase(intel: FlightIntel, t: Translate): { phase: FlightPhase; basis: string } {
  const track = intel.liveTrack;

  if (track) {
    const airborne =
      track.altitudeFt !== undefined ? track.altitudeFt > 500 : undefined;
    if (airborne === true) {
      return {
        phase: "airborne",
        basis: t("prose.phaseAirborne", {
          callsign: track.callsign ?? intel.callsignIcao ?? "",
          altitude:
            track.altitudeFt !== undefined
              ? t("prose.atAltitude", { altitude: track.altitudeFt })
              : "",
        }),
      };
    }
    if (airborne === false) {
      return {
        phase: "not_yet_departed",
        basis: t("prose.phaseOnGround", {
          callsign: track.callsign ?? intel.callsignIcao ?? "",
        }),
      };
    }
    return { phase: "unknown", basis: t("prose.phaseAltitudeUnknown") };
  }

  if (intel.liveTrackState === "unavailable") {
    return { phase: "unknown", basis: t("prose.phaseTrackingUnavailable") };
  }

  return { phase: "no_signal", basis: t("prose.phaseNoSignal") };
}

/**
 * Combines every signal into a single 0-100 assessment.
 *
 * The score exists to help a traveller judge how much attention the situation
 * needs. It is never presented as a fact about their flight.
 */
function computeDisruptionScore(input: {
  weather: "none" | "low" | "moderate" | "high" | "unknown";
  airport: "none" | "low" | "moderate" | "high";
  phase: FlightPhase;
  need: string;
}): { score: number; label: string } {
  const weatherPoints = { none: 0, low: 8, moderate: 22, high: 38, unknown: 0 }[input.weather];
  const airportPoints = { none: 0, low: 10, moderate: 24, high: 40 }[input.airport];

  // An aircraft observed airborne is direct evidence the flight is operating.
  const phaseAdjustment =
    input.phase === "airborne"
      ? -25
      : input.phase === "arrived"
        ? -30
        : input.phase === "no_signal"
          ? 10
          : 0;

  // A traveller reporting a cancellation or a missed connection raises urgency.
  const needAdjustment =
    input.need === "cancelled" ? 20 : input.need === "connection" ? 14 : input.need === "delayed" ? 10 : 4;

  const raw = weatherPoints + airportPoints + phaseAdjustment + needAdjustment;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const label =
    score >= 65 ? "high" : score >= 40 ? "elevated" : score >= 20 ? "moderate" : "low";

  return { score, label };
}

export function deriveSignals(
  intel: FlightIntel,
  need: string,
  t: Translate,
): DerivedSignals {
  const originLabel = intel.origin?.iata ?? intel.origin?.icao ?? t("prose.theDepartureAirport");
  const destinationLabel =
    intel.destination?.iata ?? intel.destination?.icao ?? t("prose.theArrivalAirport");

  const originObservation = observationSeverity(intel.originWeather, t);
  const destinationObservation = observationSeverity(intel.destinationWeather, t);
  const originForecast = forecastSeverity(intel.originForecast, originLabel, t);
  const destinationForecast = forecastSeverity(intel.destinationForecast, destinationLabel, t);

  let weather: "none" | "low" | "moderate" | "high" | "unknown" = "none";
  const weatherBasis: string[] = [];

  for (const signal of [
    originObservation,
    destinationObservation,
    originForecast,
    destinationForecast,
  ]) {
    weather = maxSeverity(weather, signal.severity);
    weatherBasis.push(...signal.reasons);
  }

  const originConstraints = constraintSeverity(intel.originConstraints, t);
  const destinationConstraints = constraintSeverity(intel.destinationConstraints, t);

  let airport: "none" | "low" | "moderate" | "high" = "none";
  const airportBasis: string[] = [];
  for (const signal of [originConstraints, destinationConstraints]) {
    const order = { none: 0, low: 1, moderate: 2, high: 3 };
    if (order[signal.severity] > order[airport]) airport = signal.severity;
    airportBasis.push(...signal.reasons);
  }

  const { phase, basis } = derivePhase(intel, t);
  const { score, label } = computeDisruptionScore({
    weather,
    airport,
    phase,
    need,
  });

  const disruptionBasis: string[] = [];
  if (weatherBasis.length) disruptionBasis.push(...weatherBasis);
  if (airportBasis.length) disruptionBasis.push(...airportBasis);
  disruptionBasis.push(basis);

  return {
    phase,
    phaseBasis: basis,
    weatherSeverity: weather,
    weatherBasis: [...new Set(weatherBasis)],
    airportDisruption: airport !== "none",
    airportDisruptionBasis: [...new Set(airportBasis)],
    disruptionScore: score,
    disruptionLabel: label,
    disruptionBasis: [...new Set(disruptionBasis)],
  };
}

/**
 * Builds the prioritised action plan.
 *
 * Every recommendation explains why it matters and, where an official
 * destination exists, links to it. Recommendations never promise an outcome.
 */
export function buildRecommendations(input: {
  intel: FlightIntel;
  need: string;
  hasConnection: boolean;
  airlineName?: string;
  t: Translate;
}): Recommendation[] {
  const { intel, need, t } = input;
  const airline = input.airlineName ?? intel.airline?.name ?? t("prose.yourAirline");
  const originIata = intel.origin?.iata;
  const destinationIata = intel.destination?.iata;

  const actions: Recommendation[] = [];
  let rank = 1;

  const push = (action: Omit<Recommendation, "rank">) => {
    actions.push({ ...action, rank: rank++ });
  };

  if (need === "announcement") {
    push({
      id: "capture-announcement",
      title: t("rec.captureAnnouncement.title"),
      rationale: t("rec.captureAnnouncement.why"),
      priority: "now",
    });
  }

  push({
    id: "confirm-with-airline",
    title: t("rec.confirmWithAirline.title", { airline }),
    rationale: t("rec.confirmWithAirline.why"),
    priority: "now",
  });

  push({
    id: "contact-airline",
    title: t("rec.contactAirline.title", { airline }),
    rationale: t("rec.contactAirline.why"),
    priority: "now",
  });

  if (need === "cancelled") {
    push({
      id: "ask-rebooking",
      title: t("rec.askRebooking.title"),
      rationale: t("rec.askRebooking.why"),
      priority: "now",
    });
    push({
      id: "ask-refund-vs-credit",
      title: t("rec.askRefundOrCredit.title"),
      rationale: t("rec.askRefundOrCredit.why"),
      priority: "now",
      sourceIds: ["us-refunds", "eu261", "uk261"],
    });
  }

  if (need === "delayed" || need === "options") {
    push({
      id: "ask-delay-duration",
      title: t("rec.askDelayDuration.title"),
      rationale: t("rec.askDelayDuration.why"),
      priority: "soon",
      sourceIds: ["eu261", "uk261"],
    });
  }

  if (input.hasConnection) {
    push({
      id: "check-connection",
      title: t("rec.checkConnection.title"),
      rationale: t("rec.checkConnection.why"),
      priority: "now",
    });
    push({
      id: "dont-assume-protection",
      title: t("rec.dontAssumeProtection.title"),
      rationale: t("rec.dontAssumeProtection.why"),
      priority: "now",
    });
  }

  if (need === "gate_change") {
    push({
      id: "verify-gate-on-screen",
      title: t("rec.verifyGate.title"),
      rationale: t("rec.verifyGate.why"),
      priority: "now",
    });
  }

  if (intel.airportStatusState === "stale" || intel.airportStatusState === "unavailable") {
    push({
      id: "airport-constraints-unavailable",
      title: t("rec.airportStatusUnavailable.title"),
      rationale: t("rec.airportStatusUnavailable.why"),
      priority: "soon",
    });
  }

  if (intel.weatherState === "stale" || intel.weatherState === "unavailable") {
    push({
      id: "weather-unavailable",
      title: t("rec.weatherUnavailable.title"),
      rationale: t("rec.weatherUnavailable.why"),
      priority: "soon",
      actionUrl: "https://aviationweather.gov/",
      actionLabel: t("rec.openAviationWeather"),
    });
  }

  push({
    id: "review-rights",
    title: t("rec.reviewRights.title"),
    rationale: t("rec.reviewRights.why"),
    priority: "soon",
    sourceIds: ["eu261", "uk261", "us-refunds", "ca-apr"],
  });

  push({
    id: "keep-evidence",
    title: t("rec.keepEvidence.title"),
    rationale: t("rec.keepEvidence.why"),
    priority: "when_possible",
  });

  if (originIata) {
    push({
      id: "airport-help-desk",
      title: t("rec.airportHelpDesk.title", { airport: originIata }),
      rationale: t("rec.airportHelpDesk.why"),
      priority: "when_possible",
    });
  }

  if (destinationIata) {
    push({
      id: "destination-arrangements",
      title: t("rec.destinationArrangements.title", { airport: destinationIata }),
      rationale: t("rec.destinationArrangements.why"),
      priority: "when_possible",
    });
  }

  return actions;
}

/**
 * Renders a constraint list for the timeline detail.
 *
 * The program type and average delay are source identifiers, not prose, so they
 * are shown as the source publishes them rather than translated.
 */
function describeConstraintList(constraints: AirportConstraint[]): string | undefined {
  return (
    constraints
      .map(
        (c) =>
          `${c.programType.replace(/_/g, " ")}${
            c.averageDelay ? ` (${c.averageDelay})` : ""
          }`,
      )
      .join("; ") || undefined
  );
}

/**
 * Compares two snapshots and reports only meaningful differences.
 *
 * The timeline is built from this, which is why the interface never shows a
 * fabricated update history: an event exists only if two real retrievals differ.
 */
export interface DetectedChange {
  key: string;
  label: string;
  detail?: string;
}

export function detectChanges(
  previous: FlightIntel | undefined,
  current: FlightIntel,
  t: Translate,
): DetectedChange[] {
  const changes: DetectedChange[] = [];
  if (!previous) return changes;

  const previousCategory = previous.originWeather?.flightCategory;
  const currentCategory = current.originWeather?.flightCategory;
  if (previousCategory !== currentCategory && currentCategory) {
    changes.push({
      key: "origin-weather",
      label: t("change.weatherCategory", {
        airport: current.origin?.iata ?? current.origin?.icao ?? t("prose.departureAirport"),
      }),
      detail: previousCategory
        ? t("change.weatherMoved", { from: previousCategory, to: currentCategory })
        : t("change.weatherNowReporting", { category: currentCategory }),
    });
  }

  const previousDestinationCategory = previous.destinationWeather?.flightCategory;
  const currentDestinationCategory = current.destinationWeather?.flightCategory;
  if (
    previousDestinationCategory !== currentDestinationCategory &&
    currentDestinationCategory
  ) {
    changes.push({
      key: "destination-weather",
      label: t("change.weatherCategory", {
        airport:
          current.destination?.iata ?? current.destination?.icao ?? t("prose.arrivalAirport"),
      }),
      detail: previousDestinationCategory
        ? t("change.weatherMoved", {
            from: previousDestinationCategory,
            to: currentDestinationCategory,
          })
        : t("change.weatherNowReporting", { category: currentDestinationCategory }),
    });
  }

  const constraintKey = (constraints: AirportConstraint[]) =>
    constraints
      .map((c) => `${c.airport}:${c.programType}:${c.averageDelay ?? ""}`)
      .sort()
      .join("|");

  const previousOrigin = constraintKey(previous.originConstraints);
  const currentOrigin = constraintKey(current.originConstraints);
  if (previousOrigin !== currentOrigin) {
    changes.push({
      key: "origin-constraints",
      label: currentOrigin
        ? t("change.restrictionNew", {
            airport:
              current.origin?.iata ?? current.origin?.icao ?? t("prose.theDepartureAirport"),
          })
        : t("change.restrictionLifted", {
            airport:
              current.origin?.iata ?? current.origin?.icao ?? t("prose.theDepartureAirport"),
          }),
      detail: describeConstraintList(current.originConstraints),
    });
  }

  const previousDestination = constraintKey(previous.destinationConstraints);
  const currentDestination = constraintKey(current.destinationConstraints);
  if (previousDestination !== currentDestination) {
    changes.push({
      key: "destination-constraints",
      label: currentDestination
        ? t("change.restrictionNew", {
            airport:
              current.destination?.iata ?? current.destination?.icao ?? t("prose.theArrivalAirport"),
          })
        : t("change.restrictionLifted", {
            airport:
              current.destination?.iata ?? current.destination?.icao ?? t("prose.theArrivalAirport"),
          }),
      detail: describeConstraintList(current.destinationConstraints),
    });
  }

  const previousPhase = previous.liveTrack?.altitudeFt !== undefined
    ? previous.liveTrack.altitudeFt > 500
      ? "airborne"
      : "ground"
    : "unknown";
  const currentPhase = current.liveTrack?.altitudeFt !== undefined
    ? current.liveTrack.altitudeFt > 500
      ? "airborne"
      : "ground"
    : "unknown";
  if (previousPhase !== currentPhase && currentPhase !== "unknown") {
    changes.push({
      key: "track-phase",
      label:
        currentPhase === "airborne"
          ? t("change.observedAirborne")
          : t("change.observedOnGround"),
      detail: current.liveTrack?.observedAt
        ? t("change.observedAt", { time: current.liveTrack.observedAt })
        : undefined,
    });
  }

  return changes;
}
