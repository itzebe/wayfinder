/**
 * Airport constraint data from the FAA Air Traffic Control System Command
 * Center, published through the FAA National Airspace System Status feed.
 *
 * This is the official source for ground stops, ground delay programs,
 * arrival/departure delays and airport closures. Coverage is US-centric, which
 * the UI states plainly rather than implying worldwide coverage.
 *
 * Source: https://nasstatus.faa.gov/api/airport-status-information
 */

import { cachedFetch } from "@/lib/core/cache";
import { fetchText } from "@/lib/core/http";
import type { AirportConstraint, AirportStatusReport, DataState } from "@/lib/core/types";

const URL = "https://nasstatus.faa.gov/api/airport-status-information";
const TTL_MS = 5 * 60 * 1000;

export const FAA_SOURCE = {
  organization: "Federal Aviation Administration — Air Traffic Control System Command Center",
  url: "https://www.fly.faa.gov/flyfaa/usmap.jsp",
} as const;

/** Extracts the text of the first matching tag inside a block. */
function tagText(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  const value = match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  return value || undefined;
}

/** Returns every occurrence of a repeating block, e.g. `<Program>…</Program>`. */
function blocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi"))].map(
    (match) => match[1],
  );
}

function parseAirportStatus(xml: string): AirportStatusReport {
  const updatedAtRaw = tagText(xml, "Update_Time");
  const parsedUpdatedAt = updatedAtRaw ? new Date(updatedAtRaw) : undefined;
  const updatedAt =
    parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime())
      ? parsedUpdatedAt.toISOString()
      : undefined;

  const constraints: AirportConstraint[] = [];

  const groundStops = xml.match(/<Ground_Stop_List>([\s\S]*?)<\/Ground_Stop_List>/i)?.[1];
  if (groundStops) {
    for (const program of blocks(groundStops, "Program")) {
      const airport = tagText(program, "ARPT");
      if (!airport) continue;
      constraints.push({
        airport: airport.toUpperCase(),
        programType: "ground_stop",
        reason: tagText(program, "Reason"),
        endTime: tagText(program, "End_Time"),
      });
    }
  }

  const groundDelays = xml.match(/<Ground_Delay_List>([\s\S]*?)<\/Ground_Delay_List>/i)?.[1];
  if (groundDelays) {
    for (const delay of blocks(groundDelays, "Ground_Delay")) {
      const airport = tagText(delay, "ARPT");
      if (!airport) continue;
      constraints.push({
        airport: airport.toUpperCase(),
        programType: "ground_delay",
        reason: tagText(delay, "Reason"),
        averageDelay: tagText(delay, "Avg"),
        maximumDelay: tagText(delay, "Max"),
      });
    }
  }

  const arrivalDeparture = xml.match(
    /<Arrival_Departure_Delay_List>([\s\S]*?)<\/Arrival_Departure_Delay_List>/i,
  )?.[1];
  if (arrivalDeparture) {
    for (const delay of blocks(arrivalDeparture, "Delay")) {
      const airport = tagText(delay, "ARPT");
      if (!airport) continue;
      const departure = delay.match(
        /<Arrival_Departure Type="Departure">([\s\S]*?)<\/Arrival_Departure>/i,
      )?.[1];
      const arrival = delay.match(
        /<Arrival_Departure Type="Arrival">([\s\S]*?)<\/Arrival_Departure>/i,
      )?.[1];
      const source = departure ?? arrival;
      if (!source) continue;
      constraints.push({
        airport: airport.toUpperCase(),
        programType: "arrival_departure_delay",
        reason: tagText(delay, "Reason"),
        averageDelay: tagText(source, "Min"),
        maximumDelay: tagText(source, "Max"),
      });
    }
  }

  for (const closureList of blocks(xml, "Airport_Closure_List")) {
    for (const airport of blocks(closureList, "Airport")) {
      const code = tagText(airport, "ARPT");
      if (!code) continue;
      constraints.push({
        airport: code.toUpperCase(),
        programType: "closure",
        reason: tagText(airport, "Reason"),
        endTime: tagText(airport, "Reopen"),
      });
    }
  }

  return { updatedAt, constraints };
}

export interface AirportStatusResult {
  report?: AirportStatusReport;
  state: DataState;
  error?: string;
}

/**
 * Fetches the national constraint picture. The FAA publishes one document
 * covering all airports, so this is cached once and filtered per airport.
 */
export async function getNationalAirportStatus(): Promise<AirportStatusResult> {
  try {
    const outcome = await cachedFetch<AirportStatusReport>(
      "faa:nasstatus",
      async (revalidation) => {
        const result = await fetchText(URL, {
          timeoutMs: 9_000,
          retries: 2,
          accept: "application/xml,text/xml,*/*",
          headers: revalidation.lastModified
            ? { "If-Modified-Since": revalidation.lastModified }
            : undefined,
        });
        if (!result.data.includes("<AIRPORT_STATUS_INFORMATION")) {
          throw new Error("FAA feed returned an unexpected document");
        }
        return {
          data: parseAirportStatus(result.data),
          retrievedAt: result.retrievedAt,
          notModified: false,
          lastModified: result.lastModified,
        };
      },
      { ttlMs: TTL_MS },
    );
    return { report: outcome.value, state: outcome.freshness };
  } catch (error) {
    return {
      state: "unavailable",
      error: error instanceof Error ? error.message : "FAA status feed unavailable.",
    };
  }
}

/** Constraints affecting one airport, matching IATA or ICAO identifiers. */
export async function getAirportConstraints(
  codes: (string | undefined)[],
): Promise<{ constraints: AirportConstraint[]; state: DataState; updatedAt?: string }> {
  const wanted = new Set(
    codes.filter((code): code is string => Boolean(code)).map((code) => code.toUpperCase()),
  );
  const result = await getNationalAirportStatus();
  if (!result.report) {
    return { constraints: [], state: result.state, updatedAt: undefined };
  }
  const constraints = result.report.constraints.filter((constraint) =>
    wanted.has(constraint.airport),
  );
  return {
    constraints,
    state: result.state,
    updatedAt: result.report.updatedAt,
  };
}
