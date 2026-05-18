const DEFAULT_TIMEOUT_MS = 120_000;

function apiFailureHint(path: string, timeoutMs: number): string {
  if (path === "/api/agents" || path.startsWith("/api/agents/")) {
    return `${path} timed out after ${timeoutMs / 1000}s — rebuild parent (npm run build) and restart Next (npm run dev:all). Roster is served natively by Next, not :9477.`;
  }
  if (path.startsWith("/api/")) {
    return `${path} failed — ensure Next.js is running (npm run dev:all). POST actions may still need ops-server :9477.`;
  }
  return `${path} network error — check npm run dev:all`;
}

/** Optional direct control-plane URL (bypasses Next rewrite when set). */
export function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_LI_AGENT_API_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

export type ApiFetchOptions = RequestInit & { timeoutMs?: number };

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};
  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init?.signal
    ? (() => {
        const outer = init.signal!;
        outer.addEventListener("abort", () => controller.abort(), { once: true });
        return controller.signal;
      })()
    : controller.signal;

  try {
    const res = await fetch(url, { cache: "no-store", ...fetchInit, signal });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `${path} ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(apiFailureHint(path, timeoutMs));
    }
    if (e instanceof TypeError && /fetch/i.test(e.message)) {
      throw new Error(apiFailureHint(path, timeoutMs));
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function apiPost<T>(path: string, body?: unknown, options?: Pick<ApiFetchOptions, "timeoutMs">) {
  return apiFetch<T>(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });
}
