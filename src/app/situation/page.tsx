"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { SituationSkeleton, SituationView } from "@/components/situation/SituationView";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";
import { isLocaleCode } from "@/lib/i18n/locales";

/**
 * The situation page.
 *
 * Reads the situation from the traveller's own browser storage. Switching
 * language rebuilds the page in the new language: operational identifiers are
 * passed to the API as parameters and re-rendered verbatim, so a flight number,
 * airport code or reference can never be altered by translation.
 */
function SituationPageInner() {
  const searchParams = useSearchParams();
  const { locale, setLocale, t } = useLocale();
  const { situation, status, request, buildSituation } = useSituation();

  const requestedLocale = searchParams.get("locale");
  const rebuilding = useRef(false);

  const targetLocale =
    requestedLocale && isLocaleCode(requestedLocale) ? requestedLocale : undefined;

  useEffect(() => {
    if (targetLocale && targetLocale !== locale) setLocale(targetLocale);
  }, [targetLocale, locale, setLocale]);

  // Rebuild once per requested language, so the explanation changes language while
  // the itinerary stays byte-for-byte identical.
  useEffect(() => {
    if (!request || !targetLocale) return;
    if (situation?.locale === targetLocale) return;
    if (rebuilding.current) return;

    rebuilding.current = true;
    void buildSituation({ ...request, locale: targetLocale }).finally(() => {
      rebuilding.current = false;
    });
  }, [request, targetLocale, situation?.locale, buildSituation]);

  const pending = status === "loading" || (Boolean(request) && situation?.locale !== targetLocale);

  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-8 lg:py-12">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href="/help"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("situation.backToForm")}
          </Link>
        </div>

        {!situation && pending ? <SituationSkeleton /> : null}
        {!situation && !pending ? <EmptySituation /> : null}
        {situation ? <SituationView situation={situation} /> : null}
      </main>
      <SiteFooter />
    </>
  );
}

function EmptySituation() {
  const router = useRouter();
  const { t } = useLocale();

  return (
    <Card className="mx-auto max-w-xl p-6 text-center">
      <h1 className="text-xl font-semibold text-ink-900">{t("empty.title")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{t("empty.body")}</p>
      <Callout tone="neutral" compact className="mt-4 text-start">
        {t("empty.hint")}
      </Callout>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button onClick={() => router.push("/help")} size="lg">
          {t("nav.getHelp")}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => router.push("/")}>
          {t("empty.backHome")}
        </Button>
      </div>
    </Card>
  );
}

export default function SituationPage() {
  return (
    <Suspense fallback={<SituationSkeleton />}>
      <SituationPageInner />
    </Suspense>
  );
}
