"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { AssistSkeleton, AssistView } from "@/components/assist/AssistView";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAssistance, assistRequestIdentity } from "@/components/providers/AssistanceProvider";
import { isLocaleCode } from "@/lib/i18n/locales";
import { resolveCity } from "@/lib/assist/location";
import { assistHref } from "@/lib/assist/request-link";
import {
  assistRequestFromParams,
  isRunnableAssistRequest,
  sameAssistRequest,
} from "@/lib/assist/request-link";

/**
 * The generic situation page.
 *
 * The URL is the source of truth for *which* search is shown. A query string
 * from a bookmark or a shared link is reconciled against the request kept in
 * this browser: when they differ, the URL wins and a fresh search runs. That is
 * what stops an earlier Lagos page from lingering after a Tokyo search, and what
 * makes a shared `/assist?category=…` link open the situation it names.
 *
 * Switching language rebuilds the page in the new language while operational
 * identifiers come back from the same sources verbatim, so a line name, route
 * number or place can never be altered by translation.
 */
function AssistPageInner() {
  const searchParams = useSearchParams();
  const { locale, setLocale, t } = useLocale();
  const { assistance, status, request, buildAssistance, refreshNow, refreshing } = useAssistance();

  const requestedLocale = searchParams.get("locale");
  const urlRequest = useMemo(
    () => assistRequestFromParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  // Tracks the situation identity of the rebuild currently in flight. Storing
  // the identity — not a plain boolean — means a rebuild for a *different*
  // situation is never mistaken for one of our own: the address bar stays
  // authoritative even if a stale translate happened to be mid-flight.
  const rebuilding = useRef<string | null>(null);

  const targetLocale =
    requestedLocale && isLocaleCode(requestedLocale) ? requestedLocale : locale;

  useEffect(() => {
    if (requestedLocale && isLocaleCode(requestedLocale) && requestedLocale !== locale) {
      setLocale(requestedLocale);
    }
  }, [requestedLocale, locale, setLocale]);

  // A place that is a real city in more than one country cannot be searched
  // responsibly: the country decides which authority and directory apply, and
  // picking one would be inventing a fact. Detected from the URL, which is the
  // source of truth for which search is shown, so a stale stored page cannot
  // mask it. The traveller then picks the country they mean.
  const placeAlternatives = urlRequest?.location
    ? resolveCity(urlRequest.location)
    : undefined;
  const ambiguousCountries =
    placeAlternatives && placeAlternatives.length > 1 ? placeAlternatives : undefined;

  // Reconcile the URL with what is stored. Runs when the query string changes —
  // including a Back/Forward navigation — so the visible situation always
  // matches the address bar.
  useEffect(() => {
    if (ambiguousCountries) return;
    if (!urlRequest) return;
    if (!isRunnableAssistRequest(urlRequest)) return;
    if (sameAssistRequest(urlRequest, request)) return;
    const identity = assistRequestIdentity(urlRequest);
    if (rebuilding.current === identity) return;

    rebuilding.current = identity;
    void buildAssistance({ ...urlRequest, locale: targetLocale }).finally(() => {
      if (rebuilding.current === identity) rebuilding.current = null;
    });
  }, [urlRequest, request, targetLocale, buildAssistance, ambiguousCountries]);

  // Reconciled when the URL and the stored request point at the *same
  // situation*. Locale is deliberately excluded: a URL that only differs by
  // `?locale=fr` names the same place, and the language effect below handles
  // translating it — treating that as unreconciled would rebuild twice.
  const reconciled =
    !urlRequest ||
    !isRunnableAssistRequest(urlRequest) ||
    (request !== null && assistRequestIdentity(urlRequest) === assistRequestIdentity(request));

  // Rebuild once per active language so the explanation follows whichever
  // language control the user touched — the header menu or the in-page select.
  //
  // This must not run while the URL still points at a different situation than
  // the stored one: `request` is then the *stale* stored page, and translating
  // it would race the URL-driven rebuild above and could leave the old place on
  // screen. Waiting for `reconciled` keeps the URL authoritative — the rebuild
  // above happens first, and language follows afterwards if it is still needed.
  useEffect(() => {
    if (ambiguousCountries) return;
    if (!request) return;
    if (!reconciled) return;
    if (assistance?.locale === targetLocale) return;
    const identity = assistRequestIdentity(request);
    if (rebuilding.current === identity) return;

    rebuilding.current = identity;
    void buildAssistance({ ...request, locale: targetLocale }).finally(() => {
      if (rebuilding.current === identity) rebuilding.current = null;
    });
  }, [request, targetLocale, assistance?.locale, buildAssistance, ambiguousCountries, reconciled]);

  const pending =
    !ambiguousCountries &&
    (status === "loading" ||
      !reconciled ||
      (Boolean(request) && assistance?.locale !== targetLocale));
  const needsMoreDetail =
    Boolean(urlRequest) && !isRunnableAssistRequest(urlRequest) && !request;

  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-8 lg:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/support"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("assist.backToForm")}
          </Link>

          {assistance && !ambiguousCountries ? (
            <Button variant="ghost" size="sm" onClick={refreshNow} disabled={refreshing}>
              <RefreshCw
                className={refreshing ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
              {t("situation.refresh")}
            </Button>
          ) : null}
        </div>

        {ambiguousCountries ? (
          <DisambiguatePlace
            place={urlRequest!.location!.trim()}
            options={ambiguousCountries}
            request={urlRequest!}
          />
        ) : null}
        {!ambiguousCountries && !assistance && pending ? <AssistSkeleton /> : null}
        {!ambiguousCountries && !assistance && !pending && needsMoreDetail ? <NeedMoreDetail /> : null}
        {!ambiguousCountries && !assistance && !pending && !needsMoreDetail ? <EmptyAssistance /> : null}
        {!ambiguousCountries && assistance ? <AssistView assistance={assistance} /> : null}
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Shown when a bare place name names a real city in more than one country. The
 * traveller picks the one they mean, which re-runs the search with an explicit
 * "City, Country" location; or they can type a more precise place themselves.
 */
function DisambiguatePlace({
  place,
  options,
  request,
}: {
  place: string;
  options: { countryCode: string; countryName: string }[];
  request: NonNullable<ReturnType<typeof assistRequestFromParams>>;
}) {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <Card className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-ink-900">{t("assist.disambiguate.title")}</h1>
      <p className="measure mt-2 text-sm leading-relaxed text-ink-600">
        {t("assist.disambiguate.body", { place })}
      </p>
      <ul className="mt-5 space-y-2">
        {options.map((option) => (
          <li key={option.countryCode}>
            <button
              type="button"
              onClick={() =>
                router.push(
                  assistHref({
                    ...request,
                    location: `${place}, ${option.countryName}`,
                  }),
                )
              }
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-paper-0 px-4 py-3 text-left text-base font-medium text-ink-900 transition-colors duration-150 hover:border-accent-400 hover:bg-paper-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
            >
              <span>
                {place}, {option.countryName}
              </span>
              <span className="text-sm font-normal text-ink-500">{option.countryCode}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-line-soft pt-4">
        <Button variant="secondary" onClick={() => router.push("/support")}>
          {t("assist.disambiguate.other")}
        </Button>
      </div>
    </Card>
  );
}

/**
 * A shared link named a category but no place. Offering the flow with the
 * category already chosen is more useful than an empty result.
 */
function NeedMoreDetail() {
  const { t } = useLocale();

  return (
    <Card className="mx-auto max-w-xl p-6 text-center">
      <h1 className="text-xl font-semibold text-ink-900">{t("assist.needDetail.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{t("assist.needDetail.body")}</p>
      <div className="mt-5 flex justify-center">
        <Button href="/support" size="lg">
          {t("nav.getHelp")}
        </Button>
      </div>
    </Card>
  );
}

function EmptyAssistance() {
  const router = useRouter();
  const { t } = useLocale();

  return (
    <Card className="mx-auto max-w-xl p-6 text-center">
      <h1 className="text-xl font-semibold text-ink-900">{t("empty.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{t("empty.body")}</p>
      <Callout tone="neutral" compact className="mt-4 text-start">
        {t("empty.hintGeneric")}
      </Callout>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button onClick={() => router.push("/support")} size="lg">
          {t("nav.getHelp")}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => router.push("/")}>
          {t("empty.backHome")}
        </Button>
      </div>
    </Card>
  );
}

export default function AssistPage() {
  return (
    <Suspense fallback={<AssistSkeleton />}>
      <AssistPageInner />
    </Suspense>
  );
}
