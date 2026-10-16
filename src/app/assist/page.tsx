"use client";

import { Suspense, useEffect, useRef } from "react";
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
import { useAssistance } from "@/components/providers/AssistanceProvider";
import { isLocaleCode } from "@/lib/i18n/locales";

/**
 * The generic situation page.
 *
 * Reads the situation from the traveller's own browser storage. Switching
 * language rebuilds the page in the new language while operational identifiers
 * come back from the same sources verbatim, so a line name, route number or
 * place can never be altered by translation.
 */
function AssistPageInner() {
  const searchParams = useSearchParams();
  const { locale, setLocale, t } = useLocale();
  const { assistance, status, request, buildAssistance, refreshNow, refreshing } = useAssistance();

  const requestedLocale = searchParams.get("locale");
  const rebuilding = useRef(false);

  const targetLocale =
    requestedLocale && isLocaleCode(requestedLocale) ? requestedLocale : locale;

  useEffect(() => {
    if (requestedLocale && isLocaleCode(requestedLocale) && requestedLocale !== locale) {
      setLocale(requestedLocale);
    }
  }, [requestedLocale, locale, setLocale]);

  // Rebuild once per active language so the explanation follows whichever
  // language control the user touched — the header menu or the in-page select.
  useEffect(() => {
    if (!request) return;
    if (assistance?.locale === targetLocale) return;
    if (rebuilding.current) return;

    rebuilding.current = true;
    void buildAssistance({ ...request, locale: targetLocale }).finally(() => {
      rebuilding.current = false;
    });
  }, [request, targetLocale, assistance?.locale, buildAssistance]);

  const pending = status === "loading" || (Boolean(request) && assistance?.locale !== targetLocale);

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

          {assistance ? (
            <Button variant="ghost" size="sm" onClick={refreshNow} disabled={refreshing}>
              <RefreshCw
                className={refreshing ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
              {t("situation.refresh")}
            </Button>
          ) : null}
        </div>

        {!assistance && pending ? <AssistSkeleton /> : null}
        {!assistance && !pending ? <EmptyAssistance /> : null}
        {assistance ? <AssistView assistance={assistance} /> : null}
      </main>
      <SiteFooter />
    </>
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
