/**
 * Deterministic fixtures.
 *
 * Shapes are copied from the real sources so a schema change in the adapter
 * surfaces here. These are fixtures, not evidence that a live provider works —
 * the live read-only check in `tests/live.ts` is separate and reported apart.
 */

export const TFL_LINE_STATUS = [
  {
    id: "victoria",
    name: "Victoria",
    modeName: "tube",
    lineStatuses: [
      {
        statusSeverity: 9,
        statusSeverityDescription: "Minor Delays",
        reason: "Minor delays due to train cancellations.",
        validityPeriods: [{ fromDate: "2026-10-15T04:30:00Z", toDate: "2026-10-15T23:59:00Z" }],
      },
    ],
    disruptions: [{ category: "RealTime", description: "Minor delays due to train cancellations." }],
  },
  {
    id: "central",
    name: "Central",
    modeName: "tube",
    lineStatuses: [{ statusSeverity: 10, statusSeverityDescription: "Good Service" }],
    disruptions: [],
  },
];

export const TFL_SUSPENSION = [
  {
    id: "northern",
    name: "Northern",
    modeName: "tube",
    lineStatuses: [
      {
        statusSeverity: 5,
        statusSeverityDescription: "Part Suspended",
        reason: "No service between Camden Town and Edgware due to a signal failure.",
      },
    ],
    disruptions: [{ category: "RealTime", description: "No service between Camden Town and Edgware." }],
  },
];

export const NWS_ALERTS = {
  features: [
    {
      id: "urn:oid:test-1",
      properties: {
        id: "urn:oid:test-1",
        event: "Flash Flood Warning",
        headline: "Flash Flood Warning in effect until 22:00",
        description: "Heavy rainfall is producing flooding across the area.",
        instruction: "Move to higher ground immediately and avoid flooded roads.",
        severity: "Severe",
        urgency: "Immediate",
        certainty: "Likely",
        areaDesc: "Los Angeles County, CA; Ventura County, CA",
        sent: "2026-10-15T18:00:00Z",
        effective: "2026-10-15T18:00:00Z",
        ends: "2026-10-16T06:00:00Z",
      },
    },
    {
      id: "urn:oid:test-2",
      properties: {
        id: "urn:oid:test-2",
        event: "Wind Advisory",
        headline: "Wind Advisory until 20:00",
        description: "Gusts up to 40 mph expected.",
        severity: "Minor",
        urgency: "Expected",
        areaDesc: "Los Angeles County, CA",
        sent: "2026-10-15T12:00:00Z",
      },
    },
  ],
};

export const USGS_QUAKES = {
  features: [
    {
      id: "us7000test",
      properties: {
        mag: 5.4,
        place: "30km SSW of Somewhere",
        time: 1792000000000,
        title: "M 5.4 - 30km SSW of Somewhere",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000test",
        tsunami: 0,
      },
    },
  ],
};

export const DWD_WARNINGS = `warnWetter.loadWarnings({"time":1792131265000,"warnings":{"106631000":[{"state":"Hessen","type":4,"level":3,"start":1792116720000,"regionName":"Kreis Fulda","end":1792137600000,"description":"Es tritt schwerer Sturm auf."}]}});`;

export const CALTRANS_CMS = {
  data: [
    {
      cms: {
        index: "1340",
        location: { district: "3", route: "I-80", direction: "East", county: "Yolo", milepost: "83.34" },
        message: {
          display: "On",
          phase1: { phase1Line1: "I-80 EB", phase1Line2: "CLOSED AHEAD", phase1Line3: "USE DETOUR" },
          phase2: { phase2Line1: "", phase2Line2: "", phase2Line3: "" },
        },
      },
    },
    {
      cms: {
        index: "1341",
        location: { district: "3", route: "US-50", county: "El Dorado" },
        message: {
          display: "On",
          phase1: { phase1Line1: "CHP ACTIVITY", phase1Line2: "US-50 WB", phase1Line3: "EXPECT DELAYS" },
        },
      },
    },
    {
      cms: {
        index: "1342",
        location: { district: "3", route: "I-5" },
        message: { display: "Blank", phase1: { phase1Line1: "", phase1Line2: "Not Reported" } },
      },
    },
  ],
};

export const GOVUK_SEARCH = {
  results: [
    {
      title: "Travel disruption and your rights",
      description: "What to do if your travel is disrupted.",
      link: "/travel-disruption-your-rights",
      format: "answer",
    },
  ],
};

/** GTFS Realtime alert feed as plain JSON, converted to protobuf on demand. */
export const GTFS_ALERTS_JSON = {
  header: { gtfsRealtimeVersion: "2.0" },
  entity: [
    {
      id: "alert-1",
      alert: {
        activePeriod: [{ start: 1792000000 }],
        informedEntity: [{ routeId: "A" }, { routeId: "C" }],
        severityLevel: "SEVERE",
        effect: "SIGNIFICANT_DELAYS",
        headerText: { translation: [{ language: "en", text: "A and C trains delayed in both directions" }] },
        descriptionText: { translation: [{ language: "en", text: "Signal problems near Jay St-MetroTech." }] },
      },
    },
  ],
};
