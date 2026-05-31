import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  orgIssueWorkerCloseLimit,
  orgIssueWorkerDeferredBySprintRole,
  orgIssueWorkerEnabled,
} from "./org-issue-worker-config.js";
import { agentsPackageRoot } from "../runner.js";

function hasGhToken(): boolean {
  return Boolean(process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim());
}

function scriptPath(workspaceRoot: string, name: string): string {
  const inRoot = join(workspaceRoot, "scripts", name);
  if (existsSync(inRoot)) return inRoot;
  return join(agentsPackageRoot(), "scripts", name);
}

function runPython(
  workspaceRoot: string,
  scriptName: string,
  args: string[],
  timeoutMs = 3_600_000,
): { ok: boolean; code: number | null; tail: string } {
  const script = scriptPath(workspaceRoot, scriptName);
  if (!existsSync(script)) {
    return { ok: false, code: 1, tail: `missing ${script}` };
  }
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script, ...args], {
    cwd: workspaceRoot,
    env: process.env,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-2000);
  return { ok: proc.status === 0, code: proc.status, tail };
}

function parseOpenCount(tail: string): number | null {
  const m = /open_issues=(\d+)/.exec(tail);
  return m ? Number(m[1]) : null;
}

function readQueueReport(workspaceRoot: string): Record<string, number> {
  const path = join(workspaceRoot, "data", "goal-directed-sprints", "org-issue-queue.json");
  if (!existsSync(path)) return {};
  const q = JSON.parse(readFileSync(path, "utf8")) as { report?: Record<string, number> };
  return q.report ?? {};
}

export interface OrgIssueWorkerCycleResult {
  ok: boolean;
  skipped: boolean;
  skip_reason?: string;
  workspace_root?: string;
  open_before?: number;
  open_after?: number;
  closed?: number;
  message?: string;
}

/** One org-issue-zero pass: classify + auditable closes from queue. */
export async function orgIssueWorkerCycle(): Promise<OrgIssueWorkerCycleResult> {
  if (!orgIssueWorkerEnabled()) {
    const defer = orgIssueWorkerDeferredBySprintRole();
    if (defer) {
      return {
        ok: true,
        skipped: true,
        skip_reason: `deferred to ORG_PR_SPRINT_ROLE=${defer}`,
      };
    }
    return {
      ok: true,
      skipped: true,
      skip_reason: "LI_ORG_ISSUE_WORKER_ALWAYS_ON not set",
    };
  }
  if (!hasGhToken()) {
    return { ok: false, skipped: true, skip_reason: "GH_TOKEN required" };
  }

  const workspaceRoot = agentsPackageRoot();
  workerConsole("org-issue-worker", "info", `cycle start workspace=${workspaceRoot}`);

  const before = runPython(workspaceRoot, "org-issue-open-count.py", []);
  const openBefore = parseOpenCount(before.tail);

  const classify = runPython(workspaceRoot, "org-classify-open-issues.py", []);
  if (!classify.ok) {
    return {
      ok: false,
      skipped: false,
      workspace_root: workspaceRoot,
      open_before: openBefore ?? undefined,
      message: classify.tail,
    };
  }

  const report = readQueueReport(workspaceRoot);
  const closeLimit = orgIssueWorkerCloseLimit();
  let closed = 0;
  let closeTail = "close_limit=0";
  if (closeLimit > 0) {
    const close = runPython(workspaceRoot, "org-close-issue.py", [
      "--from-queue",
      "--limit",
      String(closeLimit),
    ]);
    closeTail = close.tail;
    const m = /org-close-issue: (\d+) issues/.exec(close.tail);
    closed = m ? Number(m[1]) : 0;
    if (!close.ok) {
      return {
        ok: false,
        skipped: false,
        workspace_root: workspaceRoot,
        open_before: openBefore ?? undefined,
        message: closeTail,
      };
    }
  }

  const after = runPython(workspaceRoot, "org-issue-open-count.py", []);
  const openAfter = parseOpenCount(after.tail);

  const msg = [
    openBefore != null ? `open ${openBefore}→${openAfter ?? "?"}` : "",
    `queue close_done=${report.close_done ?? 0} implement=${report.implement ?? 0}`,
    `closed_this_cycle=${closed}`,
    closeTail,
  ]
    .filter(Boolean)
    .join(" | ");

  workerConsole("org-issue-worker", "info", msg);
  agentLog("org-issue-worker", "info", msg);

  return {
    ok: true,
    skipped: false,
    workspace_root: workspaceRoot,
    open_before: openBefore ?? undefined,
    open_after: openAfter ?? undefined,
    closed,
    message: msg,
  };
}
