"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";

import { useLocale } from "@/components/providers/LocaleProvider";
import {
  useAssistance,
  type AssistRequest,
} from "@/components/providers/AssistanceProvider";
import { useSituation } from "@/components/providers/SituationProvider";
import { assistHref } from "@/lib/assist/request-link";
import { classifyDescription } from "@/lib/assist/intent";
import { cn } from "@/lib/format/cn";
import type { AssistanceCategory } from "@/lib/assist/types";

/**
 * The intent entry — the homepage's primary action.
 *
 * A traveller can describe the problem in a sentence and name where it is, and
 * this turns it into a real search: the sentence is classified into a category
 * (locally, with the same rules the server uses), the place is parsed for a
 * country, and the flow is prefilled so the remaining step is one confirmation.
 *
 * The classification shown here is a *routing hint*, never a verified claim. The
 * copy says so, because "we think this is about metro" must not read as "the
 * metro is disrupted".
 */
export function IntentEntry({ className }: { className?: string }) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const { patchDraft: patchAssistDraft } = useAssistance();
  const { situation, patchDraft: patchFlightDraft } = useSituation();

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const prediction = useMemo(() => classifyDescription(description), [description]);

  const classified = prediction.matched && prediction.category !== "other";
  const predictedCategory: AssistanceCategory = classified ? prediction.category : "other";

  const canSubmit = description.trim().length > 0 || location.trim().length > 0;

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const text = description.trim();
    const place = location.trim();

    // Flights have their own itinerary flow, which needs a flight number more
    // than a place. Seed the need and the words, then hand the traveller there.
    if (predictedCategory === "flights") {
      patchFlightDraft({ need: inferNeed(text), description: text });
      router.push("/help");
      return;
    }

    const category: AssistanceCategory =
      predictedCategory === "other" ? "stranded" : predictedCategory;

    // Keep the traveller's own words and place in the draft, so the flow opens
    // with their context rather than an empty form.
    patchAssistDraft({ category, location: place, description: text });

    // A sentence with no place cannot be retrieved against a live source. Send
    // the traveller to the flow, where the missing place can be added alongside
    // the words they already gave, rather than to an empty situation page.
    if (!place) {
      router.push("/support");
      return;
    }

    const request: AssistRequest = {
      category,
      location: place,
      locale,
      ...(text ? { description: text } : {}),
    };
    router.push(assistHref(request));
  };

  return (
    <form
      onSubmit={onSubmit}
      className={cn("rounded-xl border border-line bg-paper-0 p-4 shadow-lg sm:p-5", className)}
      role="search"
      aria-label={t("intent.formLabel")}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
            {t("intent.whatLabel")}
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 400))}
            placeholder={t("intent.whatPlaceholder")}
            rows={2}
            maxLength={400}
            className="min-h-[3.25rem] w-full resize-none rounded-md border border-line bg-paper-50 px-3.5 py-2.5 text-base text-ink-900 placeholder:text-ink-400 focus-visible:border-accent-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-600"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">
            {t("intent.whereLabel")}
          </span>
          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value.slice(0, 160))}
            placeholder={t("intent.wherePlaceholder")}
            maxLength={160}
            autoComplete="off"
            className="h-[3.25rem] w-full rounded-md border border-line bg-paper-50 px-3.5 text-base text-ink-900 placeholder:text-ink-400 focus-visible:border-accent-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-600"
          />
        </label>
      </div>

      <p className="mt-2.5 min-h-5 text-xs leading-relaxed text-ink-500" aria-live="polite">
        {description.trim().length === 0 ? (
          t("intent.hint.empty")
        ) : classified ? (
          <>
            {t("intent.hint.routed")}{" "}
            <span className="font-medium text-ink-700">
              {t(`assist.category.${predictedCategory}.title`)}
            </span>
            {location.trim() ? ` · ${location.trim()}` : ""}
          </>
        ) : (
          t("intent.hint.unrouted")
        )}
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold text-paper-0",
            "transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600",
            canSubmit ? "bg-accent-600 hover:bg-accent-700" : "cursor-not-allowed bg-ink-300",
          )}
        >
          <Search className="size-4" aria-hidden="true" />
          {t("intent.submit")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>

        <p className="flex items-center gap-1.5 text-xs text-ink-500">
          <CornerDownLeft className="size-3.5 shrink-0" aria-hidden="true" />
          {t("intent.orPick")}
        </p>
      </div>

      {situation ? (
        <p className="mt-3 border-t border-line-soft pt-3 text-xs text-ink-500">
          {t("intent.savedFlight")}{" "}
          <button
            type="button"
            onClick={() => router.push("/situation")}
            className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:decoration-accent-600"
          >
            {t("intent.savedFlight.open")}
          </button>
        </p>
      ) : null}
    </form>
  );
}

/** Maps a natural-language sentence to a flight sub-intent for the flight flow. */
function inferNeed(
  text: string,
): "cancelled" | "delayed" | "connection" | "gate_change" | "announcement" | "other" {
  const value = text.toLowerCase();
  if (/\bcancel/.test(value)) return "cancelled";
  if (/\bdelay/.test(value)) return "delayed";
  if (/\bconnect|transfer|miss(ed)? my flight/.test(value)) return "connection";
  if (/\bgate|terminal|boarding/.test(value)) return "gate_change";
  if (/\bannounc/.test(value)) return "announcement";
  return "other";
}
