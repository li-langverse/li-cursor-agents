import https from "node:https";
import type { GitHubResponseHeaders } from "../github/github-rate-limit.js";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  labels: string[];
}

export function ghToken(): string | undefined {
  return (
    process.env.GH_SWARM_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim()
  );
}

function ghRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; raw: string; headers: GitHubResponseHeaders }> {
  const token = ghToken();
  if (!token) {
    return Promise.resolve({ status: 401, data: null, raw: "GH_TOKEN required", headers: {} });
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "li-langverse/li-cursor-agents (org-issue-implementer)",
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let data: T | null = null;
          if (raw) {
            try {
              data = JSON.parse(raw) as T;
            } catch {
              data = null;
            }
          }
          resolve({ status: res.statusCode ?? 0, data, raw, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export class GitHubIssueRequestError extends Error {
  readonly status: number;
  readonly headers: GitHubResponseHeaders;

  constructor(message: string, status: number, headers: GitHubResponseHeaders) {
    super(message);
    this.name = "GitHubIssueRequestError";
    this.status = status;
    this.headers = headers;
  }
}

export async function fetchGitHubRateLimitCore(): Promise<{
  remaining: number;
  reset: number;
  limit: number;
} | null> {
  const res = await ghRequest<{
    resources?: { core?: { remaining?: number; reset?: number; limit?: number } };
  }>("GET", "/rate_limit");
  if (res.status !== 200 || !res.data?.resources?.core) return null;
  const core = res.data.resources.core;
  if (!Number.isFinite(core.remaining) || !Number.isFinite(core.reset)) return null;
  return {
    remaining: core.remaining!,
    reset: core.reset!,
    limit: Number.isFinite(core.limit) ? core.limit! : 5000,
  };
}

export async function fetchGitHubIssue(
  org: string,
  repo: string,
  number: number,
): Promise<GitHubIssue> {
  const res = await ghRequest<{
    number?: number;
    title?: string;
    body?: string | null;
    state?: string;
    html_url?: string;
    labels?: Array<{ name?: string }>;
  }>("GET", `/repos/${org}/${repo}/issues/${number}`);

  if (res.status !== 200 || !res.data) {
    throw new GitHubIssueRequestError(
      `GitHub issue fetch failed (${res.status}): ${res.raw.slice(0, 300)}`,
      res.status,
      res.headers,
    );
  }

  const issue = res.data;
  return {
    number: issue.number ?? number,
    title: issue.title ?? "",
    body: issue.body ?? null,
    state: issue.state === "closed" ? "closed" : "open",
    html_url: issue.html_url ?? `https://github.com/${org}/${repo}/issues/${number}`,
    labels: (issue.labels ?? []).map((l) => l.name ?? "").filter(Boolean),
  };
}

export async function postGitHubIssueComment(
  org: string,
  repo: string,
  number: number,
  body: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await ghRequest("POST", `/repos/${org}/${repo}/issues/${number}/comments`, { body });
  return { ok: res.status === 200 || res.status === 201, status: res.status };
}
