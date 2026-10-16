"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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
 * A situation already saved in this browser sends the traveller straight back to
 * it rather than asking for the same details again. Otherwise the generic
 * assistance flow runs; a flight disruption routes to the dedicated flight flow,
 * which asks for the itinerary that aviation data actually needs.
 */
export default function SupportPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { assistance, status } = useAssistance();

  useEffect(() => {
    if (assistance && status === "ready") {
      router.replace("/assist");
    }
  }, [assistance, status, router]);

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
