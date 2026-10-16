"use client";

import Link from "next/link";
import { ArrowRight, PlaneTakeoff } from "lucide-react";

import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";
import { Button } from "@/components/ui/Button";

/**
 * The saved-flight notice on the flight flow.
 *
 * Replaces an automatic redirect that made the form unreachable after a search:
 * the traveller chooses whether to reopen the saved situation or start fresh,
 * and the form itself is always visible below. The flight number is passed to
 * `t()` as a parameter, so a translated sentence can never alter it.
 */
export function FlightResumeNotice() {
  const { t } = useLocale();
  const { situation, startOver } = useSituation();

  const flightNumber = situation?.intel.flightNumber;
  if (!flightNumber) return null;

  return (
    <div className="mb-8 rounded-lg border border-accent-200 bg-accent-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <PlaneTakeoff className="size-4 shrink-0 text-accent-700" aria-hidden="true" />
        {t("help.resume.title")}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-700">
        {t("help.resume.body", { flightNumber })}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/situation"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent-600 px-4 text-sm font-semibold text-paper-0 transition-colors hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        >
          {t("help.resume.open")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Button variant="secondary" onClick={startOver} className="min-h-11">
          {t("help.resume.new")}
        </Button>
      </div>
    </div>
  );
}
