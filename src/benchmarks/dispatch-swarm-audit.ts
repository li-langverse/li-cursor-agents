import { spawnSync } from "node:child_process";

export interface DispatchSwarmAuditResult {
  ok: boolean;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
}

const BENCHMARKS_REPO = "li-langverse/benchmarks";
const EVENT_TYPE = "swarm-audit-refresh";

export function resolveBenchmarksDispatchToken(): string | undefined {
  return (
    process.env.LI_BENCHMARKS_DISPATCH_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    undefined
  );
}

/** Fire `repository_dispatch` on benchmarks for ecosystem audit refresh. */
export function dispatchSwarmAuditRefresh(options?: {
  dryRun?: boolean;
  token?: string;
  ref?: string;
  source?: string;
  runUrl?: string;
}): DispatchSwarmAuditResult {
  const token = options?.token ?? resolveBenchmarksDispatchToken();
  if (!token) {
    return { ok: false, skipped: true, skip_reason: "LI_BENCHMARKS_DISPATCH_TOKEN not set" };
  }

  const ref = options?.ref ?? process.env.GITHUB_SHA?.trim() ?? "main";
  const source = options?.source ?? "li-cursor-agents";
  const runUrl = options?.runUrl ?? "";

  if (options?.dryRun) {
    return { ok: true, skip_reason: `dry-run: would dispatch ${EVENT_TYPE} ref=${ref}` };
  }

  const args = [
    "api",
    `repos/${BENCHMARKS_REPO}/dispatches`,
    "-f",
    `event_type=${EVENT_TYPE}`,
    "-f",
    `client_payload[ref]=${ref}`,
    "-f",
    `client_payload[source]=${source}`,
  ];
  if (runUrl) {
    args.push("-f", `client_payload[run_url]=${runUrl}`);
  }

  const proc = spawnSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
  });
  if (proc.status === 0) {
    return { ok: true };
  }
  const err = (proc.stderr || proc.stdout || "gh api failed").trim();
  return { ok: false, error: err };
}
