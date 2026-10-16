"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AssistanceFlow } from "@/components/flow/AssistanceFlow";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";

/**
 * Get help now.
 *
 * If a situation is already saved in this browser, the traveller is sent straight
 * back to it rather than being asked to enter their flight again.
 */
export default function HelpPage() {
  const router = useRouter();
  const { t } = useLocale();
  const { situation, status } = useSituation();

  useEffect(() => {
    if (situation && status === "ready") {
      router.replace("/situation");
    }
  }, [situation, status, router]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="shell py-10 lg:py-14">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">
            {t("help.title")}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-ink-600">
            {t("help.subtitle")}
          </p>
        </div>
        <AssistanceFlow />
      </main>
      <SiteFooter />
    </>
  );
}
