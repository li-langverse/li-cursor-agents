import type { GitHubResponseHeaders } from "./github-rate-limit.js";
import { isGitHubRateLimitError } from "./github-rate-limit.js";

const TOKEN_ENV_KEYS = [
  "GH_SWARM_TOKEN",
  "GH_SWARM_TOKEN_BACKUP",
  "GH_TOKEN_BACKUP",
  "GH_TOKEN",
  "GITHUB_TOKEN",
] as const;

/** Ordered GitHub PAT candidates (deduped). Primary swarm token first, backup second. */
export function ghTokenCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of TOKEN_ENV_KEYS) {
    const val = process.env[key]?.trim();
    if (!val || seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

export function ghToken(): string | undefined {
  return ghTokenCandidates()[0];
}

export function isGitHubRateLimitResponse(
  status: number,
  raw: string,
): boolean {
  if (status === 429) return true;
  if (status === 403 && isGitHubRateLimitError(raw)) return true;
  return false;
}

/** Pin active token for gh CLI / child processes after failover. */
export function activateGitHubToken(token: string): void {
  if (process.env.GH_SWARM_TOKEN?.trim() === token) return;
  if (process.env.GH_SWARM_TOKEN_BACKUP?.trim() === token) {
    process.env.GH_SWARM_TOKEN = token;
  }
  process.env.GH_TOKEN = token;
  process.env.GITHUB_TOKEN = token;
}

export type GitHubApiResponse<T> = {
  status: number;
  data: T | null;
  raw: string;
  headers: GitHubResponseHeaders;
  tokenUsed?: string;
};

export async function withGitHubTokenFailover<T>(
  request: (token: string) => Promise<GitHubApiResponse<T>>,
): Promise<GitHubApiResponse<T>> {
  const candidates = ghTokenCandidates();
  if (!candidates.length) {
    return { status: 401, data: null, raw: "GH_TOKEN required", headers: {} };
  }

  let last: GitHubApiResponse<T> | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const token = candidates[i]!;
    const res = await request(token);
    res.tokenUsed = token;
    last = res;
    if (!isGitHubRateLimitResponse(res.status, res.raw)) {
      if (i > 0) activateGitHubToken(token);
      return res;
    }
    if (i + 1 < candidates.length) continue;
    return res;
  }
  return last ?? { status: 401, data: null, raw: "GH_TOKEN required", headers: {} };
}
