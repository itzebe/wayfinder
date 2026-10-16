"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_LOCALE,
  LOCALES,
  getLocaleMeta,
  isLocaleCode,
  matchLocale,
  type LocaleCode,
  type LocaleMeta,
} from "@/lib/i18n/locales";
import { getMessages, translate } from "@/lib/i18n/messages";

const STORAGE_KEY = "wayfinder.locale";

interface LocaleContextValue {
  locale: LocaleCode;
  meta: LocaleMeta;
  setLocale: (locale: LocaleCode) => void;
  /** Looks up a message, with optional named parameters. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [hydrated, setHydrated] = useState(false);

  // Restore the stored choice, then fall back to the browser's preference.
  useEffect(() => {
    let initial: LocaleCode | undefined;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocaleCode(stored)) initial = stored;
    } catch {
      // Storage may be unavailable in private modes; that is not an error.
    }

    if (!initial) {
      initial = matchLocale(window.navigator.language);
    }

    if (initial) setLocaleState(initial);
    setHydrated(true);
  }, []);

  const setLocale = useCallback((next: LocaleCode) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures: the choice still applies for this session.
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const meta = getLocaleMeta(locale);
    // Messages are memoised per locale so lookups stay cheap during re-renders.
    const messages = getMessages(locale);
    void messages;
    return {
      locale,
      meta,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    };
  }, [locale, setLocale]);

  // Avoid a flash of English copy before the stored language is read.
  if (!hydrated) {
    return (
      <LocaleContext.Provider value={value}>
        <div className="sr-only" aria-hidden="true" />
        {children}
      </LocaleContext.Provider>
    );
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside a LocaleProvider");
  }
  return context;
}

/** Locale metadata keyed by code, for use in the document-level language sync. */
export const LOCALE_META: Record<string, LocaleMeta> = Object.fromEntries(
  LOCALES.map((locale) => [locale.code, locale]),
);
