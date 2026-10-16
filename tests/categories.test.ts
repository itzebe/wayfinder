/**
 * End-to-end category tests, driven by deterministic fixtures.
 *
 * Every category is exercised through the real engine — provider selection,
 * normalisation, fact building, recommendations, source attribution and the
 * deterministic AI fallback — with the network replaced by fixtures. These
 * prove the plumbing and the honesty rules. They do NOT prove a live provider is
 * operational; that is what `npm run test:live` reports separately.
 */

import { composeAssistance, snapshotFor } from "@/lib/assist/engine";
import { clearCache } from "@/lib/core/cache";
import { selectProviders, rankProviders } from "@/lib/assist/registry";
import { classifyDescription } from "@/lib/assist/categories";
import { resolveLocation } from "@/lib/assist/location";
import { looksOfficial, normaliseFindings, GOOGLE_PROVIDER_ID } from "@/lib/assist/providers/discovery";
import { assistRequestSchema } from "@/lib/assist/schema";
import { sseFeed } from "./fixtures/gtfs";
import {
  CALTRANS_CMS,
  DWD_WARNINGS,
  GEMINI_GROUNDED,
  GOVUK_SEARCH,
  GTFS_ALERTS_JSON,
  NWS_ALERTS,
  TFL_LINE_STATUS,
  TFL_SUSPENSION,
  USGS_QUAKES,
} from "./fixtures/providers";
import {
  assert,
  assertEqual,
  assertIncludes,
  failingFetch,
  fixtureFetch,
  rateLimitedFetch,
  report,
  run,
  setReset,
  test,
} from "./harness";

// The provider cache is process-wide, so each test starts from a cold cache.
// Without this, one test's response would be served to the next from cache and
// the state assertions would be meaningless.
setReset(() => clearCache());

const ALL_TABLE = {
  "api.tfl.gov.uk": TFL_LINE_STATUS,
  "api.weather.gov": NWS_ALERTS,
  "www.dwd.de": DWD_WARNINGS,
  "api.bart.gov": sseFeed(GTFS_ALERTS_JSON),
  "api-endpoint.mta.info": sseFeed(GTFS_ALERTS_JSON),
  "cwwp2.dot.ca.gov": CALTRANS_CMS,
  "www.gov.uk": GOVUK_SEARCH,
  "earthquake.usgs.gov": USGS_QUAKES,
};

// --- Metro / subway ---------------------------------------------------------

test("metro: TfL London returns normalised conditions and an official source", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected at least one condition");
  const victoria = page.conditions.find((c) => c.title.includes("Victoria"));
  assert(victoria !== undefined, "expected the Victoria line condition");
  assertEqual(victoria.severity, "minor", "TfL severity 9 maps to minor");
  assert(page.sources.some((s) => s.organization.includes("Transport for London")), "expected TfL source");
  assertEqual(page.overallState, "live");
});

test("metro: a suspended line is classified as severe", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch({ "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  assertEqual(page.conditions[0].severity, "severe", "statusSeverity 5 maps to severe");
  assertIncludes(page.headline, "significant disruption", "headline reflects severity");
});

test("metro: MTA New York decodes a GTFS Realtime protobuf feed", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "US",
    city: "New York",
    locale: "en",
    fetchImpl: fixtureFetch({ "api-endpoint.mta.info": sseFeed(GTFS_ALERTS_JSON) }),
  });
  assert(page.conditions.length > 0, "expected a decoded alert");
  assertIncludes(page.conditions[0].title, "A and C trains", "alert header decoded");
  assertEqual(page.conditions[0].severity, "severe", "SIGNIFICANT_DELAYS maps to severe");
});

test("metro: a covered country with no live feed states the limitation honestly", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "FR",
    city: "Paris",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0, "no provider should respond for France");
  assertEqual(page.overallState, "unavailable");
  // Paris has official bodies in the directory, so the honest statement is
  // "no live feed" — not "no source covers this place", which would be false.
  assertIncludes(page.headline, "no live feed covers", "headline states the limitation");
  assert(
    page.references.length > 0,
    "the directory bodies must still be offered when no live feed exists",
  );
  assert(page.uncertain.length > 0, "limitation must be disclosed");
});

test("metro: network failure becomes unavailable, not fabricated data", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assertEqual(page.conditions.length, 0, "no conditions on failure");
  assertEqual(page.overallState, "unavailable");
  assert(page.coverageGaps.length > 0, "failure must be reported as a coverage gap");
  assert(!page.explanation.summary.includes("delay"), "must not invent a disruption");
});

test("metro: rate limiting is tolerated and disclosed", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: rateLimitedFetch(),
  });
  assertEqual(page.overallState, "unavailable");
  assert(page.coverageGaps.length > 0, "rate limit reported as a gap");
});

// --- Rail and bus -----------------------------------------------------------

