import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import {
  isIssueQueueFresh,
  readIssueQueueMeta,
  readImplementQueueCount,
} from "./org-issue-coordination.js";
import {
  orgIssueClassifyEnabledForRole,
  orgIssueQueueMaxAgeMs,
} from "./org-issue-supervisor-config.js";

export type IssueClassifyRole = "issue" | "triage" | "planner" | "worker";

export function runPython(scriptName: string, args: string[] = []): { ok: boolean; tail: string } {
  const root = agentsPackageRoot();
  const script = join(root, "scripts", scriptName);
  if (!existsSync(script)) return { ok: false, tail: `missing ${script}` };
  const py = process.platform === "win32" ? "python" : "python3";
  const proc = spawnSync(py, [script, ...args], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: 3_600_000,
  });
  const tail = `${proc.stdout ?? ""}${proc.stderr ?? ""}`.trim().slice(-2000);
  return { ok: proc.status === 0, tail };
}

export function resolveIssueOpenCount(root = agentsPackageRoot()): number {
  const meta = readIssueQueueMeta(root);
  if (meta.exists) return meta.totalOpen;
  const countRes = runPython("org-issue-open-count.py");
  const m = /open_issues=(\d+)/.exec(countRes.tail);
  return m ? Number(m[1]) : 0;
}

export interface IssueClassifyRefreshResult {
  ok: boolean;
  tail: string;
  skipped: boolean;
  source: "github" | "queue" | "disabled";
}

export function refreshIssueClassify(
  root = agentsPackageRoot(),
  role: IssueClassifyRole = "issue",
  force = false,
): IssueClassifyRefreshResult {
  if (!orgIssueClassifyEnabledForRole(role)) {
    return { ok: true, tail: `classify disabled for role=${role}`, skipped: true, source: "disabled" };
  }
  if (!force && isIssueQueueFresh(root)) {
    const meta = readIssueQueueMeta(root);
    const ageMs = Date.now() - meta.updatedAtMs;
    return {
      ok: true,
      tail: `issue queue cache hit age_ms=${ageMs} open=${meta.totalOpen} implement=${readImplementQueueCount(root)}`,
      skipped: true,
      source: "queue",
    };
  }
  const maxAgeMin = Math.max(1, Math.ceil(orgIssueQueueMaxAgeMs() / 60_000));
  const result = runPython("org-classify-open-issues.py", ["--max-age-minutes", String(maxAgeMin)]);
  return { ...result, skipped: false, source: "github" };
}
