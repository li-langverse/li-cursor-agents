import https from "node:https";
import { ghToken } from "../org-issues/org-issue-github.js";

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
