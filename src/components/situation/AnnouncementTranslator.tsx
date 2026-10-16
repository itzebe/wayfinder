"use client";

import { useState } from "react";
import { Languages, Loader2, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextAreaField } from "@/components/ui/Field";
import { useLocale } from "@/components/providers/LocaleProvider";
import { getLocaleMeta } from "@/lib/i18n/locales";

interface TranslationResult {
  translation: string;
  explanation: string;
  detectedLanguage?: string;
  aiGenerated: boolean;
  unavailableReason?: string;
}

/**
 * Announcement translator.
 *
 * Shows the original text beside the translation so a traveller can show both to
 * airport staff. Operational identifiers inside the announcement are preserved by
 * the translation prompt, and the original is always displayed alongside so
 * nothing depends on the translation being perfect.
 */
export function AnnouncementTranslator({ initialText = "" }: { initialText?: string }) {
  const { t, locale, meta } = useLocale();
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale }),
      });

      const payload = (await response.json()) as TranslationResult & {
        error?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok) {
        setError(
          payload.fields?.text ??
            payload.error ??
            t("announce.failed"),
        );
        return;
      }

      setResult(payload);
    } catch {
      setError(t("announce.unreachable"));
    } finally {
      setLoading(false);
    }
  };

  const speak = () => {
    if (!result?.translation || typeof window === "undefined" || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(result.translation);
    utterance.lang = meta.tag;
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="rounded-lg border border-line-soft bg-paper-0 shadow-sm">
      <div className="flex items-start gap-3 border-b border-line-soft bg-paper-50 px-5 py-4">
        <span className="mt-0.5 text-ink-500" aria-hidden="true">
          <Languages className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink-900">
            {t("announce.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("announce.intro", { language: getLocaleMeta(locale).nativeName })}
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <TextAreaField
          id="announcementInput"
          label={t("announce.label")}
          value={text}
          onChange={setText}
          help={t("announce.help")}
          error={error ?? undefined}
          placeholder={t("announce.placeholder")}
          optional
          optionalLabel={t("common.optional")}
          rows={3}
          maxLength={4000}
        />

        <Button onClick={translate} disabled={loading || !text.trim()}>
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("announce.translating")}
            </>
          ) : (
            <>
              <Languages className="size-4" aria-hidden="true" />
              {t("announce.action")}
            </>
          )}
        </Button>

        <div aria-live="polite">
          {result ? (
            <div className="space-y-3">
              {result.unavailableReason ? (
                <Callout tone="warning" title={t("announce.unavailable")}>
                  {result.explanation}
                </Callout>
              ) : (
                <>
                  <div className="rounded-md border border-accent-200 bg-accent-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-800">
                        {t("announce.translation")}
                        {result.detectedLanguage ? (
                          <span className="ms-2 font-normal normal-case tracking-normal text-ink-500">
                            {t("announce.detectedFrom", { language: result.detectedLanguage })}
                          </span>
                        ) : null}
                      </h3>
                      <button
                        type="button"
                        onClick={speak}
                        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
                      >
                        <Volume2 className="size-3.5" aria-hidden="true" />
                        {t("announce.readAloud")}
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-800">
                      {result.translation}
                    </p>
                  </div>

                  <div className="rounded-md border border-line-soft bg-paper-50 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
                      {t("announce.whatItMeans")}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-700">
                      {result.explanation}
                    </p>
                  </div>
                </>
              )}

              {/* The original is always shown, so nothing depends on the translation. */}
              <details className="rounded-md border border-line-soft bg-paper-0">
                <summary className="flex min-h-11 cursor-pointer items-center px-3.5 text-xs font-medium text-ink-600 hover:text-ink-900">
                  {t("announce.showOriginal")}
                </summary>
                <p className="border-t border-line-soft px-3.5 py-3 text-sm text-ink-600">
                  {text}
                </p>
              </details>

              {result.aiGenerated ? (
                <p className="text-xs text-ink-400">
                  {t("announce.aiDisclaimer")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
