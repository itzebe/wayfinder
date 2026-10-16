"use client";

import Link from "next/link";

import { useLocale } from "@/components/providers/LocaleProvider";

const SECTION_KEYS = ["conformance", "keyboard", "readers", "contrast", "motion", "touch", "forms"];
const LIMITATION_KEYS = ["catalogue", "ai", "testing"];

export function AccessibilityContent() {
  const { t } = useLocale();

  return (
    <main id="main" className="shell py-12 lg:py-16">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-ink-900">
          {t("accessibility.title")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-600">{t("accessibility.intro")}</p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {SECTION_KEYS.map((key) => (
          <section
            key={key}
            className="rounded-lg border border-line-soft bg-paper-0 p-5 shadow-sm"
          >
            <h2 className="text-base font-semibold text-ink-900">
              {t(`accessibility.${key}.title`)}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {t(`accessibility.${key}.body`)}
            </p>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-lg border border-warn-200 bg-warn-50 p-5">
        <h2 className="text-base font-semibold text-ink-900">{t("accessibility.known.title")}</h2>
        <ul className="mt-3 space-y-2.5 text-sm text-ink-700">
          {LIMITATION_KEYS.map((key) => (
            <li key={key} className="flex gap-2.5">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-400"
                aria-hidden="true"
              />
              <span>{t(`accessibility.known.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-sm text-ink-600">
        {t("accessibility.footer.lead")}{" "}
        <Link
          href="/limitations"
          className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2"
        >
          {t("accessibility.footer.link")}
        </Link>{" "}
        {t("accessibility.footer.tail")}
      </p>
    </main>
  );
}
