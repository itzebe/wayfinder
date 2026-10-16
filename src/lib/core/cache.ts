/**
 * TTL cache that never destroys the last good value.
 *
 * When a refresh fails we keep serving the previous payload and report it as
 * stale rather than showing an empty screen or pretending the data is current.
 * In-flight requests for the same key are de-duplicated so concurrent callers
 * cannot amplify load on a rate-limited provider.
 */

export type Freshness = "live" | "cached" | "stale";

export interface CacheRecord<T> {
  value: T;
  /** When the value was successfully retrieved from upstream. */
  storedAt: number;
  /** When the value stops being considered fresh. */
  expiresAt: number;
  etag?: string;
  lastModified?: string;
  /** Populated when the most recent refresh attempt failed. */
  lastError?: string;
}

export interface CacheRead<T> {
  value: T;
  freshness: Freshness;
  storedAt: string;
  ageMs: number;
  lastError?: string;
}

interface CacheOptions {
  ttlMs: number;
  maxEntries?: number;
}

/** How long a stale value may still be served after it expires. */
const STALE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

const store = new Map<string, CacheRecord<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function evictIfNeeded(maxEntries: number) {
  if (store.size <= maxEntries) return;
  const ordered = [...store.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (const [key] of ordered.slice(0, store.size - maxEntries)) {
    store.delete(key);
  }
}

export function readCache<T>(key: string): CacheRead<T> | undefined {
  const record = store.get(key) as CacheRecord<T> | undefined;
  if (!record) return undefined;

  const now = Date.now();
  if (now > record.expiresAt) {
    if (now - record.expiresAt > STALE_TTL_MS) {
      store.delete(key);
      return undefined;
    }
    return {
      value: record.value,
      freshness: "stale",
      storedAt: new Date(record.storedAt).toISOString(),
      ageMs: now - record.storedAt,
      lastError: record.lastError,
    };
  }

  return {
    value: record.value,
    freshness: now - record.storedAt < 1_000 ? "live" : "cached",
    storedAt: new Date(record.storedAt).toISOString(),
    ageMs: now - record.storedAt,
    lastError: record.lastError,
  };
}

export function writeCache<T>(
  key: string,
  value: T,
  options: { ttlMs: number; etag?: string; lastModified?: string; maxEntries?: number },
): void {
  const now = Date.now();
  store.set(key, {
    value,
    storedAt: now,
    expiresAt: now + options.ttlMs,
    etag: options.etag,
    lastModified: options.lastModified,
  });
  evictIfNeeded(options.maxEntries ?? DEFAULT_MAX_ENTRIES);
}

/** Records a failed refresh without discarding the last good value. */
export function markCacheError(key: string, message: string): void {
  const record = store.get(key);
  if (!record) return;
  record.lastError = message;
  // Keep the stale value servable so the UI can warn instead of going blank.
  record.expiresAt = Math.max(record.expiresAt, Date.now() + 60_000);
}

export function cacheMetadata(key: string): { etag?: string; lastModified?: string } {
  const record = store.get(key);
  return { etag: record?.etag, lastModified: record?.lastModified };
}

export interface CachedFetchOutcome<T> {
  value: T;
  freshness: Freshness;
  storedAt: string;
  /** True when this call actually hit the network. */
  refreshed: boolean;
  /** True when a refresh was attempted but failed. */
  refreshFailed: boolean;
  error?: string;
  /** True when upstream replied 304 and we reused the stored payload. */
  revalidated: boolean;
}

/**
 * Cache-aside fetch. Serves a fresh value without touching the network, and on
 * failure degrades to the last good value instead of throwing.
 */
export async function cachedFetch<T>(
  key: string,
  loader: (revalidation: { etag?: string; lastModified?: string }) => Promise<{
    data: T;
    retrievedAt: string;
    notModified: boolean;
    etag?: string;
    lastModified?: string;
  }>,
  options: CacheOptions,
): Promise<CachedFetchOutcome<T>> {
  const existing = readCache<T>(key);
  if (existing && existing.freshness !== "stale") {
    return {
      value: existing.value,
      freshness: existing.freshness,
      storedAt: existing.storedAt,
      refreshed: false,
      refreshFailed: false,
      revalidated: false,
    };
  }

  const pending = inflight.get(key) as Promise<CachedFetchOutcome<T>> | undefined;
  if (pending) return pending;

  const task = (async (): Promise<CachedFetchOutcome<T>> => {
    const meta = cacheMetadata(key);
    try {
      const result = await loader({ etag: meta.etag, lastModified: meta.lastModified });

      if (result.notModified) {
        if (!existing) throw new Error("Upstream returned 304 with no cached value");
        // Upstream confirmed our copy is current: extend its freshness window.
        writeCache(key, existing.value, {
          ttlMs: options.ttlMs,
          etag: meta.etag,
          lastModified: meta.lastModified,
        });
        return {
          value: existing.value,
          freshness: "live",
          storedAt: new Date().toISOString(),
          refreshed: true,
          refreshFailed: false,
          revalidated: true,
        };
      }

      writeCache(key, result.data, {
        ttlMs: options.ttlMs,
        etag: result.etag,
        lastModified: result.lastModified,
      });
      return {
        value: result.data,
        freshness: "live",
        storedAt: result.retrievedAt,
        refreshed: true,
        refreshFailed: false,
        revalidated: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markCacheError(key, message);

      const fallback = readCache<T>(key);
      if (fallback) {
        return {
          value: fallback.value,
          freshness: "stale",
          storedAt: fallback.storedAt,
          refreshed: false,
          refreshFailed: true,
          error: message,
          revalidated: false,
        };
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export function clearCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheStats(): { entries: number; inflight: number } {
  return { entries: store.size, inflight: inflight.size };
}
