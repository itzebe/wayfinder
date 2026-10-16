"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/providers/LocaleProvider";

/**
 * Shared shell for the two recoverable error surfaces (a missing route and a
 * runtime error caught by the route-level boundary). Both live inside the
 * provider tree, so the copy follows the traveller's chosen language.
 *
 * A not-found page offers a way home; a caught error adds a way to try the
 * action again, and states plainly that the official sources stay reachable.
 */
export function ErrorState({
  kind,
  onRetry,
  digest,
}: {
  kind: "notFound" | "error";
  onRetry?: () => void;
  digest?: string;
}) {
  const { t } = useLocale();

  const title = kind === "notFound" ? t("error.notFound") : t("error.title");
  const detail =
    kind === "notFound" ? t("error.notFoundDetail") : t("error.genericDetail");

  return (
    <>
      <SiteHeader />
      <main id="main" className="shell flex min-h-[60vh] items-center py-16">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
            WAYFINDER
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-600">{detail}</p>
          {digest ? (
            <p className="mt-2 font-mono text-xs text-ink-400">Ref: {digest}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {kind === "error" && onRetry ? (
              <Button variant="primary" onClick={onRetry}>
                {t("error.retry")}
              </Button>
            ) : null}
            <Button variant="secondary" href="/">
              {t("error.goHome")}
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
