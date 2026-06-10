import http from "node:http";
import https from "node:https";
import type { GitHubResponseHeaders } from "../github/github-rate-limit.js";
import {
  gitAuthToken,
  gitlabApiHost,
  gitlabApiScheme,
  gitlabGroup,
  gitlabHost,
  vcsProvider,
} from "../repo-workflow/vcs-config.js";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  labels: string[];
}

export type OrgIssue = GitHubIssue;

export function ghToken(): string | undefined {
  return (
    process.env.GH_SWARM_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim()
  );
}

export function orgIssueApiToken(): string | undefined {
  if (vcsProvider() === "github") return ghToken();
  return process.env.GITLAB_TOKEN?.trim() || gitAuthToken();
}

function encodeProject(repo: string): string {
  return encodeURIComponent(`${gitlabGroup()}/${repo}`);
}

function glRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; raw: string; headers: GitHubResponseHeaders }> {
  const token = orgIssueApiToken();
  if (!token) {
    return Promise.resolve({
      status: 401,
      data: null,
      raw: "GITLAB_TOKEN required",
      headers: {},
    });
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const transport = gitlabApiScheme() === "http" ? http : https;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: gitlabApiHost(),
        path: `/api/v4${path}`,
        method,
        headers: {
          "PRIVATE-TOKEN": token,
          "User-Agent": "li-langverse/li-cursor-agents (org-issue)",
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

export type OrgIssueRequestError = GitHubIssueRequestError;

export async function fetchGitHubRateLimitCore(): Promise<{
  remaining: number;
  reset: number;
  limit: number;
} | null> {
  if (vcsProvider() === "gitlab") return null;
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

function normalizeGitLabIssue(
  repo: string,
  number: number,
  issue: {
    iid?: number;
    title?: string;
    description?: string | null;
    state?: string;
    web_url?: string;
    labels?: string[];
  },
): GitHubIssue {
  const state = issue.state === "closed" ? "closed" : "open";
  return {
    number: issue.iid ?? number,
    title: issue.title ?? "",
    body: issue.description ?? null,
    state,
    html_url:
      issue.web_url ??
      `https://${gitlabHost()}/${gitlabGroup()}/${repo}/-/issues/${number}`,
    labels: (issue.labels ?? []).filter(Boolean),
  };
}

async function fetchGitLabIssue(repo: string, number: number): Promise<GitHubIssue> {
  const res = await glRequest<{
    iid?: number;
    title?: string;
    description?: string | null;
    state?: string;
    web_url?: string;
    labels?: string[];
  }>("GET", `/projects/${encodeProject(repo)}/issues/${number}`);

  if (res.status !== 200 || !res.data) {
    throw new GitHubIssueRequestError(
      `GitLab issue fetch failed (${res.status}): ${res.raw.slice(0, 300)}`,
      res.status,
      res.headers,
    );
  }
  return normalizeGitLabIssue(repo, number, res.data);
}

export async function fetchGitHubIssue(
  org: string,
  repo: string,
  number: number,
): Promise<GitHubIssue> {
  if (vcsProvider() === "gitlab") {
    return fetchGitLabIssue(repo, number);
  }
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

export const fetchOrgIssue = fetchGitHubIssue;

export async function postGitHubIssueComment(
  org: string,
  repo: string,
  number: number,
  body: string,
): Promise<{ ok: boolean; status: number }> {
  if (vcsProvider() === "gitlab") {
    const res = await glRequest("POST", `/projects/${encodeProject(repo)}/issues/${number}/notes`, {
      body,
    });
    return { ok: res.status === 200 || res.status === 201, status: res.status };
  }
  const res = await ghRequest("POST", `/repos/${org}/${repo}/issues/${number}/comments`, { body });
  return { ok: res.status === 200 || res.status === 201, status: res.status };
}

export const postOrgIssueComment = postGitHubIssueComment;

/** Add plan-approved (and drop plan-needed) so classify moves issue to implement bucket. */
export async function promoteIssuePlanApproved(
  org: string,
  repo: string,
  number: number,
): Promise<{ ok: boolean; labels: string[] }> {
  if (vcsProvider() === "gitlab") {
    const add = await glRequest(
      "PUT",
      `/projects/${encodeProject(repo)}/issues/${number}?add_labels[]=plan-approved&remove_labels[]=plan-needed`,
    );
    if (add.status !== 200 || !add.data) {
      throw new GitHubIssueRequestError(
        `GitLab add label failed (${add.status}): ${add.raw.slice(0, 300)}`,
        add.status,
        add.headers,
      );
    }
    const after = await fetchGitHubIssue(org, repo, number);
    return { ok: after.labels.includes("plan-approved"), labels: after.labels };
  }
  const add = await ghRequest<Array<{ name?: string }>>(
    "POST",
    `/repos/${org}/${repo}/issues/${number}/labels`,
    { labels: ["plan-approved"] },
  );
  if (add.status !== 200 || !add.data) {
    throw new GitHubIssueRequestError(
      `GitHub add label failed (${add.status}): ${add.raw.slice(0, 300)}`,
      add.status,
      add.headers,
    );
  }
  await ghRequest("DELETE", `/repos/${org}/${repo}/issues/${number}/labels/plan-needed`);
  const after = await fetchGitHubIssue(org, repo, number);
  return { ok: after.labels.includes("plan-approved"), labels: after.labels };
}
