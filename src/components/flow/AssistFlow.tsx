"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Lock, Search } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { CategoryPicker, CATEGORY_ORDER } from "@/components/flow/CategoryPicker";
import { FlowProgress } from "@/components/flow/SituationPicker";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useAssistance, type AssistRequest } from "@/components/providers/AssistanceProvider";
import { assistHref } from "@/lib/assist/request-link";
import { needsPlacePrompt, type CountryLevelCoverage } from "@/lib/assist/countryHint";
import { LOCALES } from "@/lib/i18n/locales";
import type { AssistanceCategory } from "@/lib/assist/types";

/**
 * The generic assistance flow.
 *
 * Two steps: pick the situation, then supply only what changes the answer. A
 * country and, for locations that need it, a city or region are the minimum —
 * the same fields serve every category, because the engine normalises on the
 * server. Flights route to the dedicated flight flow instead.
 *
 * The draft is written to this browser's storage on every change, so a refresh
 * or an accidental back navigation does not lose the traveller's answers.
 */

/** Categories where naming an origin and destination materially helps. */
const USES_ORIGIN: AssistanceCategory[] = ["metro", "rail", "bus"];

export function AssistFlow() {
  const { t, locale, setLocale } = useLocale();
  const { draft, patchDraft, buildAssistance, status, error, fieldErrors, resetDraft } =
    useAssistance();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<1 | 2>(draft.category ? 2 : 1);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<AssistanceCategory[]>([]);
  // Which countries each category can answer from a country name alone. Fetched
  // once with the catalogue below; until it arrives, a bare country waits for the
  // engine rather than being guessed at.
  const [countryCoverage, setCountryCoverage] = useState<CountryLevelCoverage | undefined>();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const total = 2;
  const submitting = status === "loading";

  // A `?category=` from a homepage shortcut preselects the situation and opens
  // the detail step, so the traveller is not asked to choose twice.
  const paramCategory = searchParams.get("category");
  const appliedParam = useRef(false);
  useEffect(() => {
    if (appliedParam.current || !paramCategory) return;
    appliedParam.current = true;
    if (paramCategory !== "flights" && CATEGORY_ORDER.includes(paramCategory as AssistanceCategory)) {
      patchDraft({ category: paramCategory as AssistanceCategory });
      setStep(2);
    }
  }, [paramCategory, patchDraft]);

  // Ask the catalogue which categories have a provider at all, so a category we
  // cannot serve anywhere is marked rather than offered and then refused. The
  // same response carries the country-level coverage that lets a bare country
  // name skip the round trip below.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/assist");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          categories?: { id: AssistanceCategory; available: boolean }[];
          countryLevelCoverage?: CountryLevelCoverage;
        };
        if (cancelled) return;
        setCountryCoverage(payload.countryLevelCoverage);
        if (!payload.categories) return;
        setUnavailable(
          payload.categories
            .filter((entry) => !entry.available && entry.id !== "flights")
            .map((entry) => entry.id),
        );
      } catch {
        // The catalogue is an enhancement; the flow works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const errors = { ...fieldErrors, ...localErrors };

  const submit = useCallback(async () => {
    if (!draft.category) {
      setStep(1);
      setLocalErrors({ category: t("validation.required") });
      return;
    }
    if (draft.category === "flights") {
      router.push("/help");
      return;
    }

    const hasLocation = draft.location.trim().length > 0;
    const hasDescription = draft.description.trim().length > 0;

    // A location or a description is the minimum. The location is free text, so
    // there is no country-code format to reject: "Lagos, Nigeria" is valid, and
    // so is "Ikeja, Lagos, Nigeria". Refusing an unrecognised country here was
    // the dead end for anywhere outside the live provider list.
    if (!hasLocation && !hasDescription) {
      setLocalErrors((current) => ({
        ...current,
        location: t("validation.assistLocationRequired"),
      }));
      document
        .querySelector<HTMLElement>("[aria-invalid='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setLocalErrors({});

    const request: AssistRequest = {
      category: draft.category,
      location: draft.location.trim() || undefined,
      network: draft.network.trim() || undefined,
      from: draft.from.trim() || undefined,
      to: draft.to.trim() || undefined,
      description: draft.description.trim() || undefined,
      locale,
    };

    // A bare country name no source can answer without a place: go straight to
    // the situation page, which asks for a city. The coverage is published, so
    // building the page first would spend a round trip — 0.3–1.2s in production
    // — to learn what we already know. Nothing is claimed about the place here:
    // the page still says no source was queried, and the real search runs once a
    // city is given. A request carrying free text is never preempted.
    if (needsPlacePrompt(request, countryCoverage)) {
      router.push(assistHref(request));
      return;
    }

    const ok = await buildAssistance(request);
    // Navigate to the canonical, shareable link for this search rather than a
    // bare /assist: the query string is what makes the page reopenable and the
    // situation it names unambiguous if the traveller presses Back.
    if (ok) router.push(assistHref(request));
  }, [draft, locale, router, buildAssistance, t, countryCoverage]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submit();
  };

  const chooseCategory = (category: AssistanceCategory) => {
    patchDraft({ category });
    if (category === "flights") {
      // Flights have their own detailed itinerary flow.
      router.push("/help");
      return;
    }
  };

  const goToStep2 = () => {
    if (!draft.category) {
      setLocalErrors({ category: t("validation.required") });
      return;
    }
    if (draft.category === "flights") {
      router.push("/help");
      return;
    }
    setStep(2);
  };

  const localeOptions = useMemo(
    () =>
      LOCALES.map((entry) => ({
        value: entry.code,
        label: `${entry.nativeName} — ${entry.name}`,
      })),
    [],
  );

  const usesOrigin = draft.category ? USES_ORIGIN.includes(draft.category) : false;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-10">
      <div>
        <FlowProgress current={step} total={total} label={t("flow.stepOf", { current: step, total })} />

        {step === 1 ? (
          <div className="mt-6 animate-[rise_0.32s_var(--ease-out-soft)_both]">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-600 sm:text-2xl"
            >
              {t("assist.title")}
            </h2>
            <p className="measure mt-2 text-sm leading-relaxed text-ink-600">
              {t("assist.subtitle")}
            </p>

            <div className="mt-5">
              <CategoryPicker value={draft.category} onChange={chooseCategory} unavailable={unavailable} />
            </div>

            {errors.category ? (
              <p role="alert" className="mt-3 text-sm font-medium text-danger-600">
                {errors.category}
              </p>
            ) : null}

            <p className="mt-4 flex items-center gap-2 text-xs text-ink-500">
              <Lock className="size-3.5 shrink-0 text-success-600" aria-hidden="true" />
              {t("assist.noAccount")}
            </p>

            <div className="mt-6 flex justify-end">
              <Button size="lg" onClick={goToStep2} className="w-full sm:w-auto">
                {t("flow.continue")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <form
            onSubmit={onSubmit}
            noValidate
            className="mt-6 animate-[rise_0.32s_var(--ease-out-soft)_both]"
          >
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-600 sm:text-2xl"
            >
              {t("assist.location.title")}
            </h2>
            <p className="measure mt-2 text-sm leading-relaxed text-ink-600">
              {t("assist.location.lead")}
            </p>

            <div className="mt-5 space-y-5">
              <TextField
                id="location"
                label={t("assist.location.field")}
                value={draft.location}
                onChange={(value) => patchDraft({ location: value })}
                help={t("assist.location.fieldHelp")}
                error={errors.location}
                placeholder={t("assist.location.fieldPlaceholder")}
                autoComplete="off"
                maxLength={160}
                optionalLabel={t("details.optional")}
              />

              {usesOrigin ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField
                    id="from"
                    label={t("assist.location.from")}
                    value={draft.from}
                    onChange={(value) => patchDraft({ from: value })}
                    help={t("assist.location.fromHelp")}
                    error={errors.from}
                    placeholder="Victoria"
                    optional
                    optionalLabel={t("details.optional")}
                    maxLength={120}
                  />
                  <TextField
                    id="to"
                    label={t("assist.location.to")}
                    value={draft.to}
                    onChange={(value) => patchDraft({ to: value })}
                    help={t("assist.location.toHelp")}
                    error={errors.to}
                    placeholder="Green Park"
                    optional
                    optionalLabel={t("details.optional")}
                    maxLength={120}
                  />
                </div>
              ) : null}

              <TextField
                id="network"
                label={t("assist.location.network")}
                value={draft.network}
                onChange={(value) => patchDraft({ network: value })}
                help={t("assist.location.networkHelp")}
                error={errors.network}
                placeholder={t("assist.location.networkPlaceholder")}
                optional
                optionalLabel={t("details.optional")}
                maxLength={120}
              />

              <div className="rounded-lg border border-line-soft bg-paper-0 p-4">
                <TextAreaField
                  id="description"
                  label={t("assist.describe.label")}
                  value={draft.description}
                  onChange={(value) => patchDraft({ description: value })}
                  help={t("assist.describe.help")}
                  error={errors.description}
                  placeholder={t("assist.describe.placeholder")}
                  optional
                  optionalLabel={t("details.optional")}
                  rows={3}
                  maxLength={2000}
                />
              </div>

              <div className="rounded-lg border border-line-soft bg-paper-50 p-4">
                <label
                  htmlFor="assist-locale"
                  className="text-sm font-medium text-ink-800"
                >
                  {t("details.language")}
                </label>
                <select
                  id="assist-locale"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as typeof locale)}
                  className="mt-2 h-11 w-full rounded-md border border-line bg-paper-0 px-3 text-sm text-ink-900 focus-visible:border-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
                >
                  {localeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-ink-500">{t("details.languageHelp")}</p>
              </div>
            </div>

            {error ? (
              <Callout tone="danger" title={t("error.title")} className="mt-5">
                {error}
              </Callout>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("flow.back")}
              </Button>

              <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? (
                  <>
                    <Search className="size-4 animate-pulse" aria-hidden="true" />
                    {t("details.submitting")}
                  </>
                ) : (
                  <>
                    {t("assist.location.submit")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>

            <p className="mt-4 flex items-start gap-2 text-xs text-ink-500">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden="true" />
              <span>{t("assist.privacyNote")}</span>
            </p>
          </form>
        ) : null}
      </div>

      <aside className="lg:sticky lg:top-24">
        <div className="rounded-lg border border-line-soft bg-paper-0 p-5">
          <h2 className="text-sm font-semibold text-ink-900">{t("flow.whatHappensNext")}</h2>
          <ol className="mt-3 space-y-3 text-sm text-ink-600">
            <li className="flex gap-2.5">
              <span className="ident mt-0.5 text-xs font-semibold text-ink-400">01</span>
              <span>{t("assist.next.step1")}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="ident mt-0.5 text-xs font-semibold text-ink-400">02</span>
              <span>{t("assist.next.step2")}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="ident mt-0.5 text-xs font-semibold text-ink-400">03</span>
              <span>{t("assist.next.step3")}</span>
            </li>
          </ol>

          <div className="mt-5 border-t border-line-soft pt-4">
            <Button variant="ghost" size="sm" onClick={resetDraft} className="w-full">
              {t("flow.clearAnswers")}
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-5">
          <h2 className="text-sm font-semibold text-ink-900">{t("assist.coverage.title")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t("assist.coverage.note")}
          </p>
        </div>
      </aside>
    </div>
  );
}

export { CATEGORY_ORDER };
