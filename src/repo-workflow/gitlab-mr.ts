import { spawnSync } from "node:child_process";
import https from "node:https";
import { gitlabGroup, gitlabHost, gitAuthToken } from "./vcs-config.js";

function encodeProject(repo: string): string {
  return encodeURIComponent(`${gitlabGroup()}/${repo}`);
}

function glRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T | null; raw: string }> {
  const token = gitAuthToken();
  if (!token) {
    return Promise.resolve({ status: 401, data: null, raw: "GITLAB_TOKEN required" });
  }
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: gitlabHost(),
        path: `/api/v4${path}`,
        method,
        headers: {
          "PRIVATE-TOKEN": token,
          "User-Agent": "li-langverse/li-cursor-agents (repo-workflow)",
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

export async function defaultBranchForRepo(repo: string): Promise<string> {
  const { status, data } = await glRequest<{ default_branch?: string }>(
    "GET",
    `/projects/${encodeProject(repo)}`,
  );
  if (status === 200 && data?.default_branch) return data.default_branch;
  return "main";
}

function parseMrResponse(
  status: number,
  data: { web_url?: string; iid?: number; message?: string } | null,
  raw: string,
): { ok: boolean; url?: string; number?: number; error?: string } {
  if (status === 201 && data?.web_url) {
    return { ok: true, url: data.web_url, number: data.iid };
  }
  return {
    ok: false,
    error:
      (data?.message && String(data.message)) || raw || `GitLab MR create failed (${status})`,
  };
}

/** Blocking MR create for post-hook (background runners). */
export function openGitLabMergeRequestSync(options: {
  repo: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}): { ok: boolean; url?: string; number?: number; error?: string } {
  const token = gitAuthToken();
  if (!token) return { ok: false, error: "GITLAB_TOKEN required" };

  const payload = JSON.stringify({
    source_branch: options.sourceBranch,
    target_branch: options.targetBranch,
    title: options.title,
    description: options.description,
    remove_source_branch: false,
  });
  const path = `/api/v4/projects/${encodeProject(options.repo)}/merge_requests`;
  const proc = spawnSync(
    "curl",
    [
      "-sf",
      "-w",
      "\n%{http_code}",
      "-X",
      "POST",
      "-H",
      `PRIVATE-TOKEN: ${token}`,
      "-H",
      "Content-Type: application/json",
      "-d",
      payload,
      `https://${gitlabHost()}${path}`,
    ],
    { encoding: "utf8" },
  );
  if (proc.status !== 0) {
    return { ok: false, error: (proc.stderr || proc.stdout || "curl failed").trim() };
  }
  const lines = (proc.stdout || "").trim().split("\n");
  const statusCode = Number(lines.pop() || "0");
  const raw = lines.join("\n");
  let data: { web_url?: string; iid?: number; message?: string } | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as { web_url?: string; iid?: number; message?: string };
    } catch {
      data = null;
    }
  }
  const created = parseMrResponse(statusCode, data, raw);
  if (created.ok) return created;

  if (statusCode === 409 || data?.message?.includes("already exists")) {
    const listProc = spawnSync(
      "curl",
      [
        "-sf",
        "-H",
        `PRIVATE-TOKEN: ${token}`,
        `https://${gitlabHost()}/api/v4/projects/${encodeProject(options.repo)}/merge_requests?state=opened&source_branch=${encodeURIComponent(options.sourceBranch)}&per_page=5`,
      ],
      { encoding: "utf8" },
    );
    if (listProc.status === 0 && listProc.stdout) {
      try {
        const items = JSON.parse(listProc.stdout) as Array<{ web_url?: string; iid?: number }>;
        const existing = items[0];
        if (existing?.web_url) {
          return { ok: true, url: existing.web_url, number: existing.iid };
        }
      } catch {
        /* fall through */
      }
    }
  }
  return created;
}

export async function openGitLabMergeRequest(options: {
  repo: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}): Promise<{ ok: boolean; url?: string; number?: number; error?: string }> {
  const { status, data, raw } = await glRequest<{ web_url?: string; iid?: number; message?: string }>(
    "POST",
    `/projects/${encodeProject(options.repo)}/merge_requests`,
    {
      source_branch: options.sourceBranch,
      target_branch: options.targetBranch,
      title: options.title,
      description: options.description,
      remove_source_branch: false,
    },
  );
  const created = parseMrResponse(status, data, raw);
  if (created.ok) return created;
  if (status === 409 || data?.message?.includes("already exists")) {
    const list = await glRequest<Array<{ web_url?: string; iid?: number }>>(
      "GET",
      `/projects/${encodeProject(options.repo)}/merge_requests?state=opened&source_branch=${encodeURIComponent(options.sourceBranch)}&per_page=5`,
    );
    const existing = list.data?.[0];
    if (existing?.web_url) {
      return { ok: true, url: existing.web_url, number: existing.iid };
    }
  }
  return created;
}
