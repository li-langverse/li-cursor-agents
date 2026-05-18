/**
 * Shared helpers for dev:all readiness (tested by dev-stack-ready-lib.test.mjs).
 */

export function createFetchJson(base, { defaultTimeoutMs = 12_000 } = {}) {
  return async function fetchJson(path, init = {}) {
    const timeoutMs = init.timeoutMs ?? defaultTimeoutMs;
    const { timeoutMs: _drop, signal: outerSignal, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (outerSignal) {
      outerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const res = await fetch(`${base}${path}`, {
        cache: "no-store",
        signal: controller.signal,
        ...rest,
      });
      const text = await res.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { _raw: text.slice(0, 200) };
      }
      return { status: res.status, body };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`${path} timed out after ${timeoutMs / 1000}s`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Retry transient socket resets while the ops server is still starting lanes. */
export async function fetchJsonRetry(fetchJson, path, init, options = {}) {
  const attempts = options.attempts ?? 24;
  const delayMs = options.delayMs ?? 500;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(path, init);
    } catch (e) {
      lastErr = e;
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export function agentsRosterOk(body) {
  return Number(body?.total) > 0 || (Array.isArray(body?.roster) && body.roster.length > 0);
}

export function runtimeSwarmOn(body) {
  return Boolean(body?.async_swarm_running);
}
