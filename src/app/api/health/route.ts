/**
 * Health and capability endpoint.
 *
 * GET /api/health
 *   Reports which upstream providers and the AI layer are configured, so an
 *   operator can confirm a deployment is wired up. It reports capability only —
 *   never credentials, hostnames or key fragments.
 */

import { NextResponse } from "next/server";

import { isAiConfigured, getAiConfig } from "@/lib/ai/llm";
import { cacheStats } from "@/lib/core/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ai = getAiConfig();

  return NextResponse.json(
    {
      status: "ok",
      time: new Date().toISOString(),
      capabilities: {
        // Every provider below is a public, key-free official source.
        aviationWeather: true,
        airportStatus: true,
        routeReference: true,
        liveTracking: true,
        aiExplanations: isAiConfigured(),
      },
      ai: {
        configured: isAiConfigured(),
        model: ai?.model,
        // Hostname only, never the key.
        endpointHost: ai ? safeHost(ai.baseUrl) : undefined,
      },
      cache: cacheStats(),
      limitations: [
        "No public source we can reach publishes per-flight status. WAYFINDER never displays a flight status it cannot verify.",
        "FAA airspace constraint data covers United States airports only.",
        "Community ADS-B tracking coverage varies by region and altitude.",
        "Passenger-rights guidance links to official sources; it is not legal advice.",
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
