/**
 * Shared domain model.
 *
 * Every fact carries provenance. Nothing reaches the UI without a `DataState`
 * and, where relevant, a `SourceRef`, so the interface can always tell the
 * traveller how a value was obtained and how much to trust it.
 */

/** How confident we are that a value still reflects reality right now. */
export type DataState = "live" | "cached" | "stale" | "unavailable" | "demo";

/** Confidence class shown against individual facts. */
export type Confidence = "verified" | "corroborated" | "unconfirmed" | "unknown";

export type SourceTier = "primary" | "secondary";

export type SourceKind =
  | "aviation_weather"
  | "airport_status"
  | "route_reference"
  | "live_tracking"
  | "flight_status"
  | "passenger_rights"
  | "airline_reference"
  | "public_transport"
  | "road_status"
  | "weather_warning"
  | "emergency_notice"
  | "public_notice";

export interface SourceRef {
  id: string;
  organization: string;
  title: string;
  url: string;
  /** When WAYFINDER retrieved this data. */
  retrievedAt: string;
  /** When the publisher issued it, if the publisher states it. */
  publishedAt?: string;
  tier: SourceTier;
  kind: SourceKind;
  state: DataState;
  note?: string;
}

export interface AirportRef {
  iata?: string;
  icao?: string;
  name?: string;
  municipality?: string;
  countryCode?: string;
  countryName?: string;
  latitude?: number;
  longitude?: number;
  elevationM?: number;
  timeZone?: string;
}

export interface AirlineRef {
  name: string;
  iata?: string;
  icao?: string;
  country?: string;
}

/** Airborne state observed directly by the ADS-B network. */
export interface LiveTrack {
  callsign?: string;
  registration?: string;
  aircraftType?: string;
  altitudeFt?: number;
  groundSpeedKt?: number;
  headingDeg?: number;
  latitude?: number;
  longitude?: number;
  squawk?: string;
  emergency?: string;
  /** Seconds since the network last heard from this aircraft. */
  seenSeconds?: number;
  observedAt?: string;
}

export interface WeatherObservation {
  icao: string;
  stationName?: string;
  observedAt?: string;
  reportedAt?: string;
  /** VFR / MVFR / IFR / LIFR as classified by the source. */
  flightCategory?: string;
  windDirectionDeg?: number;
  windSpeedKt?: number;
  windGustKt?: number;
  visibility?: string;
  temperatureC?: number;
  dewpointC?: number;
  altimeterHpa?: number;
  cloudCover?: string;
  raw?: string;
}

export interface WeatherForecastPeriod {
  from: string;
  to: string;
  changeType?: string;
  probability?: number;
  windDirectionDeg?: number;
  windSpeedKt?: number;
  windGustKt?: number;
  visibility?: string;
  /** Cloud layers as "OVC007" style codes from the raw forecast. */
  cloudLayers?: string[];
  weather?: string[];
}

export interface WeatherForecast {
  icao: string;
  stationName?: string;
  issuedAt?: string;
  validFrom?: string;
  validTo?: string;
  raw?: string;
  periods: WeatherForecastPeriod[];
}

/** FAA Air Traffic Control System Command Center constraint for an airport. */
export interface AirportConstraint {
  airport: string;
  programType: "ground_stop" | "ground_delay" | "arrival_departure_delay" | "closure";
  reason?: string;
  averageDelay?: string;
  maximumDelay?: string;
  endTime?: string;
}

export interface AirportStatusReport {
  updatedAt?: string;
  constraints: AirportConstraint[];
}

/** Everything WAYFINDER knows about one flight, with provenance attached. */
export interface FlightIntel {
  /** As entered by the traveller, normalised: e.g. "BA123". */
  flightNumber: string;
  /** ICAO callsign used by tracking networks: e.g. "BAW123". */
  callsignIcao?: string;
  airline?: AirlineRef;
  origin?: AirportRef;
  destination?: AirportRef;
  /** Route lookup outcome, independent of live tracking. */
  routeState: DataState;
  routeConfidence: Confidence;
  liveTrack?: LiveTrack;
  liveTrackState: DataState;
  originWeather?: WeatherObservation;
  destinationWeather?: WeatherObservation;
  originForecast?: WeatherForecast;
  destinationForecast?: WeatherForecast;
  originConstraints: AirportConstraint[];
  destinationConstraints: AirportConstraint[];
  weatherState: DataState;
  airportStatusState: DataState;
  sources: SourceRef[];
  /** Non-fatal problems encountered while gathering, shown as caveats. */
  warnings: string[];
  retrievedAt: string;
}

/** Where a single flight sits in its lifecycle, as far as we can verify. */
export type FlightPhase =
  | "not_yet_departed"
  | "airborne"
  | "arrived"
  | "no_signal"
  | "unknown";

export interface DerivedSignals {
  phase: FlightPhase;
  phaseBasis: string;
  weatherSeverity: "none" | "low" | "moderate" | "high" | "unknown";
  weatherBasis: string[];
  airportDisruption: boolean;
  airportDisruptionBasis: string[];
  /** 0-100, derived and explicitly labelled as an assessment, never a fact. */
  disruptionScore: number;
  disruptionLabel: string;
  disruptionBasis: string[];
}

export type RecommendationPriority = "now" | "soon" | "when_possible";

export interface Recommendation {
  id: string;
  rank: number;
  title: string;
  /** Why this matters, in plain language. */
  rationale: string;
  priority: RecommendationPriority;
  /** Official destination, when one exists. */
  actionUrl?: string;
  actionLabel?: string;
  sourceIds?: string[];
}

export interface TimelineEvent {
  id: string;
  at: string;
  label: string;
  detail?: string;
  /** Only ever set when a real change was detected between two retrievals. */
  change?: boolean;
  sourceIds?: string[];
}

export interface RightsNote {
  id: string;
  jurisdiction: string;
  instrument: string;
  summary: string;
  url: string;
  organization: string;
  /** Verbatim text from the official source that supports `summary`. */
  quote: string;
  /** Date the URL and quote were last checked by a human or a build-time check. */
  checkedAt: string;
  /** True when this may apply to the route; never a determination of eligibility. */
  possiblyApplies: boolean;
  appliesBecause?: string;
}

export type AssistanceNeed =
  | "cancelled"
  | "delayed"
  | "connection"
  | "gate_change"
  | "announcement"
  | "options"
  | "other";