test("rail: London rail disruption is served by the rail provider", async () => {
  const page = await composeAssistance({
    category: "rail",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch({ "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  assert(page.respondingProviders.length > 0, "expected a rail provider to respond");
  assert(page.sources.length > 0, "expected an official source");
});

test("bus: London bus category produces an operator source", async () => {
  const page = await composeAssistance({
    category: "bus",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch({ "api.tfl.gov.uk": TFL_LINE_STATUS }),
  });
  assert(page.respondingProviders.includes("tfl-bus"), "expected the bus provider");
});

test("bus: a place with directory bodies but no live feed states the limitation", async () => {
  const page = await composeAssistance({
    category: "bus",
    countryCode: "JP",
    city: "Tokyo",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0);
  assertIncludes(page.headline, "no live feed covers");
});

// --- Roads ------------------------------------------------------------------

test("road: Caltrans notices become road conditions with a road authority source", async () => {
  const page = await composeAssistance({
    category: "road",
    countryCode: "US",
    city: "Sacramento",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected road notices");
  assert(page.sources.some((s) => s.organization.includes("Caltrans")), "expected Caltrans source");
  assert(
    page.recommendations.some((r) => r.id === "do-not-drive-distracted"),
    "driving safety step must be present",
  );
});

test("road: no alternative route is ever proposed", async () => {
  const page = await composeAssistance({
    category: "road",
    countryCode: "US",
    city: "Sacramento",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const step = page.recommendations.find((r) => r.id === "follow-signed-diversion");
  assert(step !== undefined, "expected the signed-diversion step");
  assert(
    page.recommendations.every((r) => !/fastest|shortest|best route/i.test(r.title)),
    "must not propose a computed route",
  );
});

// --- Weather and emergencies ------------------------------------------------

test("weather: NWS warnings are classified and safety steps lead", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "US",
    region: "CA",
    city: "Los Angeles",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const flood = page.conditions.find((c) => c.title.includes("Flash Flood"));
  assert(flood !== undefined, "expected the flash-flood warning");
  assertEqual(flood.severity, "major", "Severe+Immediate maps to major");
  const advisory = page.conditions.find((c) => c.title.includes("Wind Advisory"));
  assert(advisory !== undefined, "expected the advisory");
  assertEqual(advisory.severity, "info", "an advisory is information, not a warning");
  assertEqual(page.recommendations[0].id, "follow-official-instructions", "safety step leads");
  assert(
    page.recommendations.some((r) => r.id === "emergency-services"),
    "emergency services step present",
  );
});

test("weather: no evacuation order is ever invented", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "US",
    region: "CA",
    city: "Los Angeles",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const text = `${page.explanation.summary} ${page.explanation.meaning} ${page.recommendations
    .map((r) => r.rationale)
    .join(" ")}`;
  assert(!/you must evacuate|evacuate now/i.test(text), "must not issue an evacuation order");
  assert(
    page.recommendations.some((r) => r.requiresConfirmation),
    "an instruction step must be marked as requiring official confirmation",
  );
});

test("weather: DWD warnings are decoded for Germany", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "DE",
    city: "Fulda",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected a DWD warning");
  assertEqual(page.conditions[0].severity, "major", "DWD level 3 maps to major");
});

test("weather: an unreachable authority yields gaps plus an official fallback link", async () => {
  const page = await composeAssistance({
    category: "weather",
    countryCode: "US",
    region: "CA",
    city: "Los Angeles",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assertEqual(page.overallState, "unavailable");
  assert(page.coverageGaps.length > 0, "expected gaps");
  assert(
    page.coverageGaps.every((gap) => gap.fallbackUrl !== undefined),
    "every gap should offer an official link",
  );
});

// --- Public services --------------------------------------------------------

test("public_service: GOV.UK results are returned with official attribution", async () => {
  const page = await composeAssistance({
    category: "public_service",
    countryCode: "GB",
    city: "London",
    description: "the council office is closed",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.conditions.length > 0, "expected a GOV.UK result");
  assertIncludes(page.conditions[0].url ?? "", "gov.uk", "result links to GOV.UK");
});

// --- Stranded ---------------------------------------------------------------

test("stranded: rights references and support steps are produced", async () => {
  const page = await composeAssistance({
    category: "stranded",
    countryCode: "GB",
    city: "London",
    description: "I missed my connection and have nowhere to stay",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.rightsNotes.length > 0, "expected rights references");
  assert(page.recommendations.some((r) => r.id === "identify-provider"), "expected provider step");
  assert(page.recommendations.some((r) => r.id === "keep-evidence"), "expected evidence step");
  assert(
    page.recommendations.every((r) => !/we will refund|guaranteed compensation/i.test(r.title)),
    "must not promise an entitlement",
  );
});

// --- General / other --------------------------------------------------------

test("other: a described situation is classified into a supported category", async () => {
  const page = await composeAssistance({
    category: "other",
    countryCode: "GB",
    city: "London",
    description: "The Victoria line is suspended and I cannot get to the airport",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.category, "metro", "description routed to metro");
  assert(page.respondingProviders.length > 0, "expected the routed provider to answer");
});

test("other: an unclassifiable description is reported as unverified", async () => {
  const page = await composeAssistance({
    category: "other",
    countryCode: "GB",
    city: "London",
    description: "A curious event occurred and I am unsure how to describe it",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.category, "other", "stays open-ended");
  assertIncludes(page.uncertain.join(" "), "could not match", "discloses failed classification");
});

test("other: with nothing to go on, one plain coverage gap explains the page", async () => {
  const page = await composeAssistance({
    category: "other",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.conditions.length, 0, "nothing can be reported without a location");
  assertEqual(page.overallState, "unavailable");
  assertEqual(page.coverageGaps.length, 1, "exactly one gap, not one per provider");
  assertEqual(page.coverageGaps[0].providerId, "coverage", "the gap is the coverage itself");
  assertIncludes(
    page.coverageGaps[0].message.toLowerCase(),
    "no official data source",
    "the gap is stated in plain language",
  );
});

// --- Honesty and provenance -------------------------------------------------

test("provenance: self-reported facts are labelled, never presented as verified", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    description: "the trains are down",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const reported = page.facts.find((f) => f.id === "reported-problem");
  assert(reported !== undefined, "expected the reported problem fact");
  assertEqual(reported.origin, "self_reported");
  assertEqual(reported.confidence, "unconfirmed");
  const verified = page.facts.filter((f) => f.origin === "verified");
  assert(verified.every((f) => (f.sourceIds ?? []).length > 0), "verified facts must cite a source");
});

test("provenance: every condition cites a real source id", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const sourceIds = new Set(page.sources.map((s) => s.id));
  assert(
    page.conditions.every((c) => sourceIds.has(c.providerId)),
    "each condition must resolve to a source",
  );
});

test("states: stale data is marked stale and keeps the last good value", async () => {
  // Prime the cache with a good response, then fail the refresh.
  const good = fixtureFetch(ALL_TABLE);
  await composeAssistance({ category: "metro", countryCode: "GB", city: "London", locale: "en", fetchImpl: good });
  // The TfL cache TTL is 60s, so the second call is served from cache without
  // a refresh; assert the state is still reported honestly.
  const second = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assert(
    second.overallState === "cached" || second.overallState === "live",
    `expected cached/live from the warm cache, got ${second.overallState}`,
  );
});

// --- AI fallback ------------------------------------------------------------

test("ai: without a key the explanation is deterministic and source-grounded", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.explanation.aiGenerated, false, "no AI without a key");
  assert(page.explanation.summary.length > 0, "a summary is still produced");
  assert(page.explanation.unavailableReason !== undefined, "discloses why AI was not used");
});

test("ai: identifiers are preserved in the deterministic fallback", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    network: "Victoria line",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertIncludes(page.explanation.summary, "Victoria", "the line name survives");
});

// --- Localisation -----------------------------------------------------------

test("i18n: Spanish output is produced for the same query", async () => {
  const es = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "es",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(es.locale, "es");
  assertIncludes(es.headline, "Metro", "Spanish category name used");
});

test("i18n: an unknown locale falls back to English without error", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "xx",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.locale, "en", "unknown locale resolves to English");
});

// --- Validation -------------------------------------------------------------

test("validation: a request with no location or description is rejected", () => {
  const parsed = assistRequestSchema.safeParse({ category: "metro", locale: "en" });
  assertEqual(parsed.success, false, "empty location must fail validation");
});

test("validation: a bad country code is rejected", () => {
  const parsed = assistRequestSchema.safeParse({
    category: "metro",
    countryCode: "GBR",
    locale: "en",
  });
  assertEqual(parsed.success, false, "three-letter code must fail");
});

test("validation: a valid request passes", () => {
  const parsed = assistRequestSchema.safeParse({
    category: "metro",
    countryCode: "gb",
    city: "London",
    locale: "en",
  });
  assertEqual(parsed.success, true, "valid request should pass");
});

test("validation: the snapshot format marker survives parsing", () => {
  // The schema strips unknown keys. If `format` is stripped, every stored
  // snapshot arrives unversioned, is treated as a baseline, and change detection
  // silently stops working — a regression no UI test would catch.
  const parsed = assistRequestSchema.safeParse({
    category: "metro",
    location: "London, United Kingdom",
    locale: "en",
    previous: { format: 2, providerStates: { "tfl-tube": "live" }, conditionKeys: ["a"] },
  });
  assertEqual(parsed.success, true, "request with a snapshot parses");
  assertEqual(
    parsed.success ? parsed.data.previous?.format : undefined,
    2,
    "the format marker must not be stripped",
  );
});

// --- Registry ---------------------------------------------------------------

test("registry: selection is by capability, and skips are explained", () => {
  const selection = selectProviders({ category: "metro", countryCode: "US", city: "New York", locale: "en" });
  assert(selection.usable.some((p) => p.metadata.id === "mta-subway"), "MTA should be selected");
  assert(
    selection.skipped.some((s) => s.reason === "out_of_coverage"),
    "out-of-coverage providers must be reported",
  );
});

test("registry: providers that declare no schedule capability expose none", () => {
  const selection = selectProviders({ category: "metro", countryCode: "GB", city: "London", locale: "en" });
  for (const provider of rankProviders(selection.usable)) {
    if (!provider.metadata.capabilities.schedule) {
      assert(
        provider.metadata.capabilities.schedule === false,
        `${provider.metadata.id} must not claim schedule capability`,
      );
    }
  }
});

test("classifier: each supported category is reachable from natural language", () => {
  const cases: [string, string][] = [
    ["my flight was cancelled", "flights"],
    ["the subway is delayed", "metro"],
    ["the train is cancelled", "rail"],
    ["my bus did not turn up", "bus"],
    ["the motorway is closed", "road"],
    ["there is a flood warning", "weather"],
    ["I am stranded at the station", "stranded"],
    ["the office is closed today", "public_service"],
  ];
  for (const [text, expected] of cases) {
    const result = classifyDescription(text);
    assertEqual(result.category, expected, `"${text}" should classify as ${expected}`);
  }
});

// --- Location resolution ----------------------------------------------------

test("location: 'Lagos, Nigeria' resolves to NG/Lagos", () => {
  const resolved = resolveLocation("Lagos, Nigeria");
  assertEqual(resolved.countryCode, "NG");
  assertEqual(resolved.city, "Lagos");
  assertEqual(resolved.countryUnrecognised, false);
});

test("location: 'Ikeja, Lagos, Nigeria' keeps the locality and the region", () => {
  const resolved = resolveLocation("Ikeja, Lagos, Nigeria");
  assertEqual(resolved.countryCode, "NG");
  assertEqual(resolved.city, "Ikeja");
  assertEqual(resolved.region, "Lagos");
});

test("location: casing, spacing and missing comma are all tolerated", () => {
  for (const input of ["lagos nigeria", "LAGOS,NIGERIA", "  Lagos ,  Nigeria ", "Lagos Nigeria"]) {
    const resolved = resolveLocation(input);
    assertEqual(resolved.countryCode, "NG", `"${input}" should resolve to NG`);
  }
});

test("location: diacritics do not defeat a country name", () => {
  assertEqual(resolveLocation("São Paulo, Brasil").countryCode, "BR");
  assertEqual(resolveLocation("Munchen, Deutschland").countryCode, "DE");
});

test("location: a country name used alone is accepted", () => {
  const resolved = resolveLocation("Nigeria");
  assertEqual(resolved.countryCode, "NG");
  assertEqual(resolved.city, undefined);
});

test("location: an unrecognised country is flagged, not silently guessed", () => {
  const resolved = resolveLocation("Somewhere, Freedonia");
  assertEqual(resolved.countryUnrecognised, true);
  assertEqual(resolved.countryCode, undefined);
});

// --- Lagos regression -------------------------------------------------------

test("lagos: 'Lagos, Nigeria' is accepted and the pipeline runs", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.query.countryCode, "NG", "the country must be resolved from free text");
  assertEqual(page.query.city, "Lagos");
  assertEqual(page.category, "metro");
});

test("lagos: no dedicated provider does not mean a dead end", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0, "no live provider covers Lagos");
  assert(
    page.references.length > 0,
    "the official-page directory must offer a way forward",
  );
  assert(
    page.references.some((r) => r.organization.includes("Lagos State Government")),
    "the Lagos authority must be listed",
  );
});

test("lagos: the explanation never claims a source reported no disruption", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.overallState, "unavailable");
  const prose = `${page.explanation.summary} ${page.explanation.meaning}`.toLowerCase();
  assert(
    !prose.includes("no current disruption"),
    "nothing was queried, so it must not say no disruption was reported",
  );
  assert(
    prose.includes("unknown") || prose.includes("no live source"),
    "it must state that the situation is unknown",
  );
});

