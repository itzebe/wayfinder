"use client";

import Link from "next/link";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AssistanceFlow } from "@/components/flow/AssistanceFlow";
import { FlightResumeNotice } from "@/components/flow/FlightResumeNotice";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";

/**
 * Get help now — the flight itinerary flow.
 *
 * A saved flight situation is offered back as a notice the traveller can act on,
 * never as an automatic redirect. The previous `router.replace("/situation")`
 * was a navigation trap: after a search, pressing Back landed here and bounced
 * straight forward again, so the form could not be reached to start a new
 * request.
 */
export default function HelpPage() {
  const { t } = useLocale();
  const { situation, status } = useSituation();

  const hasSavedSituation = Boolean(situation) && status === "ready";

  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-10 lg:py-14">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
            {t("help.flight.title")}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-ink-600">
            {t("help.flight.subtitle")}
          </p>
        </div>

        {hasSavedSituation ? <FlightResumeNotice /> : null}

        <AssistanceFlow />
      </main>
      <SiteFooter />
    </>
  );
}
