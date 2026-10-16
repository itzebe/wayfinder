"use client";

import { Suspense } from "react";
import Link from "next/link";
import { PlaneTakeoff } from "lucide-react";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AssistFlow } from "@/components/flow/AssistFlow";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAssistance } from "@/components/providers/AssistanceProvider";

/**
 * Get help now.
 *
 * A situation already saved in this browser is offered back rather than forced:
 * an automatic redirect here was the navigation trap — after a search, pressing
 * Back bounced straight forward again, so there was no way to return and edit.
 * The traveller now chooses whether to reopen the saved situation or start a new
 * request, and the flow is always reachable.
 *
 * `?category=` preselects a situation, so the homepage shortcuts land in the
 * flow with the choice already made rather than on an undifferentiated form.
 */
export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportPageInner />
    </Suspense>
  );
}

function SupportPageInner() {
  const { t } = useLocale();
  const { assistance, status, startOver, draft } = useAssistance();

  const hasSavedSituation = Boolean(assistance) && status === "ready";

  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-10 lg:py-14">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
            {t("help.title")}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-ink-600">{t("help.subtitle")}</p>
        </div>

        {hasSavedSituation && assistance ? (
          <div className="mb-8 rounded-lg border border-accent-200 bg-accent-50 p-4">
            <p className="text-sm font-semibold text-ink-900">{t("support.saved.title")}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {t("support.saved.body", { place: savedPlace(assistance) })}
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/assist"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent-600 px-4 text-sm font-semibold text-paper-0 transition-colors hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
              >
                {t("support.saved.open")}
              </Link>
              <button
                type="button"
                onClick={startOver}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-paper-0 px-4 text-sm font-semibold text-ink-800 transition-colors hover:border-accent-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
              >
                {t("support.saved.new")}
              </button>
            </div>
          </div>
        ) : null}

        <Link
          href="/help"
          className="mb-8 flex items-start gap-3 rounded-lg border border-accent-200 bg-accent-50 p-4 transition-colors hover:border-accent-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        >
          <span className="mt-0.5 text-accent-700" aria-hidden="true">
            <PlaneTakeoff className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink-900">
              {t("support.flight.title")}
            </span>
            <span className="mt-0.5 block text-sm leading-relaxed text-ink-600">
              {t("support.flight.body")}
            </span>
          </span>
        </Link>

        <AssistFlow />
      </main>
      <SiteFooter />
    </>
  );
}

/** The saved request's place, for the "you already have a situation" notice. */
function savedPlace(assistance: { query: { location?: string; city?: string } }): string {
  return assistance.query.location ?? assistance.query.city ?? "";
}
