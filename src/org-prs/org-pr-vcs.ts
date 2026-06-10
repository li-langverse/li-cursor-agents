import http from "node:http";
import https from "node:https";
import { ghToken } from "../org-issues/org-issue-github.js";
import {
  gitlabApiHost,
  gitlabApiScheme,
  gitlabGroup,
  gitlabHost,
  vcsProvider,
  vcsToken,
} from "./vcs-config.js";

export interface OrgPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  draft: boolean;
  mergeable: boolean | null;
  mergeable_state: string | null;
  headSha: string | null;
}

function encodeProject(repo: string): string {
  return encodeURIComponent(`${gitlabGroup()}/${repo}`);
}

function glRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; raw: string }> {
  const token = vcsToken();
  if (!token) {
    return Promise.resolve({ status: 401, data: null, raw: "GITLAB_TOKEN required" });
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
          "User-Agent": "li-langverse/li-cursor-agents (org-pr-supervisor)",
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
          resolve({ status: res.statusCode ?? 0, data, raw });
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
): Promise<{ status: number; data: T | null; raw: string }> {
  const token = ghToken();
  if (!token) {
    return Promise.resolve({ status: 401, data: null, raw: "GH_TOKEN required" });
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
          "User-Agent": "li-langverse/li-cursor-agents (org-pr-supervisor)",
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
          resolve({ status: res.statusCode ?? 0, data, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function gitlabMergeableState(mr: {
  has_conflicts?: boolean;
  merge_status?: string;
}): { mergeable: boolean | null; mergeable_state: string } {
  if (mr.has_conflicts) return { mergeable: false, mergeable_state: "dirty" };
  if (mr.merge_status === "can_be_merged") return { mergeable: true, mergeable_state: "clean" };
  if (mr.merge_status === "cannot_be_merged") return { mergeable: false, mergeable_state: "blocked" };
  return { mergeable: null, mergeable_state: mr.merge_status ?? "unknown" };
}

async function fetchGitLabMergeRequest(
  repo: string,
  number: number,
): Promise<OrgPullRequest> {
  const res = await glRequest<{
    iid?: number;
    title?: string;
    description?: string | null;
    state?: string;
    web_url?: string;
    draft?: boolean;
    work_in_progress?: boolean;
    has_conflicts?: boolean;
    merge_status?: string;
    sha?: string;
  }>("GET", `/projects/${encodeProject(repo)}/merge_requests/${number}`);

  if (res.status !== 200 || !res.data) {
    throw new Error(`GitLab MR fetch failed (${res.status}): ${res.raw.slice(0, 300)}`);
  }
  const d = res.data;
  const { mergeable, mergeable_state } = gitlabMergeableState(d);
  const state = d.state === "opened" ? "open" : "closed";
  return {
    number: d.iid ?? number,
    title: d.title ?? "",
    body: d.description ?? null,
    state,
    html_url:
      d.web_url ??
      `https://${gitlabHost()}/${gitlabGroup()}/${repo}/-/merge_requests/${number}`,
    draft: Boolean(d.draft || d.work_in_progress),
    mergeable,
    mergeable_state,
    headSha: d.sha?.slice(0, 7) ?? null,
  };
}

async function fetchGitHubPullRequestInternal(
  org: string,
  repo: string,
  number: number,
): Promise<OrgPullRequest> {
  const res = await ghRequest<{
    number?: number;
    title?: string;
    body?: string | null;
    state?: string;
    html_url?: string;
    draft?: boolean;
    mergeable?: boolean | null;
    mergeable_state?: string | null;
    head?: { sha?: string };
  }>("GET", `/repos/${org}/${repo}/pulls/${number}`);

  if (res.status !== 200 || !res.data) {
    throw new Error(`GitHub PR fetch failed (${res.status}): ${res.raw.slice(0, 300)}`);
  }
  const d = res.data;
  return {
    number: d.number ?? number,
    title: d.title ?? "",
    body: d.body ?? null,
    state: d.state === "closed" ? "closed" : "open",
    html_url: d.html_url ?? `https://github.com/${org}/${repo}/pull/${number}`,
    draft: Boolean(d.draft),
    mergeable: d.mergeable ?? null,
    mergeable_state: d.mergeable_state ?? null,
    headSha: d.head?.sha?.slice(0, 7) ?? null,
  };
}

export async function fetchOrgPullRequest(
  org: string,
  repo: string,
  number: number,
): Promise<OrgPullRequest> {
  if (vcsProvider() === "gitlab") {
    return fetchGitLabMergeRequest(repo, number);
  }
  return fetchGitHubPullRequestInternal(org, repo, number);
}

export async function postOrgPrComment(
  org: string,
  repo: string,
  number: number,
  body: string,
): Promise<void> {
  if (vcsProvider() === "gitlab") {
    const res = await glRequest(
      "POST",
      `/projects/${encodeProject(repo)}/merge_requests/${number}/notes`,
      { body },
    );
    if (res.status !== 201) {
      throw new Error(`GitLab MR comment failed (${res.status}): ${res.raw.slice(0, 300)}`);
    }
    return;
  }
  const res = await ghRequest("POST", `/repos/${org}/${repo}/issues/${number}/comments`, { body });
  if (res.status !== 201) {
    throw new Error(`GitHub PR comment failed (${res.status}): ${res.raw.slice(0, 300)}`);
  }
}

