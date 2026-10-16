/**
 * The provider contract.
 *
 * A provider is a thin, honest adapter over one upstream source. It declares
 * what it covers and what it can do *before* it is ever called, and it returns
 * a normalised `ProviderReport` rather than a category-specific shape. Adding a
 * city, an operator or a whole new country means adding one of these objects —
 * not editing a switch statement in the request handler.
 *
 * Every provider must be truthful in two places:
 *   - `metadata.capabilities`, so the engine knows a timetable is not a status;
 *   - `limitations`, so the traveller is told what the source cannot do.
 */

import type { DataState } from "@/lib/core/types";
import type { Translate } from "@/lib/i18n/translator";
import type {
  AssistanceQuery,
  ProviderMetadata,
  ProviderReport,
} from "./types";

export interface ProviderContext {
  signal?: AbortSignal;
  /** Message lookup bound to the request locale. */
  t: Translate;
  /** Injected in tests so adapters can be exercised without the network. */
  fetchImpl: typeof fetch;
}

export interface Provider {
  metadata: ProviderMetadata;
  /** True when this provider can plausibly answer the query's geography/category. */
  supports(query: AssistanceQuery): boolean;
  /** Retrieves and normalises. Must not throw: failures become unavailable reports. */
  query(query: AssistanceQuery, context: ProviderContext): Promise<ProviderReport>;
}

/** A machine-readable reason a provider could not be used. */
export type ProviderSkipReason =
  | "category_not_supported"
  | "out_of_coverage"
  | "missing_credentials";

export interface RegistrySelection {
  usable: Provider[];
  skipped: { provider: Provider; reason: ProviderSkipReason }[];
}

/** Reads a required credential from the environment, if configured. */
export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function hasCredentials(provider: Provider): boolean {
  return provider.metadata.requiredEnv.every((name) => readEnv(name) !== undefined);
}

/** Least-reliable-wins combining of several provider states. */
export function worstState(states: DataState[]): DataState {
  const rank: Record<DataState, number> = {
    live: 0,
    demo: 1,
    cached: 2,
    stale: 3,
    unavailable: 4,
  };
  if (states.length === 0) return "unavailable";
  return states.reduce((worst, state) => (rank[state] > rank[worst] ? state : worst));
}
