/**
 * Minimal test harness.
 *
 * Node's built-in test runner would need a loader for the `@/` alias and for
 * `server-only`; this keeps the suite dependency-free and runnable with
 * `npm test`. Assertions are explicit and failures are collected per-file so
 * one broken category cannot hide the state of the others.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  pending.push({ name, fn });
}

const pending: { name: string; fn: () => void | Promise<void> }[] = [];

let resetHook: (() => void) | undefined;

/** Registers a hook run before every test, e.g. to clear the provider cache. */
export function setReset(fn: () => void): void {
  resetHook = fn;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(`${message ?? "values differ"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertIncludes(haystack: string, needle: string, message?: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message ?? "missing substring"}: ${JSON.stringify(needle)} not found in ${JSON.stringify(haystack.slice(0, 300))}`);
  }
}

export async function run(): Promise<void> {
  for (const { name, fn } of pending) {
    try {
      resetHook?.();
      await fn();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function report(section: string): { passed: number; failed: number } {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${section}`);
  for (const result of results) {
    console.log(`  ${result.passed ? "PASS" : "FAIL"}  ${result.name}`);
    if (!result.passed) console.log(`        ${result.error}`);
  }
  console.log(`  ${passed}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
  return { passed, failed: failed.length };
}

/** Builds a fake fetch that answers from a URL→response table. */
export function fixtureFetch(
  table: Record<string, unknown>,
  options: { status?: number } = {},
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const key = Object.keys(table).find((candidate) => url.includes(candidate));
    if (key === undefined) {
      return new Response("not found", { status: 404 });
    }
    const body = table[key];
    if (body instanceof Uint8Array) {
      return new Response(body as unknown as BodyInit, { status: options.status ?? 200 });
    }
    if (typeof body === "string") {
      // Raw text feeds (e.g. DWD's JS-wrapped JSON) are served verbatim.
      return new Response(body, {
        status: options.status ?? 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response(JSON.stringify(body), {
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/** A fetch that always fails, to exercise the unavailable paths. */
export function failingFetch(): typeof fetch {
  return (async () => {
    throw new Error("simulated network failure");
  }) as typeof fetch;
}

/** A fetch that always returns 429, to exercise rate-limit handling. */
export function rateLimitedFetch(): typeof fetch {
  return (async () => new Response("too many requests", { status: 429, headers: { "retry-after": "1" } })) as typeof fetch;
}
