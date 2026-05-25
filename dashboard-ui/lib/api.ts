const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_WORKER_URL = "http://127.0.0.1:9477";

function apiFailureHint(path: string, timeoutMs: number, worker = false): string {
  if (worker) {
    return `${path} failed — start the worker: npm run worker or npm run dev:all (http://127.0.0.1:9477)`;
  }
  if (path === "/api/agents" || path.startsWith("/api/agents/")) {
    return `${path} timed out after ${timeoutMs / 1000}s — rebuild parent (npm run build) and restart Next (npm run dev:all).`;
  }
  if (path.startsWith("/api/")) {
    return `${path} failed — ensure Next.js is running (npm run dev:all) and Supabase is up (npm run db:ensure).`;
  }
  return `${path} network error — check npm run dev:all`;
}

/** Same-origin read API (Next.js db-api → Supabase). */
export function readApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_LI_READ_API_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

/** Worker control plane (ops-server :9477). POST/PATCH only. */
export function workerApiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_LI_WORKER_URL?.trim() ??
    process.env.NEXT_PUBLIC_LI_AGENT_API_URL?.trim();
  if (!raw) return DEFAULT_WORKER_URL;
  return raw.replace(/\/$/, "");
}

export type ApiFetchOptions = RequestInit & { timeoutMs?: number };

async function fetchJson<T>(
  url: string,
  path: string,
  init: ApiFetchOptions | undefined,
  worker: boolean,
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init ?? {};
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
      throw new Error(apiFailureHint(path, timeoutMs, worker));
    }
    if (e instanceof TypeError && /fetch/i.test(e.message)) {
      throw new Error(apiFailureHint(path, timeoutMs, worker));
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** GET (and HEAD) — read-only db-api on Next. */
export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${readApiBase()}${p}`;
  return fetchJson<T>(url, path, init, false);
}

/** POST — worker ops-server only. */
export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: Pick<ApiFetchOptions, "timeoutMs">,
): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${workerApiBase()}${p}`;
  return fetchJson<T>(
    url,
    path,
    {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    },
    true,
  );
}

/** PATCH — worker ops-server only. */
export async function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: Pick<ApiFetchOptions, "timeoutMs">,
): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${workerApiBase()}${p}`;
  return fetchJson<T>(
    url,
    path,
    {
      method: "PATCH",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    },
    true,
  );
}

/** @deprecated Use readApiBase / workerApiBase */
export function apiBase(): string {
  return readApiBase();
}
