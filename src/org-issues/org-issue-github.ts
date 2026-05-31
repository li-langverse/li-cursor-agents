import https from "node:https";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  labels: string[];
}

export function ghToken(): string | undefined {
  return process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
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
          resolve({ status: res.statusCode ?? 0, data, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
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
    throw new Error(`GitHub issue fetch failed (${res.status}): ${res.raw.slice(0, 300)}`);
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
