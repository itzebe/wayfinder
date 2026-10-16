/**
 * HTTP client for upstream data providers.
 *
 * Responsibilities: request timeouts, bounded retries with exponential backoff
 * and jitter, `Retry-After` respect, conditional requests (ETag /
 * Last-Modified) and an honest error taxonomy so callers can distinguish
 * "provider rejected us" from "provider is down" from "network is down".
 */

export type HttpErrorKind =
  | "timeout"
  | "network"
  | "rate_limited"
  | "not_found"
  | "server_error"
  | "client_error"
  | "parse_error";

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    kind: HttpErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.kind = kind;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface HttpResult<T> {
  data: T;
  /** Wall-clock time the response finished, ISO-8601 UTC. */
  retrievedAt: string;
  /** `304` means the upstream confirmed our cached copy is still current. */
  notModified: boolean;
  etag?: string;
  lastModified?: string;
  status: number;
}

export interface HttpOptions {
  timeoutMs?: number;
  /** Injectable transport so adapters can be tested against fixtures. */
  fetchImpl?: typeof fetch;
  retries?: number;
  signal?: AbortSignal;
  /** Sent as If-None-Match. */
  etag?: string;
  /** Sent as If-Modified-Since. */
  lastModified?: string;
  accept?: string;
  headers?: Record<string, string>;
  /** HTTP method; defaults to GET. POST is used by JSON APIs like Gemini. */
  method?: "GET" | "POST";
  /** JSON request body, serialised and sent with `method: "POST"`. */
  body?: unknown;
}

const USER_AGENT =
  "WAYFINDER/1.0 (travel disruption assistance; contact: operator of this deployment)";

const RETRY_BASE_MS = 350;
const RETRY_MAX_MS = 4_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new HttpError("timeout", "Request aborted"));
      },
      { once: true },
    );
  });
}

/** Parses `Retry-After` in either delta-seconds or HTTP-date form. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  return undefined;
}

/**
 * Performs a single attempt. Returns parsed JSON, or a `notModified` marker for
 * a 304, which lets providers reuse their cached payload without re-downloading.
 */
async function attempt<T>(url: string, options: HttpOptions): Promise<HttpResult<T>> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: options.accept ?? "application/json",
    "User-Agent": USER_AGENT,
    ...options.headers,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.etag) headers["If-None-Match"] = options.etag;
  if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });

    const retrievedAt = new Date().toISOString();

    if (response.status === 304) {
      return { data: undefined as T, retrievedAt, notModified: true, status: 304 };
    }

    if (response.status === 404) {
      throw new HttpError("not_found", `Upstream returned 404 for ${url}`, { status: 404 });
    }

    if (response.status === 429) {
      throw new HttpError("rate_limited", `Rate limited by upstream for ${url}`, {
        status: 429,
        retryable: true,
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      });
    }

    if (response.status >= 500) {
      throw new HttpError("server_error", `Upstream error ${response.status} for ${url}`, {
        status: response.status,
        retryable: true,
      });
    }

    if (!response.ok) {
      throw new HttpError("client_error", `Upstream error ${response.status} for ${url}`, {
        status: response.status,
      });
    }

    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new HttpError("parse_error", `Upstream returned non-JSON for ${url}`, {
        status: response.status,
      });
    }

    return {
      data,
      retrievedAt,
      notModified: false,
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      status: response.status,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError("timeout", `Request to ${url} timed out`, { retryable: true });
    }
    throw new HttpError("network", `Network failure for ${url}: ${String(error)}`, {
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/** Fetches JSON with bounded retries, exponential backoff and jitter. */
export async function fetchJson<T>(
  url: string,
  options: HttpOptions = {},
): Promise<HttpResult<T>> {
  const retries = options.retries ?? 2;
  let lastError: HttpError | undefined;

  for (let attemptIndex = 0; attemptIndex <= retries; attemptIndex += 1) {
    try {
      return await attempt<T>(url, options);
    } catch (error) {
      const httpError =
        error instanceof HttpError
          ? error
          : new HttpError("network", String(error), { retryable: true });
      lastError = httpError;

      if (!httpError.retryable || attemptIndex === retries) break;

      const backoff = Math.min(RETRY_BASE_MS * 2 ** attemptIndex, RETRY_MAX_MS);
      const jitter = Math.random() * RETRY_BASE_MS;
      await sleep(httpError.retryAfterMs ?? backoff + jitter, options.signal);
    }
  }

  throw lastError ?? new HttpError("network", "Unknown upstream failure");
}

/** Fetches a text payload (used for XML feeds such as FAA NASSTATUS). */
export async function fetchText(
  url: string,
  options: HttpOptions = {},
): Promise<HttpResult<string>> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 8_000;
  let lastError: HttpError | undefined;

  for (let attemptIndex = 0; attemptIndex <= retries; attemptIndex += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await (options.fetchImpl ?? fetch)(url, {
        headers: {
          Accept: options.accept ?? "application/xml,text/xml,*/*",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new HttpError(
          response.status === 429 ? "rate_limited" : "server_error",
          `Upstream error ${response.status} for ${url}`,
          {
            status: response.status,
            retryable: response.status >= 500 || response.status === 429,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
          },
        );
      }
      return {
        data: await response.text(),
        retrievedAt: new Date().toISOString(),
        notModified: false,
        etag: response.headers.get("etag") ?? undefined,
        status: response.status,
      };
    } catch (error) {
      const httpError =
        error instanceof HttpError
          ? error
          : new HttpError(
              error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
              String(error),
              { retryable: true },
            );
      lastError = httpError;
      if (!httpError.retryable || attemptIndex === retries) break;
      await sleep(
        httpError.retryAfterMs ?? Math.min(RETRY_BASE_MS * 2 ** attemptIndex, RETRY_MAX_MS),
        options.signal,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new HttpError("network", "Unknown upstream failure");
}

/** Human-readable, non-leaking description of a failure for the UI. */
export function describeHttpError(error: unknown): string {
  if (error instanceof HttpError) {
    switch (error.kind) {
      case "timeout":
        return "The source did not respond in time.";
      case "rate_limited":
        return "The source is temporarily limiting requests.";
      case "not_found":
        return "The source has no record for this query.";
      case "server_error":
        return "The source is currently reporting an internal problem.";
      case "network":
        return "The source could not be reached from this server.";
      case "parse_error":
        return "The source returned a response we could not read.";
      default:
        return "The source rejected the request.";
    }
  }
  return "The source could not be reached.";
}
