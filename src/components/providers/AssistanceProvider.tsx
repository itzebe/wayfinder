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

import type { AssistanceCategory, AssistancePage } from "@/lib/assist/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useLocale } from "@/components/providers/LocaleProvider";

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const KEYS = {
  draft: "wayfinder.assistDraft.v1",
  request: "wayfinder.assistRequest.v1",
  assistance: "wayfinder.assistPage.v1",
  seenChanges: "wayfinder.assistSeenChanges.v1",
} as const;

export const ASSIST_STORAGE_KEYS = Object.values(KEYS);

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
    // Storage can be blocked or full; the session still works in memory.
  }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AssistDraft {
  category: AssistanceCategory | null;
  countryCode: string;
  region: string;
  city: string;
  network: string;
  from: string;
  to: string;
  description: string;
}

export const EMPTY_ASSIST_DRAFT: AssistDraft = {
  category: null,
  countryCode: "",
  region: "",
  city: "",
  network: "",
  from: "",
  to: "",
  description: "",
};

export interface AssistRequest {
  category: AssistanceCategory;
  countryCode?: string;
  region?: string;
  city?: string;
  network?: string;
  from?: string;
  to?: string;
  description?: string;
  locale: string;
}

export type AssistStatus = "idle" | "loading" | "ready" | "error";

/** How often the page re-checks its sources while it is open and visible. */
const AUTO_REFRESH_SECONDS = 120;

interface AssistanceContextValue {
  draft: AssistDraft;
  patchDraft: (patch: Partial<AssistDraft>) => void;
  resetDraft: () => void;

  request: AssistRequest | null;
  assistance: AssistancePage | null;
  status: AssistStatus;
  error: string | null;
  fieldErrors: Record<string, string>;

  buildAssistance: (request: AssistRequest) => Promise<boolean>;
  refreshNow: () => Promise<void>;
  startOver: () => void;

  refreshing: boolean;
  autoRefresh: boolean;
  setAutoRefresh: (enabled: boolean) => void;
  secondsUntilRefresh: number | null;

  unseenChangeCount: number;
  acknowledgeChanges: () => void;
}

const AssistanceContext = createContext<AssistanceContextValue | undefined>(undefined);

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function AssistanceProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<AssistDraft>(EMPTY_ASSIST_DRAFT);
  const [request, setRequest] = useState<AssistRequest | null>(null);
  const [assistance, setAssistance] = useState<AssistancePage | null>(null);
  const [status, setStatus] = useState<AssistStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefreshState] = useState(true);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number | null>(null);
  const [seenChangeIds, setSeenChangeIds] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  // --- Restore ------------------------------------------------------------
  useEffect(() => {
    const storedDraft = readJson<AssistDraft>(KEYS.draft);
    if (storedDraft) setDraft({ ...EMPTY_ASSIST_DRAFT, ...storedDraft });

    const storedRequest = readJson<AssistRequest>(KEYS.request);
    const storedPage = readJson<AssistancePage>(KEYS.assistance);
    if (storedRequest) setRequest(storedRequest);
    if (storedPage) {
      setAssistance(storedPage);
      setStatus("ready");
    }

    const storedSeen = readJson<string[]>(KEYS.seenChanges);
    if (Array.isArray(storedSeen)) setSeenChangeIds(storedSeen);
  }, []);

  const patchDraft = useCallback((patch: Partial<AssistDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      writeJson(KEYS.draft, next);
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(EMPTY_ASSIST_DRAFT);
    writeJson(KEYS.draft, undefined);
  }, []);

  const setAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshState(enabled);
    if (!enabled) setSecondsUntilRefresh(null);
  }, []);

  // --- Build --------------------------------------------------------------
  const buildAssistance = useCallback(
    async (next: AssistRequest): Promise<boolean> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("loading");
      setError(null);
      setFieldErrors({});

      try {
        const response = await fetch("/api/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
          signal: controller.signal,
        });

        const payload = (await response.json()) as {
          assistance?: AssistancePage;
          error?: string;
          fields?: Record<string, string>;
        };

        if (!response.ok || !payload.assistance) {
          setFieldErrors(payload.fields ?? {});
          setError(payload.error ?? t("error.buildFailed"));
          setStatus("error");
          return false;
        }

        setAssistance(payload.assistance);
        setRequest(next);
        setStatus("ready");
        writeJson(KEYS.request, next);
        writeJson(KEYS.assistance, payload.assistance);

        const changeIds = payload.assistance.timeline
          .filter((event) => event.change)
          .map((event) => event.id);
        setSeenChangeIds(changeIds);
        writeJson(KEYS.seenChanges, changeIds);

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
      const response = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const payload = (await response.json()) as {
        assistance?: AssistancePage;
        error?: string;
      };

      if (!response.ok || !payload.assistance) {
        // Keep the last good page and surface the failure as a banner rather
        // than replacing real data with an error screen.
        setError(payload.error ?? t("error.refreshFailed"));
        return;
      }

      setAssistance(payload.assistance);
      setError(null);
      writeJson(KEYS.assistance, payload.assistance);
    } catch {
      setError(t("error.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [request, t]);

  const startOver = useCallback(() => {
    abortRef.current?.abort();
    setAssistance(null);
    setRequest(null);
    setStatus("idle");
    setError(null);
    setFieldErrors({});
    setSeenChangeIds([]);
    writeJson(KEYS.assistance, undefined);
    writeJson(KEYS.request, undefined);
  }, []);

  // --- Automatic refresh --------------------------------------------------
  // Only while the tab is visible. A backgrounded tab should not keep polling
  // official providers on the traveller's behalf.
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
  const unseenChangeCount = useMemo(() => {
    if (!assistance) return 0;
    return assistance.timeline.filter(
      (event) => event.change && !seenChangeIds.includes(event.id),
    ).length;
  }, [assistance, seenChangeIds]);

  const acknowledgeChanges = useCallback(() => {
    if (!assistance) return;
    const ids = assistance.timeline.filter((event) => event.change).map((event) => event.id);
    setSeenChangeIds(ids);
    writeJson(KEYS.seenChanges, ids);
  }, [assistance]);

  const value = useMemo<AssistanceContextValue>(
    () => ({
      draft,
      patchDraft,
      resetDraft,
      request,
      assistance,
      status,
      error,
      fieldErrors,
      buildAssistance,
      refreshNow,
      startOver,
      refreshing,
      autoRefresh,
      setAutoRefresh,
      secondsUntilRefresh,
      unseenChangeCount,
      acknowledgeChanges,
    }),
    [
      draft,
      patchDraft,
      resetDraft,
      request,
      assistance,
      status,
      error,
      fieldErrors,
      buildAssistance,
      refreshNow,
      startOver,
      refreshing,
      autoRefresh,
      setAutoRefresh,
      secondsUntilRefresh,
      unseenChangeCount,
      acknowledgeChanges,
    ],
  );

  return <AssistanceContext.Provider value={value}>{children}</AssistanceContext.Provider>;
}

export function useAssistance(): AssistanceContextValue {
  const context = useContext(AssistanceContext);
  if (!context) {
    throw new Error("useAssistance must be used inside an AssistanceProvider");
  }
  return context;
}

export const ASSIST_FALLBACK_LOCALE = DEFAULT_LOCALE;
