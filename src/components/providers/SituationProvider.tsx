"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AssistanceNeed, TimelineEvent } from "@/lib/core/types";
import type { SituationPage } from "@/lib/situation/compose";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useLocale } from "@/components/providers/LocaleProvider";

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const KEYS = {
  draft: "wayfinder.draft.v1",
  request: "wayfinder.request.v1",
  situation: "wayfinder.situation.v1",
  bookingReference: "wayfinder.bookingRef.v1",
  seenChanges: "wayfinder.seenChanges.v1",
} as const;

/**
 * Everything WAYFINDER keeps is written to this browser's own storage and never
 * transmitted for storage. `clearAllData` removes every key.
 */
export const STORAGE_KEYS = Object.values(KEYS);

function readJson<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Storage can be full or blocked. The session still works in memory.
  }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Draft {
  need: AssistanceNeed | null;
  flightNumber: string;
  travelDate: string;
  originAirport: string;
  destinationAirport: string;
  connectionAirport: string;
  connectionFlightNumber: string;
  connectionMinutes: string;
  bookingReference: string;
  description: string;
}

export const EMPTY_DRAFT: Draft = {
  need: null,
  flightNumber: "",
  travelDate: "",
  originAirport: "",
  destinationAirport: "",
  connectionAirport: "",
  connectionFlightNumber: "",
  connectionMinutes: "",
  bookingReference: "",
  description: "",
};

export interface StoredRequest {
  need: AssistanceNeed;
  flightNumber: string;
  travelDate?: string;
  originAirport?: string;
  destinationAirport?: string;
  connectionAirport?: string;
  connectionFlightNumber?: string;
  connectionMinutes?: number;
  locale: string;
  description?: string;
}

export type RequestStatus = "idle" | "loading" | "ready" | "error";

/** How often the page re-checks its sources while it is open and visible. */
const AUTO_REFRESH_SECONDS = 120;

interface SituationContextValue {
  draft: Draft;
  patchDraft: (patch: Partial<Draft>) => void;
  resetDraft: () => void;

  request: StoredRequest | null;
  situation: SituationPage | null;
  status: RequestStatus;
  error: string | null;
  fieldErrors: Record<string, string>;

  buildSituation: (request: StoredRequest, bookingReference?: string) => Promise<boolean>;
  refreshNow: () => Promise<void>;
  startOver: () => void;
  clearAllData: () => void;

  bookingReference: string;

  refreshing: boolean;
  lastRefreshedAt: string | null;

  autoRefresh: boolean;
  setAutoRefresh: (enabled: boolean) => void;
  secondsUntilRefresh: number | null;

  /** Change events the traveller has not acknowledged yet. */
  unseenChanges: TimelineEvent[];
  acknowledgeChanges: () => void;
}

