"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Lock, Search } from "lucide-react";

import { cn } from "@/lib/format/cn";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { TextField, TextAreaField, ToggleField, SelectField } from "@/components/ui/Field";
import { FlowProgress, SituationPicker, NEED_ORDER } from "@/components/flow/SituationPicker";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useSituation } from "@/components/providers/SituationProvider";
import { LOCALES } from "@/lib/i18n/locales";
import type { AssistanceNeed } from "@/lib/core/types";
import { todayDateValue } from "@/lib/format/datetime";

/**
 * The assistance flow.
 *
 * Two steps: identify the situation, then supply only the details that will
 * materially improve the answer. Every field is optional except the flight
 * number, because a traveller standing in an airport should never be blocked by
 * a form. The draft is written to this browser's storage on every keystroke, so
 * a refresh or an accidental back navigation does not lose progress.
 */
export function AssistanceFlow() {
  const { t, locale, setLocale } = useLocale();
  const { draft, patchDraft, buildSituation, status, error, fieldErrors, resetDraft } =
    useSituation();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(draft.need ? 2 : 1);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [connectionOpen, setConnectionOpen] = useState(
    Boolean(draft.connectionFlightNumber || draft.connectionAirport),
  );
  const [announcementOpen, setAnnouncementOpen] = useState(draft.need === "announcement");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Announcement translation is handled on the situation page; here the
  // traveller just needs a place to keep the text.
  const [announcementText, setAnnouncementText] = useState("");

  const total = 2;
  const submitting = status === "loading";

  // Prefill today's date once, so the most likely case needs one field fewer.
  useEffect(() => {
    if (!draft.travelDate) patchDraft({ travelDate: todayDateValue() });
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the step heading when the step changes, so keyboard and screen
  // reader users are told where they are.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (draft.need === "announcement") setAnnouncementOpen(true);
  }, [draft.need]);

  const errors = { ...fieldErrors, ...localErrors };

  const validateFlightNumber = useCallback(
    (value: string) => {
      if (!value.trim()) {
        setLocalErrors((current) => ({
          ...current,
          flightNumber: t("validation.required"),
        }));
        return false;
      }
      if (!/^[A-Za-z0-9]{2,3}\s?-?\s?\d{1,4}[A-Za-z]?$/.test(value.trim())) {
        setLocalErrors((current) => ({
          ...current,
          flightNumber: t("validation.flightNumberFormat"),
        }));
        return false;
      }
      setLocalErrors(({ flightNumber: _removed, ...rest }) => rest);
      return true;
    },
    [t],
  );

  const validateAirport = useCallback(
    (key: string, value: string) => {
      if (!value.trim()) {
        setLocalErrors(({ [key]: _removed, ...rest }) => rest);
        return true;
      }
      if (!/^[A-Za-z]{3,4}$/.test(value.trim())) {
        setLocalErrors((current) => ({ ...current, [key]: t("validation.airportFormat") }));
        return false;
      }
      setLocalErrors(({ [key]: _removed, ...rest }) => rest);
      return true;
    },
    [t],
  );

  // The travel date is optional, but a value that is present and unusable must
  // be caught here: it changes which day the weather and status are read for.
  const validateDate = useCallback(
    (value: string) => {
      if (!value.trim()) {
        setLocalErrors(({ travelDate: _removed, ...rest }) => rest);
        return true;
      }
      const parsed = Date.parse(value);
      if (Number.isNaN(parsed)) {
        setLocalErrors((current) => ({ ...current, travelDate: t("validation.dateInvalid") }));
        return false;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsed < today.getTime()) {
        setLocalErrors((current) => ({ ...current, travelDate: t("validation.datePast") }));
        return false;
      }
      setLocalErrors(({ travelDate: _removed, ...rest }) => rest);
      return true;
    },
    [t],
  );

  const validateBookingReference = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setLocalErrors(({ bookingReference: _removed, ...rest }) => rest);
        return true;
      }
      if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
        setLocalErrors((current) => ({
          ...current,
          bookingReference: t("validation.bookingReferenceFormat"),
        }));
        return false;
      }
      setLocalErrors(({ bookingReference: _removed, ...rest }) => rest);
      return true;
    },
    [t],
  );

  const validateConnectionMinutes = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setLocalErrors(({ connectionMinutes: _removed, ...rest }) => rest);
        return true;
      }
      const minutes = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(minutes)) {
        setLocalErrors((current) => ({
          ...current,
          connectionMinutes: t("validation.connectionMinutes"),
        }));
        return false;
      }
      if (minutes < 0 || minutes > 2_880) {
        setLocalErrors((current) => ({
          ...current,
          connectionMinutes: t("validation.connectionMinutesRange"),
        }));
        return false;
      }
      setLocalErrors(({ connectionMinutes: _removed, ...rest }) => rest);
      return true;
    },
    [t],
  );

  const chooseSituation = (need: AssistanceNeed) => {
    patchDraft({ need });
  };

  const goToStep2 = () => {
    if (!draft.need) {
      setLocalErrors({ need: t("validation.required") });
      return;
    }
    setStep(2);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.need) {
      setStep(1);
      setLocalErrors({ need: t("validation.required") });
      return;
    }

    const flightOk = validateFlightNumber(draft.flightNumber);
    const originOk = validateAirport("originAirport", draft.originAirport);
    const destinationOk = validateAirport("destinationAirport", draft.destinationAirport);
    const connectionOk = validateAirport("connectionAirport", draft.connectionAirport);
    const dateOk = validateDate(draft.travelDate);
    const referenceOk = validateBookingReference(draft.bookingReference);
    const minutesOk = validateConnectionMinutes(draft.connectionMinutes);

    if (
      !flightOk ||
      !originOk ||
      !destinationOk ||
      !connectionOk ||
      !dateOk ||
      !referenceOk ||
      !minutesOk
    ) {
      // Send the traveller back to the field that needs attention.
      document
        .querySelector<HTMLElement>("[aria-invalid='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const minutes = Number.parseInt(draft.connectionMinutes, 10);

    const ok = await buildSituation(
      {
        need: draft.need,
        flightNumber: draft.flightNumber.trim(),
        travelDate: draft.travelDate || undefined,
        originAirport: draft.originAirport.trim() || undefined,
        destinationAirport: draft.destinationAirport.trim() || undefined,
        connectionAirport: draft.connectionAirport.trim() || undefined,
        connectionFlightNumber: draft.connectionFlightNumber.trim() || undefined,
        connectionMinutes: Number.isFinite(minutes) ? minutes : undefined,
        locale,
        description: draft.description.trim() || undefined,
      },
      draft.bookingReference.trim() || undefined,
    );

    if (ok) {
      // The announcement text travels with the situation so it can be translated
      // on the situation page without the traveller re-typing it.
      if (announcementText.trim()) {
        try {
          window.sessionStorage.setItem("wayfinder.announcement", announcementText.trim());
        } catch {
          // Non-fatal: the situation page simply will not offer a translation.
        }
      }
      router.push("/situation");
    }
  };

  const localeOptions = useMemo(
    () =>
      LOCALES.map((entry) => ({
        value: entry.code,
        label: `${entry.nativeName} — ${entry.name}`,
      })),
    [],
  );

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
              {t("flow.selectSituation")}
            </h2>
            <p className="measure mt-2 text-sm leading-relaxed text-ink-600">
              {t("flow.selectSituationHelp")}
            </p>

            <div className="mt-5">
              <SituationPicker value={draft.need} onChange={chooseSituation} />
            </div>

            {errors.need ? (
              <p role="alert" className="mt-3 text-sm font-medium text-danger-600">
                {errors.need}
              </p>
            ) : null}

            <div className="mt-6 rounded-lg border border-line-soft bg-paper-0 p-4">
              <TextAreaField
                id="description"
                label={t("flow.describeOwn")}
                value={draft.description}
                onChange={(value) => patchDraft({ description: value })}
                help={t("flow.describeHelp")}
                placeholder={t("flow.describePlaceholder")}
                optional
                optionalLabel={t("details.optional")}
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-xs text-ink-500">
                <Lock className="size-3.5 shrink-0 text-success-600" aria-hidden="true" />
                {t("flow.noAccount")}
              </p>
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
              {t("details.title")}
            </h2>
            <p className="measure mt-2 text-sm leading-relaxed text-ink-600">
              {t("details.help")}
            </p>

            <div className="mt-5 space-y-5">
              <TextField
                id="flightNumber"
                label={t("details.flightNumber")}
                value={draft.flightNumber}
                onChange={(value) => patchDraft({ flightNumber: value.toUpperCase() })}
                onBlur={() => validateFlightNumber(draft.flightNumber)}
                help={t("details.flightNumberHelp")}
                error={errors.flightNumber}
                placeholder={t("details.flightNumberExample")}
                autoComplete="off"
                maxLength={8}
                mono
                optionalLabel={t("details.optional")}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  id="originAirport"
                  label={t("details.origin")}
                  value={draft.originAirport}
                  onChange={(value) => patchDraft({ originAirport: value.toUpperCase() })}
                  onBlur={() => validateAirport("originAirport", draft.originAirport)}
                  help={t("details.originHelp")}
                  error={errors.originAirport}
                  placeholder="LHR"
                  optional
                  optionalLabel={t("details.optional")}
                  maxLength={4}
                  mono
                />
                <TextField
                  id="destinationAirport"
                  label={t("details.destination")}
                  value={draft.destinationAirport}
                  onChange={(value) => patchDraft({ destinationAirport: value.toUpperCase() })}
                  onBlur={() => validateAirport("destinationAirport", draft.destinationAirport)}
                  help={t("details.destinationHelp")}
                  error={errors.destinationAirport}
                  placeholder="DOH"
                  optional
                  optionalLabel={t("details.optional")}
                  maxLength={4}
                  mono
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  id="travelDate"
                  label={t("details.date")}
                  value={draft.travelDate}
                  onChange={(value) => patchDraft({ travelDate: value })}
                  onBlur={() => validateDate(draft.travelDate)}
                  help={t("details.dateHelp")}
                  error={errors.travelDate}
                  placeholder="2026-10-15"
                  optional
                  optionalLabel={t("details.optional")}
                  mono
                />
                <SelectField
                  id="locale"
                  label={t("details.language")}
                  value={locale}
                  onChange={(value) => setLocale(value as typeof locale)}
                  options={localeOptions}
                  help={t("details.languageHelp")}
                  optionalLabel={t("details.optional")}
                />
              </div>

              {/* Progressive disclosure: the connection block only appears when
                  the traveller says they have one, because it changes the advice. */}
              <div className="rounded-lg border border-line-soft bg-paper-50 p-4">
                <ToggleField
                  id="hasConnection"
                  label={t("details.connection")}
                  description={t("details.connectionHelp")}
                  checked={connectionOpen}
                  onChange={(checked) => {
                    setConnectionOpen(checked);
                    if (!checked) {
                      patchDraft({
                        connectionAirport: "",
                        connectionFlightNumber: "",
                        connectionMinutes: "",
                      });
                    }
                  }}
                />

                {connectionOpen ? (
                  <div className="mt-4 grid animate-[slide-down_0.24s_var(--ease-out-soft)_both] gap-5 border-t border-line-soft pt-4 sm:grid-cols-3">
                    <TextField
                      id="connectionFlightNumber"
                      label={t("details.connectionFlight")}
                      value={draft.connectionFlightNumber}
                      onChange={(value) =>
                        patchDraft({ connectionFlightNumber: value.toUpperCase() })
                      }
                      help={t("details.connectionFlightHelp")}
                      error={errors.connectionFlightNumber}
                      placeholder="LH456"
                      optional
                      optionalLabel={t("details.optional")}
                      maxLength={8}
                      mono
                    />
                    <TextField
                      id="connectionAirport"
                      label={t("details.connectionAirport")}
                      value={draft.connectionAirport}
                      onChange={(value) => patchDraft({ connectionAirport: value.toUpperCase() })}
                      onBlur={() => validateAirport("connectionAirport", draft.connectionAirport)}
                      help={t("details.connectionAirportHelp")}
                      error={errors.connectionAirport}
                      placeholder="MAD"
                      optional
                      optionalLabel={t("details.optional")}
                      maxLength={4}
                      mono
                    />
                    <TextField
                      id="connectionMinutes"
                      label={t("details.connectionTime")}
                      value={draft.connectionMinutes}
                      onChange={(value) =>
                        patchDraft({ connectionMinutes: value.replace(/[^0-9]/g, "") })
                      }
                      onBlur={() => validateConnectionMinutes(draft.connectionMinutes)}
                      help={t("details.connectionTimeHelp")}
                      error={errors.connectionMinutes}
                      placeholder="90"
                      inputMode="numeric"
                      optional
                      optionalLabel={t("details.optional")}
                      maxLength={4}
                      mono
                    />
                  </div>
                ) : null}
              </div>

              {draft.need === "announcement" ? (
                <div className="animate-[slide-down_0.24s_var(--ease-out-soft)_both]">
                  <TextAreaField
                    id="announcementText"
                    label={t("announce.label")}
                    value={announcementText}
                    onChange={setAnnouncementText}
                    help={t("announce.helpForm")}
                    placeholder={t("announce.placeholder")}
                    optional
                    optionalLabel={t("details.optional")}
                    rows={3}
                    maxLength={4000}
                  />
                </div>
              ) : null}

              <div className="rounded-lg border border-line-soft bg-paper-50 p-4">
                <TextField
                  id="bookingReference"
                  label={t("details.bookingReference")}
                  value={draft.bookingReference}
                  onChange={(value) => patchDraft({ bookingReference: value.toUpperCase() })}
                  onBlur={() => validateBookingReference(draft.bookingReference)}
                  help={t("details.bookingReferenceHelp")}
                  error={errors.bookingReference}
                  placeholder="ABC123"
                  autoComplete="off"
                  optional
                  optionalLabel={t("details.optional")}
                  maxLength={6}
                  mono
                />
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

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Search className="size-4 animate-pulse" aria-hidden="true" />
                    {t("details.submitting")}
                  </>
                ) : (
                  <>
                    {t("details.submit")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>

            <p className="mt-4 flex items-start gap-2 text-xs text-ink-500">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden="true" />
              <span>
                We never ask for passport numbers, payment details or passwords. Your details
                stay in this browser unless you build a situation page.
              </span>
            </p>
          </form>
        ) : null}
      </div>

      {/* Supporting column: what happens next, and a way to start over. */}
      <aside className="lg:sticky lg:top-24">
        <div className="rounded-lg border border-line-soft bg-paper-0 p-5">
          <h2 className="text-sm font-semibold text-ink-900">{t("flow.whatHappensNext")}</h2>
          <ol className="mt-3 space-y-3 text-sm text-ink-600">
            <li className="flex gap-2.5">
              <span className="ident mt-0.5 text-xs font-semibold text-ink-400">01</span>
              <span>{t("flow.step1")}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="ident mt-0.5 text-xs font-semibold text-ink-400">02</span>
              <span>{t("flow.step2")}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="ident mt-0.5 text-xs font-semibold text-ink-400">03</span>
              <span>{t("flow.step3")}</span>
            </li>
          </ol>

          <div className="mt-5 border-t border-line-soft pt-4">
            <Button variant="ghost" size="sm" onClick={resetDraft} className="w-full">
              {t("flow.clearAnswers")}
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-accent-200 bg-accent-50 p-5">
          <h2 className="text-sm font-semibold text-ink-900">{t("flow.whySoLittle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            {t("flow.whySoLittleBody")}
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Kept alongside the flow so the need order is available to the situation page. */
export { NEED_ORDER };
