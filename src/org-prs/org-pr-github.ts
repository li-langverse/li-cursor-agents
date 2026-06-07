import { ghRequest as orgGhRequest, ghToken } from "../org-issues/org-issue-github.js";

export interface GitHubPullRequest {
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

async function ghRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; raw: string }> {
  const res = await orgGhRequest<T>(method, path, body);
  return { status: res.status, data: res.data, raw: res.raw };
}

export async function fetchGitHubPullRequest(
  org: string,
  repo: string,
  number: number,
): Promise<GitHubPullRequest> {
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
    headSha: d.head?.sha ?? null,
  };
}

export async function postGitHubPrComment(
  org: string,
  repo: string,
  number: number,
  body: string,
): Promise<void> {
  const res = await ghRequest("POST", `/repos/${org}/${repo}/issues/${number}/comments`, { body });
  if (res.status !== 201) {
    throw new Error(`GitHub PR comment failed (${res.status}): ${res.raw.slice(0, 300)}`);
  }
}
