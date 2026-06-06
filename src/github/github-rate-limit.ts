import { setPlannerBackoff } from "../org-planner/org-planner-coordination.js";
import { setPrBackoff } from "../org-prs/org-pr-coordination.js";

export type GitHubResponseHeaders = Record<string, string | string[] | undefined>;

export function isGitHubRateLimitError(message: string): boolean {
  return /rate limit exceeded|secondary rate limit|api rate limit/i.test(message);
}

/** Parse X-RateLimit-Reset (unix seconds) into ISO backoff time with buffer. */
export function rateLimitResetIsoFromHeaders(
  headers: GitHubResponseHeaders,
  nowMs = Date.now(),
): string | null {
  const raw = headers["x-ratelimit-reset"];
  const resetSec = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(resetSec) || resetSec <= 0) return null;
  const untilMs = Math.max(resetSec * 1000 + 5_000, nowMs + 60_000);
  return new Date(untilMs).toISOString();
}

export function rateLimitBackoffUntil(
  errorMessage: string,
  headers?: GitHubResponseHeaders,
  nowMs = Date.now(),
): string {
  const fromHeaders = headers ? rateLimitResetIsoFromHeaders(headers, nowMs) : null;
  if (fromHeaders) return fromHeaders;
  if (isGitHubRateLimitError(errorMessage)) {
    return new Date(nowMs + 3_600_000).toISOString();
  }
  return new Date(nowMs + 900_000).toISOString();
}

export function applyOrgGitHubRateLimitBackoff(
  errorMessage: string,
  headers?: GitHubResponseHeaders,
): string | null {
  if (!isGitHubRateLimitError(errorMessage)) return null;
  const until = rateLimitBackoffUntil(errorMessage, headers);
  setPrBackoff(until, "github_rate_limited");
  setPlannerBackoff(until, "github_rate_limited");
  return until;
}

export interface GitHubCoreRateLimit {
  remaining: number;
  reset: number;
  limit: number;
}

export function parseCoreRateLimit(data: unknown): GitHubCoreRateLimit | null {
  if (!data || typeof data !== "object") return null;
  const resources = (data as { resources?: { core?: unknown } }).resources;
  const core = resources?.core;
  if (!core || typeof core !== "object") return null;
  const row = core as { remaining?: number; reset?: number; limit?: number };
  if (!Number.isFinite(row.remaining) || !Number.isFinite(row.reset)) return null;
  return {
    remaining: row.remaining!,
    reset: row.reset!,
    limit: Number.isFinite(row.limit) ? row.limit! : 5000,
  };
}

/** True when supervisor should defer GitHub-heavy spawns. */
export function shouldDeferForRateLimit(
  core: GitHubCoreRateLimit | null,
  minRemaining = 50,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!core) return false;
  if (core.remaining <= minRemaining) return true;
  if (core.remaining <= 0 && core.reset > nowSec) return true;
  return false;
}

export function backoffIsoFromCoreRateLimit(core: GitHubCoreRateLimit, nowMs = Date.now()): string {
  const untilMs = Math.max(core.reset * 1000 + 5_000, nowMs + 60_000);
  return new Date(untilMs).toISOString();
}
