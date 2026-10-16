"use client";

import { useEffect, useState } from "react";

import { translate } from "@/lib/i18n/messages";
import { matchLocale, DEFAULT_LOCALE } from "@/lib/i18n/locales";

const LOCALE_STORAGE_KEY = "wayfinder.locale";

/**
 * Last-resort boundary. Next.js replaces the root layout with this component
 * when the layout itself fails, so it cannot use the locale provider or the
 * app's stylesheet. It reads the saved language directly and carries the minimum
 * inline styling needed to stay readable.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored) setLocale(matchLocale(stored) ?? DEFAULT_LOCALE);
    } catch {
      // Storage can be blocked; the default language is a safe fallback.
    }
  }, []);

  const t = (key: string) => translate(locale, key);

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fbfaf7",
          color: "#12172a",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <main style={{ maxWidth: "34rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.6rem", margin: "0 0 0.75rem" }}>
            {t("error.title")}
          </h1>
          <p style={{ lineHeight: 1.6, color: "#3c445c", margin: "0 0 1.5rem" }}>
            {t("error.genericDetail")}
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#6b7488" }}>
              Ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "44px",
              padding: "0 1.5rem",
              borderRadius: "9999px",
              border: "none",
              background: "#0f6f7a",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("error.retry")}
          </button>
        </main>
      </body>
    </html>
  );
}