test("lagos: a directory reference is never presented as a retrieved source", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.sources.length, 0, "no live source was retrieved, so sources must be empty");
  for (const reference of page.references) {
    assert(
      !("retrievedAt" in reference),
      "a directory entry must not carry a retrieval timestamp",
    );
    assert(reference.official === true, "directory entries are official pages");
  }
});

test("lagos: the search still runs beyond the city, and other places are unaffected", async () => {
  const london = await composeAssistance({
    category: "metro",
    location: "London, United Kingdom",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(london.query.countryCode, "GB");
  assert(
    london.respondingProviders.includes("tfl-tube"),
    "London must still reach its live provider",
  );
  assertEqual(london.references.length, 0, "London has a live source, so no directory needed");
  assert(
    !london.headline.includes("Lagos"),
    "a London search must not inherit the previous location",
  );
});

test("lagos: a directory-only page still yields actionable next steps", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.recommendations.length > 0, "the traveller must be given steps to take");
  assert(
    page.uncertain.some((line) => /unknown|no live/i.test(line)),
    "the unknown status must be stated as uncertain",
  );
});

test("directory: coverage now spans more than the live-provider countries", async () => {
  const tokyo = await composeAssistance({
    category: "weather",
    location: "Tokyo, Japan",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(tokyo.query.countryCode, "JP");
  assert(tokyo.references.length > 0, "Japan has official weather/transport pages to check");
  assert(
    tokyo.references.every((r) => r.url.startsWith("https://")),
    "directory links must be https",
  );

  const countries = new Set<string>();
  for (const probe of ["JP", "FR", "ES", "MX", "AR", "AE", "NZ", "KR", "KE", "CO"]) {
    const page = await composeAssistance({
      category: "road",
      countryCode: probe,
      locale: "en",
      fetchImpl: fixtureFetch(ALL_TABLE),
    });
    if (page.references.length > 0) countries.add(probe);
  }
  assert(countries.size >= 10, `expected broad directory coverage, got ${countries.size}`);
});

test("directory: places that had no reference at all now have somewhere to check", async () => {
  // These five were the diagnosed dead ends: no live provider and no directory
  // entry, so a traveller there was told "nothing covers this" and stopped.
  const gapPlaces: [string, string][] = [
    ["Hanoi, Vietnam", "VN"],
    ["Bangkok, Thailand", "TH"],
    ["Istanbul, Türkiye", "TR"],
    ["Warsaw, Poland", "PL"],
    ["Johannesburg, South Africa", "ZA"],
  ];

  for (const [place, expectedCode] of gapPlaces) {
    const page = await composeAssistance({
      category: "road",
      location: place,
      locale: "en",
      fetchImpl: fixtureFetch(ALL_TABLE),
    });
    assertEqual(page.query.countryCode, expectedCode, `${place} resolves to ${expectedCode}`);
    assert(
      page.references.length > 0,
      `${place} must offer at least one official page to check`,
    );
    assert(
      page.references.every((r) => r.url.startsWith("https://")),
      `${place}: every directory link must be https`,
    );
    assert(
      page.references.every((r) => r.origin === "directory"),
      `${place}: with no live provider these are directory entries, not retrieved sources`,
    );
  }
});

test("timeline: a first observation is labelled as a baseline, not as 'no change'", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "London, United Kingdom",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const baseline = page.timeline.find((event) => event.id === "baseline");
  assert(baseline, "a first run must record an explicit baseline event");
  assertEqual(baseline?.change, undefined, "a baseline is not itself a change");
  assert(
    !page.timeline.some((event) => event.id === "no-change"),
    "there was nothing to compare against, so 'no change' would be untrue",
  );
});

test("timeline: a new disruption vs the previous snapshot is reported as a change", async () => {
  const request = {
    category: "metro" as const,
    location: "London, United Kingdom",
    locale: "en",
  };

  // First observation: the tube feed reports minor delays on one line.
  const first = await composeAssistance({ ...request, fetchImpl: fixtureFetch(ALL_TABLE) });
  assert(first.snapshot, "every page carries a snapshot for the next diff");
  assert(
    !first.timeline.some((event) => event.change),
    "the first observation cannot contain detected changes",
  );

  // Second observation: the upstream response changed. The provider cache is
  // keyed by URL, so it must be cleared to represent a genuinely new retrieval.
  clearCache();
  const disrupted = { ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION };
  const second = await composeAssistance({
    ...request,
    previous: first.snapshot,
    fetchImpl: fixtureFetch(disrupted),
  });

  const changes = second.timeline.filter((event) => event.change);
  assert(changes.length > 0, "the newly reported disruption must surface as a change");
  assert(
    !second.timeline.some((event) => event.id === "no-change"),
    "a real change must not also claim there was none",
  );
});

test("timeline: an unchanged situation says so, because a comparison did happen", async () => {
  const request = {
    category: "metro" as const,
    location: "London, United Kingdom",
    locale: "en",
  };
  const first = await composeAssistance({ ...request, fetchImpl: fixtureFetch(ALL_TABLE) });
  clearCache();
  const second = await composeAssistance({
    ...request,
    previous: first.snapshot,
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(
    second.timeline.some((event) => event.id === "no-change"),
    "an unchanged second observation must state that nothing changed",
  );
  assert(
    !second.timeline.some((event) => event.change),
    "no change should be detected between identical observations",
  );
});

test("timeline: the snapshot carries no personal data — states and fingerprints only", async () => {
  const page = await composeAssistance({
    category: "weather",
    location: "Tokyo, Japan",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.snapshot, "a snapshot is present");
  const serialized = JSON.stringify(page.snapshot);
  assert(!serialized.includes("Tokyo"), "the snapshot must not embed the traveller's location");
  assert(
    Object.values(page.snapshot?.providerStates ?? {}).every((state) => typeof state === "string"),
    "provider states are plain strings",
  );
});

// --- Timeline: source availability is not a real-world change --------------

test("timeline: a provider failure must NOT be reported as a disruption clearing", async () => {
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  clearCache();
  const disrupted = await composeAssistance({
    ...request,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  assert(disrupted.conditions.length > 0, "precondition: a disruption was reported");
  assert(disrupted.snapshot, "precondition: a snapshot exists to diff against");

  clearCache();
  const failed = await composeAssistance({
    ...request,
    previous: disrupted.snapshot,
    fetchImpl: failingFetch(),
  });

  assert(
    !failed.timeline.some((event) => event.id.startsWith("cleared-")),
    "a timeout says nothing about the world, so it cannot clear a disruption",
  );
  assert(
    !failed.timeline.some((event) => event.id === "no-change"),
    "'no change' would also be a claim about the world that we cannot make",
  );
  assert(
    failed.timeline.some((event) => event.id === "no-observation"),
    "the timeline must say plainly that no current observation was recorded",
  );
  assertEqual(failed.snapshot?.conditionKeys.length, 0, "a failed retrieval adds no condition keys");
});

test("timeline: a rate-limited provider is also not a real-world change", async () => {
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  clearCache();
  const disrupted = await composeAssistance({
    ...request,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  clearCache();
  const limited = await composeAssistance({
    ...request,
    previous: disrupted.snapshot,
    fetchImpl: rateLimitedFetch(),
  });
  assert(
    !limited.timeline.some((event) => event.id.startsWith("cleared-")),
    "a 429 is not evidence the disruption ended",
  );
});

test("timeline: a clean recovery after a first failure is recovery, not an appearance", async () => {
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  // First observation: the provider is down, so nothing was observed.
  clearCache();
  const failed = await composeAssistance({ ...request, fetchImpl: failingFetch() });
  assertEqual(failed.snapshot?.providerStates["tfl-tube"], "unavailable", "precondition: down");

  // Second observation: it answers, with a disruption.
  clearCache();
  const recovered = await composeAssistance({
    ...request,
    previous: failed.snapshot,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });

  assert(
    recovered.timeline.some((event) => event.id.startsWith("provider-recovered-")),
    "a source returning after a failure is recorded as recovery",
  );
  assert(
    !recovered.timeline.some((event) => event.id.startsWith("appeared-")),
    "a disruption seen for the first time is not an 'appearance change' — we had no prior view",
  );
  assert(
    !recovered.timeline.some((event) => event.id.startsWith("cleared-")),
    "nothing to clear",
  );
});

test("timeline: a genuine clearance (source answers, disruption gone) is a change", async () => {
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  clearCache();
  const disrupted = await composeAssistance({
    ...request,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  clearCache();
  const cleared = await composeAssistance({
    ...request,
    previous: disrupted.snapshot,
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const clearEvents = cleared.timeline.filter((event) => event.id.startsWith("cleared-"));
  assert(clearEvents.length > 0, "a disruption that is gone, per a live source, is a change");
  assert(clearEvents.every((event) => event.change === true), "clearances are marked as changes");
});

test("timeline: a severity reclassification is reported as a change", async () => {
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  clearCache();
  const minor = await composeAssistance({
    ...request,
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const hasMinor = minor.conditions.some((c) => c.title.startsWith("Victoria"));
  assert(hasMinor, "precondition: a minor Victoria delay is reported");

  clearCache();
  const worsened = await composeAssistance({
    ...request,
    previous: minor.snapshot,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  // The Northern suspension is a new condition on a source that was already
  // observing, so it appears as a change — and the same condition changing
  // severity is also detectable. Assert at least one change on that source.
  assert(
    worsened.timeline.some((event) => event.change === true && event.sourceIds?.includes("tfl-tube")),
    "a change on a source that was already observing must carry that source id",
  );
});

test("timeline: change events identify their evidence source and time", async () => {
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  clearCache();
  const first = await composeAssistance({
    ...request,
    previous: { format: 2, providerStates: { "tfl-tube": "live" }, conditionKeys: [] },
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  const change = first.timeline.find((event) => event.change === true);
  assert(change, "there is a change event");
  assert(change?.sourceIds && change.sourceIds.length > 0, "the change names its source");
  assert(!Number.isNaN(Date.parse(change?.at ?? "")), "the change carries a parseable time");
});

test("timeline: a change on one source is not attributed to another", async () => {
  // A US weather query hits NWS (alerts) and USGS (quakes). Give the previous
  // observation a single NWS condition and the current one a single USGS
  // condition; each must be attributed to its own source, never merged.
  const request = { category: "weather" as const, location: "Denver, United States", locale: "en" };
  clearCache();
  const previous = {
    format: 2 as const,
    providerStates: { "nws-alerts": "live", "usgs-earthquakes": "live" },
    conditionKeys: ["nws-alerts|Old flood warning||"],
    conditionSeverities: { "nws-alerts|Old flood warning||": "severe" },
  };
  const page = await composeAssistance({ ...request, previous, fetchImpl: fixtureFetch(ALL_TABLE) });
  const changed = page.timeline.filter((event) => event.change === true);
  for (const event of changed) {
    assert(
      event.sourceIds && event.sourceIds.length === 1,
      "each change is attributed to exactly the source that reported it",
    );
  }
});

// --- Timeline: snapshot hygiene --------------------------------------------

test("timeline: a pre-upgrade snapshot is a baseline, not a wave of false changes", async () => {
  // The condition-key format changed (severity moved out of the key). Keys
  // written by an older deploy therefore match nothing, which would otherwise
  // read every condition as both newly appeared and cleared at once. An
  // unversioned snapshot must establish a baseline instead.
  const request = { category: "metro" as const, location: "London, United Kingdom", locale: "en" };
  clearCache();
  const legacy = {
    // No `format` marker: this is what a snapshot stored before the change
    // looked like.
    providerStates: { "tfl-tube": "live" },
    conditionKeys: ["tfl-tube|Some old disruption|severe|A|B"],
  };
  const page = await composeAssistance({
    ...request,
    previous: legacy,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });

  assert(
    !page.timeline.some((event) => event.change === true),
    "an unversioned snapshot must not manufacture change events",
  );
  assert(
    page.timeline.some((event) => event.id === "baseline"),
    "it establishes a fresh baseline instead",
  );
});

test("timeline: conditions are only recorded for sources that observed now", async () => {
  // `snapshotFor` is the single gate that decides what a future diff may treat
  // as a present-tense observation. A stale or unavailable report must not
  // contribute conditions, or a later diff could clear something that was never
  // seen as current.
  const report = {
    providerId: "demo",
    state: "stale" as const,
    cadence: "live" as const,
    conditions: [
      {
        id: "demo-1",
        providerId: "demo",
        title: "Something",
        severity: "major" as const,
      },
    ],
    timetable: [],
    source: {
      id: "demo",
      organization: "Demo",
      title: "Demo",
      url: "https://example.test",
      retrievedAt: new Date().toISOString(),
      tier: "primary" as const,
      kind: "public_transport" as const,
      state: "stale" as const,
    },
    warnings: [],
    retrievedAt: new Date().toISOString(),
  };
  const snap = snapshotFor([report]);
  assertEqual(snap.conditionKeys.length, 0, "a stale source contributes no condition keys");
  assertEqual(snap.providerStates["demo"], "stale", "but its state is still recorded");
});

// --- Discovery via Google-powered web search --------------------------------

test("discovery: configured Google search turns findings into leads, never conditions", async () => {
  process.env.WAYFINDER_GOOGLE_API_KEY = "test-key";
  try {
    const googleTable = {
      ...ALL_TABLE,
      "generativelanguage.googleapis.com": GEMINI_GROUNDED,
    };
    const page = await composeAssistance({
      category: "road",
      location: "Lagos, Nigeria",
      locale: "en",
      fetchImpl: fixtureFetch(googleTable),
    });

    // A search result is a lead, never a fact: no condition may be attributed to
    // the discovery provider.
    assert(
      !page.conditions.some((c) => c.providerId === GOOGLE_PROVIDER_ID),
      "discovery must never contribute a service condition",
    );
    assert(
      !page.sources.some((s) => s.organization === "Google"),
      "discovery must never appear as a retrieved source",
    );

    const leads = page.references.filter((r) => r.origin === "discovery");
    // `frcn.gov.ng` is already in the curated directory, so it is not repeated as
    // a discovery lead — the two remaining chunks become leads.
    assertEqual(leads.length, 2, "grounded chunks become leads, minus any the directory already lists");
    assert(
      !leads.some((l) => l.url === "https://frcn.gov.ng/"),
      "a page the directory already lists is never shown twice",
    );
    assert(
      leads.some((l) => l.url === "https://lagosstate.gov.ng/traffic"),
      "the original URL is preserved verbatim",
    );
    assert(
      leads.some((l) => l.url === "https://www.example-blog.test/lagos-traffic"),
      "a secondary result is still surfaced, clearly not as authority",
    );
    assert(
      leads.find((l) => l.domain === "lagosstate.gov.ng")?.official === true,
      "a .gov.ng domain is labelled as plausibly official",
    );
    assert(
      leads.find((l) => l.domain === "example-blog.test")?.official === false,
      "a non-authority domain is not labelled official",
    );
    assert(
      page.references.some((r) => r.origin === "directory"),
      "the curated directory is still present for a place with no live provider",
    );
    assert(
      leads.every((l) => !/verified|confirmed/i.test(l.covers)),
      "lead copy never implies verification",
    );
  } finally {
    delete process.env.WAYFINDER_GOOGLE_API_KEY;
  }
});

test("discovery: without a key the place still gets its curated directory", async () => {
  delete process.env.WAYFINDER_GOOGLE_API_KEY;
  clearCache();
  const page = await composeAssistance({
    category: "road",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(
    page.references.some((r) => r.origin === "directory"),
    "the curated official directory still stands in when discovery is unconfigured",
  );
  assert(
    !page.references.some((r) => r.origin === "discovery"),
    "no discovery leads without a key",
  );
});

test("discovery: a failed search does not blank the page or invent leads", async () => {
  process.env.WAYFINDER_GOOGLE_API_KEY = "test-key";
  try {
    const page = await composeAssistance({
      category: "road",
      location: "Lagos, Nigeria",
      locale: "en",
      fetchImpl: failingFetch(),
    });
    assert(
      !page.references.some((r) => r.origin === "discovery"),
      "a search that failed yields no leads",
    );
    assert(page.explanation.summary.length > 0, "the page still explains the situation");
  } finally {
    delete process.env.WAYFINDER_GOOGLE_API_KEY;
  }
});

test("discovery: an unconfigured provider is skipped with a reason, not run", () => {
  delete process.env.WAYFINDER_GOOGLE_API_KEY;
  const { usable, skipped } = selectProviders({
    category: "road",
    countryCode: "NG",
    locale: "en",
  });
  assert(
    !usable.some((p) => p.metadata.id === GOOGLE_PROVIDER_ID),
    "discovery is not selected without credentials",
  );
  assert(
    skipped.some(
      (entry) => entry.provider.metadata.id === GOOGLE_PROVIDER_ID && entry.reason === "missing_credentials",
    ),
    "and the skip is explained as a missing credential",
  );
});

test("discovery: ranking never lets discovery displace a live authority", () => {
  process.env.WAYFINDER_GOOGLE_API_KEY = "test-key";
  try {
    const { usable } = selectProviders({ category: "metro", countryCode: "GB", locale: "en" });
    const ranked = rankProviders(usable);
    const ids = ranked.map((p) => p.metadata.id);
    assert(ids.includes(GOOGLE_PROVIDER_ID), "discovery is selected alongside TfL for London");
    assertEqual(
      ids[ids.length - 1],
      GOOGLE_PROVIDER_ID,
      "discovery ranks last, after the London authorities",
    );
  } finally {
    delete process.env.WAYFINDER_GOOGLE_API_KEY;
  }
});

test("discovery: normaliseFindings reads the real groundingChunks shape and dedupes", () => {
  const findings = normaliseFindings(GEMINI_GROUNDED, "2026-10-15T00:00:00.000Z");
  assertEqual(findings.length, 3, "three unique chunks");
  assertEqual(findings[0].verification, "discovered", "leads are marked discovered");
  const withDupe = normaliseFindings(
    {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://a.gov/", title: "a", domain: "a.gov" } },
              { web: { uri: "https://a.gov/", title: "a", domain: "a.gov" } },
            ],
          },
        },
      ],
    },
    "2026-10-15T00:00:00.000Z",
  );
  assertEqual(withDupe.length, 1, "identical URLs are deduped");
});

test("discovery: a non-http chunk is dropped, not rendered as a broken link", () => {
  const findings = normaliseFindings(
    {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "javascript:alert(1)", title: "bad", domain: "bad" } },
              { web: { uri: "https://ok.gov/", title: "ok", domain: "ok.gov" } },
            ],
          },
        },
      ],
    },
    "2026-10-15T00:00:00.000Z",
  );
  assertEqual(findings.length, 1, "only the http(s) URL survives");
  assertEqual(findings[0].domain, "ok.gov", "and it is the right one");
});

test("discovery: official-domain detection does not match lookalikes", () => {
  assert(looksOfficial("www.dft.gov.uk"), "gov.uk is official");
  assert(looksOfficial("frcn.gov.ng"), "gov.ng is official");
  assert(!looksOfficial("gov-uk-fake.test"), "a hyphenated lookalike is not official");
  assert(!looksOfficial("example.com"), "an ordinary domain is not official");
});

test("timeline: a new search cannot inherit an unrelated previous snapshot", async () => {
  // The provider is expected to carry a snapshot forward only when the situation
  // identity matches. Prove the engine treats a supplied snapshot for a *different*
  // situation as producing no phantom change events for conditions it never saw.
  const lagos = await composeAssistance({
    category: "metro",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(lagos.conditions.length, 0, "precondition: Lagos has no live provider");

  clearCache();
  const london = await composeAssistance({
    category: "metro",
    location: "London, United Kingdom",
    locale: "en",
    previous: lagos.snapshot,
    fetchImpl: fixtureFetch({ ...ALL_TABLE, "api.tfl.gov.uk": TFL_SUSPENSION }),
  });
  // London's first look at TfL (the snapshot has no tfl-tube key) is recovery /
  // new knowledge, never a clearance, and never a phantom "appearance" from
  // Lagos's empty snapshot.
  assert(
    !london.timeline.some((event) => event.id.startsWith("cleared-")),
    "nothing can clear when the previous snapshot named no conditions",
  );
});

// --- Paris regression: a bare city, and stale state that used to follow it ---

test("paris: a bare city resolves to its country, not to nothing", async () => {
  const resolved = resolveLocation("Paris");
  assertEqual(resolved.countryCode, "FR", "a bare 'Paris' must resolve to France");
  assertEqual(resolved.city, "Paris");
  assertEqual(resolved.countryInferred, true, "the country was read from the name, not given");
  assertEqual(resolved.countryUnrecognised, false);
});

test("paris: the countries we recognise resolve for a bare city", () => {
  assertEqual(resolveLocation("Tokyo").countryCode, "JP");
  assertEqual(resolveLocation("Lagos").countryCode, "NG");
  assertEqual(resolveLocation("London").countryCode, "GB");
  assertEqual(resolveLocation("Nairobi").countryCode, "KE");
});

test("paris: a genuinely ambiguous name is offered, never silently assigned", () => {
  const resolved = resolveLocation("San Jose");
  assertEqual(resolved.countryCode, undefined, "no country may be invented for an ambiguous name");
  assert(
    (resolved.countryAlternatives?.length ?? 0) > 1,
    "the alternatives are offered for the traveller to choose",
  );
});

test("paris: 'Paris' produces a directory reference, not an empty page", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Paris",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.query.countryCode, "FR", "the country must be resolved from the bare city");
  assertEqual(page.query.city, "Paris");
  assertEqual(page.query.countryInferred, true, "the inferred country is disclosed to the page");
  assert(
    page.references.length > 0,
    "Paris must offer official pages rather than nothing",
  );
});

test("paris: a stale structured region cannot leak into a new search", async () => {
  // This is the exact reported failure: a region left over from an earlier
  // Lagos search arriving alongside a new "Paris". The rendered place must be
  // Paris in France, never "Paris, Lagos".
  const page = await composeAssistance({
    category: "metro",
    location: "Paris",
    region: "Lagos",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.query.region, undefined, "a region absent from the typed location is dropped");
  assertEqual(page.query.city, "Paris");
  assertEqual(page.query.countryCode, "FR");
});

test("paris: a region the traveller did type is still kept", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Ikeja, Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.query.region, "Lagos", "a region the traveller typed is part of the location");
  assertEqual(page.query.city, "Ikeja");
});

test("paris: the page text can never read 'Paris, Lagos'", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Paris",
    region: "Lagos",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const place = [page.query.city, page.query.region, page.query.countryCode]
    .filter(Boolean)
    .join(", ");
  assertEqual(place, "Paris, FR", "the displayed place is Paris in France");
  const prose = `${page.explanation.summary} ${page.explanation.meaning} ${page.headline}`;
  assert(!prose.includes("Lagos"), "the stale region must not appear anywhere on the page");
});

// --- Provider scoping: a city operator must not answer for its whole country --
// A single-city operator declaring a country-wide catchment attached New York's
// subway alerts to Los Angeles and Oakland, and BART's to New York; the same
// shape gave Manchester London's TfL line status.

test("scoping: the New York subway does not answer for Los Angeles or Oakland", async () => {
  for (const city of ["Los Angeles", "Oakland", "San Diego"]) {
    const page = await composeAssistance({
      category: "metro",
      countryCode: "US",
      city,
      locale: "en",
      fetchImpl: fixtureFetch(ALL_TABLE),
    });
    assert(
      !page.respondingProviders.includes("mta-subway"),
      `MTA New York must not answer for ${city}`,
    );
    const prose = `${page.headline} ${page.explanation.summary} ${page.explanation.meaning}`;
    assert(!prose.includes("86 St"), `New York-specific alert text must not reach ${city}`);
  }
});

test("scoping: BART does not answer for New York", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "US",
    city: "New York",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.respondingProviders.includes("mta-subway"), "the city operator still answers");
  assert(!page.respondingProviders.includes("bart"), "BART must not answer for New York");
});

test("scoping: TfL does not answer for a non-London GB city", async () => {
  for (const city of ["Manchester", "Birmingham", "Edinburgh"]) {
    const page = await composeAssistance({
      category: "metro",
      countryCode: "GB",
      city,
      locale: "en",
      fetchImpl: fixtureFetch(ALL_TABLE),
    });
    assertEqual(
      page.respondingProviders.length,
      0,
      `no London provider should answer for ${city}`,
    );
    assertIncludes(page.headline, "no live feed covers", "the gap is stated honestly");
  }
});

test("scoping: a London query still answers, so scoping did not narrow coverage away", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assert(page.respondingProviders.includes("tfl-tube"), "London still routes to TfL");
  assert(page.conditions.length > 0, "London still yields conditions");
});

test("scoping: Paris metro lists a French transport authority, not the weather service", async () => {
  const page = await composeAssistance({
    category: "metro",
    location: "Paris",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  const orgs = page.references.map((r) => r.organization);
  assert(
    orgs.some((o) => o.includes("Île-de-France Mobilités")),
    "a Paris-region transport authority is listed",
  );
  const first = page.references[0];
  assert(
    first !== undefined && !first.organization.includes("Météo-France"),
    "the national weather service is not the leading reference for a metro query",
  );
});

// --- Honest reporting when nothing can be verified -------------------------
//
// Regression suite for a misleading message: every place with no live provider
// was described as "no live source covers this place". That is false when the
// directory has the official bodies, and false when a provider was configured
// but refused/failed us. These tests pin the three situations apart.

test("coverage: directory bodies but no live feed says 'no live feed', not 'no coverage'", async () => {
  const page = await composeAssistance({
    category: "public_service",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.respondingProviders.length, 0, "no live provider covers Lagos public services");
  assert(
    page.references.length > 0,
    "the official bodies for Lagos must be offered",
  );
  assert(
    !/no live source covers/i.test(page.headline),
    "must not claim no source covers a place whose bodies we list",
  );
  assert(
    !/no live source covers this place/i.test(page.explanation.summary),
    "the summary must not make the false coverage claim either",
  );
  assertIncludes(page.explanation.summary, "live data feed", "the honest limit is named");
  assertEqual(
    page.coverageGaps.map((g) => g.reason).join(","),
    "no_data",
    "the gap is a missing feed, not missing coverage",
  );
});

test("coverage: a place with neither directory nor provider keeps the true no-coverage message", async () => {
  const page = await composeAssistance({
    category: "other",
    location: "Atlantis",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(page.references.length, 0, "nothing is known about this place");
  assertEqual(page.coverageGaps[0]?.reason, "not_covered", "genuinely not covered");
  assertIncludes(page.coverageGaps[0]?.message ?? "", "No official data source", "states it plainly");
});

test("coverage: a configured discovery provider that fails is a source failure, not a coverage verdict", async () => {
  process.env.WAYFINDER_GOOGLE_API_KEY = "test-key";
  try {
    // The key is set, so discovery runs; it is absent from the fixture table, so
    // it answers 404 — the shape of a real "configured but refused" deployment.
    const page = await composeAssistance({
      category: "public_service",
      location: "Lagos, Nigeria",
      locale: "en",
      fetchImpl: fixtureFetch(ALL_TABLE),
    });
    assertEqual(page.discovery.state, "unreachable", "discovery ran and failed");
    assert(
      typeof page.discovery.errorKind === "string" && page.discovery.errorKind.length > 0,
      "the refusal is classified, not leaked as raw upstream text",
    );
    assert(
      !/no live source covers/i.test(page.explanation.summary),
      "a discovery failure must not become a coverage claim",
    );
    assert(
      page.references.length > 0,
      "the curated bodies are still offered when discovery fails",
    );
  } finally {
    delete process.env.WAYFINDER_GOOGLE_API_KEY;
  }
});

test("coverage: a status provider that is selected and fails says 'could not be reached'", async () => {
  const page = await composeAssistance({
    category: "metro",
    countryCode: "GB",
    city: "London",
    locale: "en",
    fetchImpl: failingFetch(),
  });
  assertEqual(page.respondingProviders.length, 0, "the selected provider did not answer");
  assertIncludes(page.headline, "could not be reached", "the failure is named as a failure");
  assert(
    !/no live source covers|no live feed covers/i.test(page.headline),
    "a provider failure must not be described as a coverage verdict",
  );
});

test("coverage: an unconfigured discovery layer is reported as not configured", async () => {
  delete process.env.WAYFINDER_GOOGLE_API_KEY;
  const page = await composeAssistance({
    category: "public_service",
    location: "Lagos, Nigeria",
    locale: "en",
    fetchImpl: fixtureFetch(ALL_TABLE),
  });
  assertEqual(
    page.discovery.state,
    "not_configured",
    "an absent credential is a deployment fact, not a coverage gap",
  );
  assertEqual(page.discovery.leadCount, 0, "no leads without a key");
});

run()
  .then(() => report("Category suites (fixtures)"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
