/**
 * Flight intelligence aggregation.
 *
 * Gathers every available signal for one flight in parallel, normalises it into
 * `FlightIntel`, and attaches a source record for each upstream that answered.
 * Partial failure is expected and handled: a missing signal degrades the picture
 * and is reported, rather than failing the whole request.
 */

import type { Translate } from "@/lib/i18n/translator";
import { lookupAirport } from "@/lib/providers/airports";
import { getMetar, getTaf, AVIATION_WEATHER_SOURCE } from "@/lib/providers/aviationWeather";
import { getAirportConstraints, FAA_SOURCE } from "@/lib/providers/faaStatus";
import { getLiveTrack, LIVE_TRACKING_SOURCE } from "@/lib/providers/liveTracking";
import type { LiveTrackResult } from "@/lib/providers/liveTracking";
import { lookupRoute, ROUTE_SOURCE } from "@/lib/providers/routeReference";
import { nowIso } from "@/lib/core/time";
import type {
  AirportConstraint,
  AirportRef,
  DataState,
  FlightIntel,
  SourceRef,
} from "@/lib/core/types";

/** Picks the least reliable state when combining several upstream results. */
function combineStates(states: DataState[]): DataState {
  if (states.length === 0) return "unavailable";
  if (states.every((state) => state === "unavailable")) return "unavailable";
  if (states.includes("stale")) return "stale";
  if (states.includes("cached")) return "cached";
  if (states.includes("demo")) return "demo";
  return "live";
}

function worstState(states: DataState[]): DataState {
  const rank: Record<DataState, number> = {
    live: 0,
    demo: 1,
    cached: 2,
    stale: 3,
    unavailable: 4,
  };
  if (states.length === 0) return "unavailable";
  return states.reduce((worst, state) =>
    rank[state] > rank[worst] ? state : worst,
  );
}

/**
 * Reports when the route table and the traveller's stated airport disagree.
 *
 * The route table is a general index keyed by flight number, so a flight number
 * reused across seasons or codeshares can point somewhere else entirely. That is
 * worth telling the traveller about rather than hiding, because it means the
 * weather and airspace picture we retrieved is for the airport they named, not
 * for the one the route table lists.
 */
function describeRouteConflict(
  routeAirport: AirportRef | undefined,
  statedAirport: AirportRef,
  leg: "departure" | "arrival",
  t: Translate,
): string | undefined {
  if (!routeAirport) return undefined;
  const sameAirport =
    (routeAirport.icao && statedAirport.icao && routeAirport.icao === statedAirport.icao) ||
    (routeAirport.iata && statedAirport.iata && routeAirport.iata === statedAirport.iata);
  if (sameAirport) return undefined;

  const routeLabel = routeAirport.iata ?? routeAirport.icao ?? t("caveat.unknownAirport");
  const statedLabel = statedAirport.iata ?? statedAirport.icao ?? t("caveat.statedAirport");
  return t("caveat.routeConflict", {
    route: routeLabel,
    leg: leg === "departure" ? t("caveat.legDeparture") : t("caveat.legArrival"),
    stated: statedLabel,
  });
}

export interface GatherOptions {
  flightNumber: string;
  date?: string;
  originHint?: string;
  destinationHint?: string;
  signal?: AbortSignal;
  /** Message lookup bound to the request locale, for traveller-facing caveats. */
  t: Translate;
}