const SituationContext = createContext<SituationContextValue | undefined>(undefined);

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function SituationProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [request, setRequest] = useState<StoredRequest | null>(null);
  const [situation, setSituation] = useState<SituationPage | null>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefreshState] = useState(true);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number | null>(null);
  const [bookingReference, setBookingReference] = useState("");
  const [seenChangeIds, setSeenChangeIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // --- Restore ------------------------------------------------------------
  useEffect(() => {
    const storedDraft = readJson<Draft>(KEYS.draft);
    if (storedDraft) setDraft({ ...EMPTY_DRAFT, ...storedDraft });

    const storedRequest = readJson<StoredRequest>(KEYS.request);
    const storedSituation = readJson<SituationPage>(KEYS.situation);
    if (storedRequest) setRequest(storedRequest);
    if (storedSituation) {
      setSituation(storedSituation);
      setStatus("ready");
    }

    const storedReference = readJson<string>(KEYS.bookingReference);
    if (typeof storedReference === "string") setBookingReference(storedReference);

    const storedSeen = readJson<string[]>(KEYS.seenChanges);
    if (Array.isArray(storedSeen)) setSeenChangeIds(storedSeen);

    setHydrated(true);
  }, []);

  const patchDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      writeJson(KEYS.draft, next);
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    writeJson(KEYS.draft, undefined);
  }, []);

  const setAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshState(enabled);
    if (!enabled) setSecondsUntilRefresh(null);
  }, []);

  const clearAllData = useCallback(() => {
    abortRef.current?.abort();
    for (const key of STORAGE_KEYS) writeJson(key, undefined);
    setDraft(EMPTY_DRAFT);
    setRequest(null);
    setSituation(null);
    setStatus("idle");
    setError(null);
    setFieldErrors({});
    setBookingReference("");
    setSeenChangeIds([]);
  }, []);

  // --- Build --------------------------------------------------------------
  const buildSituation = useCallback(
    async (next: StoredRequest, reference?: string): Promise<boolean> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      setError(null);
      setFieldErrors({});

      try {
        const response = await fetch("/api/situation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...next, bookingReference: reference }),
          signal: controller.signal,
        });

        const payload = (await response.json()) as {
          situation?: SituationPage;
          error?: string;
          fields?: Record<string, string>;
        };

        if (!response.ok || !payload.situation) {
          setFieldErrors(payload.fields ?? {});
          setError(payload.error ?? t("error.buildFailed"));
          setStatus("error");
          return false;
        }

        const composed = payload.situation;

        // A new request replaces the previous snapshot, so the timeline starts
        // clean rather than carrying changes from a different flight.
        setSituation(composed);
        setRequest(next);
        setStatus("ready");
        writeJson(KEYS.request, next);
        writeJson(KEYS.situation, composed);

        const changeIds = composed.timeline.filter((event) => event.change).map((e) => e.id);
        setSeenChangeIds(changeIds);
        writeJson(KEYS.seenChanges, changeIds);

        if (reference !== undefined) {
          setBookingReference(reference);
          writeJson(KEYS.bookingReference, reference || undefined);
        }

        return true;
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return false;
        setError(t("error.unreachable"));
        setStatus("error");
        return false;
      }
    },
    [t],
  );

  // --- Refresh ------------------------------------------------------------
  const refreshNow = useCallback(async () => {
    if (!request) return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/situation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const payload = (await response.json()) as {
        situation?: SituationPage;
        error?: string;
      };

      if (!response.ok || !payload.situation) {
        // Keep the existing situation and surface the failure as a banner
        // instead of replacing good data with an error screen.
        setError(payload.error ?? t("error.refreshFailed"));
        return;
      }

      setSituation(payload.situation);
      setError(null);
      writeJson(KEYS.situation, payload.situation);
    } catch {
      setError(t("error.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [request, t]);

  const startOver = useCallback(() => {
    abortRef.current?.abort();
    setSituation(null);
    setRequest(null);
    setStatus("idle");
    setError(null);
    setFieldErrors({});
    writeJson(KEYS.situation, undefined);
    writeJson(KEYS.request, undefined);
  }, []);

  // --- Automatic refresh --------------------------------------------------
  // Only runs while the tab is visible. A backgrounded tab should not keep
  // polling official providers on the traveller's behalf.
  useEffect(() => {
    if (!autoRefresh || !request || status !== "ready") {
      setSecondsUntilRefresh(null);
      return;
    }

    let remaining = AUTO_REFRESH_SECONDS;
    setSecondsUntilRefresh(remaining);

    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        setSecondsUntilRefresh(null);
        return;
      }
      remaining -= 1;
      if (remaining <= 0) {
        remaining = AUTO_REFRESH_SECONDS;
        void refreshNow();
      }
      setSecondsUntilRefresh(remaining);
    }, 1_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        remaining = AUTO_REFRESH_SECONDS;
        setSecondsUntilRefresh(remaining);
      } else {
        setSecondsUntilRefresh(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoRefresh, request, status, refreshNow]);

  // --- Unseen changes -----------------------------------------------------
  const unseenChanges = useMemo(() => {
    if (!situation) return [];
    return situation.timeline.filter(
      (event) => event.change && !seenChangeIds.includes(event.id),
    );
  }, [situation, seenChangeIds]);

  const acknowledgeChanges = useCallback(() => {
    if (!situation) return;
    const ids = situation.timeline.filter((event) => event.change).map((event) => event.id);
    setSeenChangeIds(ids);
    writeJson(KEYS.seenChanges, ids);
  }, [situation]);

  const value = useMemo<SituationContextValue>(
    () => ({
      draft,
      patchDraft,
      resetDraft,
      request,
      situation,
      status,
      error,
      fieldErrors,
      buildSituation,
      refreshNow,
      startOver,
      clearAllData,
      bookingReference,
      refreshing,
      lastRefreshedAt: situation?.intel.retrievedAt ?? null,
      autoRefresh,
      setAutoRefresh,
      secondsUntilRefresh,
      unseenChanges,
      acknowledgeChanges,
    }),
    [
      draft,
      patchDraft,
      resetDraft,
      request,
      situation,
      status,
      error,
      fieldErrors,
      buildSituation,
      refreshNow,
      startOver,
      clearAllData,
      bookingReference,
      refreshing,
      autoRefresh,
      setAutoRefresh,
      secondsUntilRefresh,
      unseenChanges,
      acknowledgeChanges,
    ],
  );

  // Render children immediately; the provider hydrates from storage on mount.
  void hydrated;

  return <SituationContext.Provider value={value}>{children}</SituationContext.Provider>;
}

export function useSituation(): SituationContextValue {
  const context = useContext(SituationContext);
  if (!context) {
    throw new Error("useSituation must be used inside a SituationProvider");
  }
  return context;
}

/** Default locale for the flow when nothing has been chosen yet. */
export const FALLBACK_LOCALE = DEFAULT_LOCALE;
