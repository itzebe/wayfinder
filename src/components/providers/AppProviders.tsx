"use client";

import { useEffect } from "react";

import { LocaleProvider, useLocale, LOCALE_META } from "@/components/providers/LocaleProvider";
import { SituationProvider } from "@/components/providers/SituationProvider";
import { AssistanceProvider } from "@/components/providers/AssistanceProvider";

/**
 * Client-side providers.
 *
 * All are intentionally client-only: the traveller's language choice, their
 * flight situation and their generic assistance situation live in their own
 * browser, so nothing about their journey is sent anywhere for storage.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <SituationProvider>
        <AssistanceProvider>
          <DocumentLanguage />
          {children}
        </AssistanceProvider>
      </SituationProvider>
    </LocaleProvider>
  );
}

/**
 * Keeps the document's `lang` and `dir` in step with the chosen language, so
 * screen readers announce the right language and RTL layouts flip at the root.
 */
function DocumentLanguage() {
  const { locale } = useLocale();

  useEffect(() => {
    const meta = LOCALE_META[locale];
    document.documentElement.lang = locale;
    document.documentElement.dir = meta?.dir ?? "ltr";
  }, [locale]);

  return null;
}