export async function gatherFlightIntel(options: GatherOptions): Promise<FlightIntel> {
  const { t } = options;
  const warnings: string[] = [];
  const sources: SourceRef[] = [];
  const retrievedAt = nowIso();

  const route = await lookupRoute(options.flightNumber);

  if (route.state === "unavailable") {
    // The provider error text is developer-facing English; the traveller gets
    // the localized caveat, and the detail is kept out of the interface.
    warnings.push(t("caveat.noRouteReference"));
  }

  // Traveller-supplied airports take precedence over the route table, because the
  // traveller knows their actual itinerary and the route table is a general index.
  //
  // The two sources are never mixed within a single record: a name from one
  // airport attached to the code of another produces an airport that does not
  // exist. Each record therefore comes wholly from one source, and a disagreement
  // between them is disclosed rather than silently resolved.
  let origin = route.origin;
  let destination = route.destination;

  if (options.originHint) {
    const hint = await lookupAirport(options.originHint);
    if (hint.airport) {
      const replaced = describeRouteConflict(route.origin, hint.airport, "departure", t);
      origin = hint.airport;
      if (replaced) warnings.push(replaced);
    } else {
      warnings.push(
        t("caveat.hintUnresolved", {
          leg: t("caveat.legDeparture"),
          code: options.originHint,
        }),
      );
    }
  }

  if (options.destinationHint) {
    const hint = await lookupAirport(options.destinationHint);
    if (hint.airport) {
      const replaced = describeRouteConflict(route.destination, hint.airport, "arrival", t);
      destination = hint.airport;
      if (replaced) warnings.push(replaced);
    } else {
      warnings.push(
        t("caveat.hintUnresolved", {
          leg: t("caveat.legArrival"),
          code: options.destinationHint,
        }),
      );
    }
  }

  const originIcao = origin?.icao;
  const destinationIcao = destination?.icao;
  const callsignIcao = route.callsignIcao;

  const [originWeatherResult, destinationWeatherResult, originForecastResult, destinationForecastResult, constraintResult, trackResult] =
    await Promise.all([
      originIcao ? getMetar(originIcao) : Promise.resolve(undefined),
      destinationIcao ? getMetar(destinationIcao) : Promise.resolve(undefined),
      originIcao ? getTaf(originIcao) : Promise.resolve(undefined),
      destinationIcao ? getTaf(destinationIcao) : Promise.resolve(undefined),
      getAirportConstraints([origin?.iata, origin?.icao, destination?.iata, destination?.icao]),
      callsignIcao
        ? getLiveTrack(callsignIcao)
        : Promise.resolve<LiveTrackResult>({
            state: "unavailable" as DataState,
            notObserved: false,
            error: "No ICAO callsign could be determined for this flight.",
          }),
    ]);

  const weatherStates: DataState[] = [];
  if (originWeatherResult) weatherStates.push(originWeatherResult.state);
  if (destinationWeatherResult) weatherStates.push(destinationWeatherResult.state);
  if (originForecastResult) weatherStates.push(originForecastResult.state);
  if (destinationForecastResult) weatherStates.push(destinationForecastResult.state);

  if (originWeatherResult?.state === "unavailable" && originIcao) {
    warnings.push(
      t("caveat.noWeatherFor", {
        airport: origin?.iata ?? originIcao,
        icao: originIcao,
      }),
    );
  }
  if (destinationWeatherResult?.state === "unavailable" && destinationIcao) {
    warnings.push(
      t("caveat.noWeatherFor", {
        airport: destination?.iata ?? destinationIcao,
        icao: destinationIcao,
      }),
    );
  }

  // --- Sources ------------------------------------------------------------
  if (route.state !== "unavailable") {
    sources.push({
      id: "route-reference",
      organization: ROUTE_SOURCE.organization,
      title: t("sourceTitle.routeRef", { flight: route.callsignIcao ?? options.flightNumber }),
      url: ROUTE_SOURCE.url,
      retrievedAt,
      tier: "secondary",
      kind: "route_reference",
      state: route.state,
      note: t("sourceNote.routeRef"),
    });
  }

  if (originWeatherResult?.observation) {
    sources.push({
      id: "origin-metar",
      organization: AVIATION_WEATHER_SOURCE.organization,
      title: t("sourceTitle.metar", { airport: origin?.name ?? originIcao ?? "", code: originIcao ?? "" }),
      url: `https://aviationweather.gov/api/data/metar?ids=${originIcao}&format=json`,
      retrievedAt: originWeatherResult.observation.reportedAt ?? retrievedAt,
      publishedAt: originWeatherResult.observation.observedAt,
      tier: "primary",
      kind: "aviation_weather",
      state: originWeatherResult.state,
      note: originWeatherResult.observation.raw,
    });
  }

  if (destinationWeatherResult?.observation) {
    sources.push({
      id: "destination-metar",
      organization: AVIATION_WEATHER_SOURCE.organization,
      title: t("sourceTitle.metar", { airport: destination?.name ?? destinationIcao ?? "", code: destinationIcao ?? "" }),
      url: `https://aviationweather.gov/api/data/metar?ids=${destinationIcao}&format=json`,
      retrievedAt: destinationWeatherResult.observation.reportedAt ?? retrievedAt,
      publishedAt: destinationWeatherResult.observation.observedAt,
      tier: "primary",
      kind: "aviation_weather",
      state: destinationWeatherResult.state,
      note: destinationWeatherResult.observation.raw,
    });
  }

  if (originForecastResult?.forecast) {
    sources.push({
      id: "origin-taf",
      organization: AVIATION_WEATHER_SOURCE.organization,
      title: t("sourceTitle.taf", { airport: origin?.name ?? originIcao ?? "", code: originIcao ?? "" }),
      url: `https://aviationweather.gov/api/data/taf?ids=${originIcao}&format=json`,
      retrievedAt: originForecastResult.forecast.issuedAt ?? retrievedAt,
      publishedAt: originForecastResult.forecast.issuedAt,
      tier: "primary",
      kind: "aviation_weather",
      state: originForecastResult.state,
      note: originForecastResult.forecast.raw,
    });
  }

  if (destinationForecastResult?.forecast) {
    sources.push({
      id: "destination-taf",
      organization: AVIATION_WEATHER_SOURCE.organization,
      title: t("sourceTitle.taf", { airport: destination?.name ?? destinationIcao ?? "", code: destinationIcao ?? "" }),
      url: `https://aviationweather.gov/api/data/taf?ids=${destinationIcao}&format=json`,
      retrievedAt: destinationForecastResult.forecast.issuedAt ?? retrievedAt,
      publishedAt: destinationForecastResult.forecast.issuedAt,
      tier: "primary",
      kind: "aviation_weather",
      state: destinationForecastResult.state,
      note: destinationForecastResult.forecast.raw,
    });
  }

  sources.push({
    id: "faa-nasstatus",
    organization: FAA_SOURCE.organization,
    title: t("sourceTitle.faa"),
    url: FAA_SOURCE.url,
    retrievedAt,
    publishedAt: constraintResult.updatedAt,
    tier: "primary",
    kind: "airport_status",
    state: constraintResult.state,
    note:
      constraintResult.state === "unavailable"
        ? t("sourceNote.faaUnreachable")
        : t("sourceNote.faaScope"),
  });

  if (callsignIcao) {
    sources.push({
      id: "live-tracking",
      organization: LIVE_TRACKING_SOURCE.organization,
      title: t("sourceTitle.liveObs", { callsign: callsignIcao }),
      url: `https://api.adsb.lol/v2/callsign/${callsignIcao}`,
      retrievedAt,
      publishedAt: trackResult.track?.observedAt,
      tier: "secondary",
      kind: "live_tracking",
      state: trackResult.state,
      note: trackResult.notObserved
        ? t("sourceNote.trackNotVisible")
        : t("sourceNote.trackScope"),
    });
  }

  // --- Weather caveat when nothing was published --------------------------
  const weatherState = combineStates(weatherStates);
  const airportStatusState = constraintResult.state;

  if (weatherState === "unavailable") {
    warnings.push(t("caveat.noWeather"));
  }

  if (constraintResult.state === "unavailable") {
    warnings.push(t("caveat.faaUnreachable"));
  } else if (constraintResult.constraints.length === 0 && origin?.countryCode !== "US") {
    warnings.push(t("caveat.faaUsOnly"));
  }

  if (trackResult.error && callsignIcao) {
    warnings.push(t("caveat.trackingUnavailable"));
  }

  return {
    flightNumber: route.callsignIata ?? options.flightNumber.toUpperCase(),
    callsignIcao,
    airline: route.airline,
    origin,
    destination,
    routeState: route.state,
    routeConfidence: route.confidence,
    liveTrack: trackResult.track,
    liveTrackState: trackResult.state,
    originWeather: originWeatherResult?.observation,
    destinationWeather: destinationWeatherResult?.observation,
    originForecast: originForecastResult?.forecast,
    destinationForecast: destinationForecastResult?.forecast,
    originConstraints: constraintResult.constraints.filter(
      (constraint: AirportConstraint) =>
        constraint.airport === origin?.iata || constraint.airport === origin?.icao,
    ),
    destinationConstraints: constraintResult.constraints.filter(
      (constraint: AirportConstraint) =>
        constraint.airport === destination?.iata || constraint.airport === destination?.icao,
    ),
    weatherState,
    airportStatusState,
    sources,
    warnings: [...new Set(warnings)],
    retrievedAt,
  };
}

/** Overall confidence in the picture, used for the headline status banner. */
export function overallDataState(intel: FlightIntel): DataState {
  return worstState([
    intel.routeState,
    intel.weatherState,
    intel.airportStatusState,
    intel.liveTrackState,
  ]);
}
