/**
 * URL ⇄ request reconciliation for the generic assistance page.
 *
 * Two defects came from the absence of this module. First, `/assist` rendered
 * whatever was in `localStorage` and ignored its own query string, so a shared
 * or bookmarked `/assist?category=metro&location=Tokyo` showed "no situation on
 * this device", and — worse — a page built earlier for Lagos stayed on screen
 * after the traveller started a search for somewhere else. Second, `/help`
 * redirected a visitor with a saved flight straight back to it, so pressing Back
 * bounced forward again and there was no way to start a fresh request.
 *
 * The rule this module encodes: the URL is the source of truth for *which*
 * search is being shown. A request derivable from the URL always wins over the
 * one kept in the browser, and the two are compared by value rather than by
 * identity so a rebuild only happens when the query actually changed.
 */

import type { AssistRequest } from "@/components/providers/AssistanceProvider";
import { ASSIST_CATEGORIES } from "@/lib/assist/schema";
import { isLocaleCode } from "@/lib/i18n/locales";
import type { AssistanceCategory } from "@/lib/assist/types";

const CATEGORY_SET = new Set<string>(ASSIST_CATEGORIES);

export function isAssistCategory(value: string | null): value is AssistanceCategory {
  return value !== null && CATEGORY_SET.has(value);
}

/**
 * Builds a request from a query string.
 *
 * Returns `null` when the URL does not describe a search at all, which is what
 * distinguishes "a fresh visit to /assist" from "a link to a specific
 * situation". A category with no location or description is still a request — it
 * is a search waiting for one detail — so it is returned with the category set.
 */
export function assistRequestFromParams(params: URLSearchParams): AssistRequest | null {
  const category = params.get("category");
  if (!isAssistCategory(category)) return null;

  const localeParam = params.get("locale");
  const locale = localeParam && isLocaleCode(localeParam) ? localeParam : undefined;

  const location = trimmed(params.get("location"));
  const description = trimmed(params.get("description"));
  const network = trimmed(params.get("network"));
  const from = trimmed(params.get("from"));
  const to = trimmed(params.get("to"));

  return {
    category,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
    ...(network ? { network } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(locale ? { locale } : {}),
  } as AssistRequest;
}

/**
 * True when the traveller has supplied enough for a search to run. A category
 * alone is a valid *intent* but not yet a retrievable request, so the page asks
 * for one more detail rather than showing an empty result.
 */
export function isRunnableAssistRequest(request: AssistRequest | null): boolean {
  if (!request) return false;
  return Boolean(
    request.location?.trim() ||
      request.description?.trim() ||
      request.from?.trim() ||
      request.network?.trim(),
  );
}

/** Value equality, so an identical query does not trigger a rebuild. */
export function sameAssistRequest(
  a: AssistRequest | null | undefined,
  b: AssistRequest | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.category === b.category &&
    norm(a.location) === norm(b.location) &&
    norm(a.region) === norm(b.region) &&
    norm(a.network) === norm(b.network) &&
    norm(a.from) === norm(b.from) &&
    norm(a.to) === norm(b.to) &&
    norm(a.description) === norm(b.description)
  );
}

/** Builds a canonical, shareable link for a request. */
export function assistHref(request: AssistRequest): string {
  const params = new URLSearchParams();
  params.set("category", request.category);
  for (const key of ["location", "description", "network", "from", "to"] as const) {
    const value = request[key];
    if (value) params.set(key, value);
  }
  if (request.locale) params.set("locale", request.locale);
  return `/assist?${params.toString()}`;
}

function trimmed(value: string | null): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function norm(value: string | undefined): string {
  return (value ?? "").trim();
}
