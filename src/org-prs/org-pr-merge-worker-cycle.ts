import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { agentLog } from "../agent-log.js";
import { workerConsole } from "../worker/worker-console.js";
import { agentsPackageRoot } from "../runner.js";
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";
import {
  getPrBackoff,
  mergeQueuePath,
  readGreenQueuePrs,
  removeClosedPrFromQueue,
} from "./org-pr-coordination.js";
import { runPython } from "./org-pr-supervisor-shared.js";
import {
  orgPrMergeWorkerEnabled,
  orgPrMergeWorkerLimit,
} from "./org-pr-merge-worker-config.js";

const MERGE_AUDIT = "org-pr-merge-audit.jsonl";

function hasGhToken(): boolean {
  return Boolean(process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim());
}

function appendMergeAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  const path = `${sprintDataDir(root)}/${MERGE_AUDIT}`;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, "utf8");
}

function parseMergedFromTail(tail: string): Array<{ repo: string; number: number; sha: string }> {
  const out: Array<{ repo: string; number: number; sha: string }> = [];
  for (const m of tail.matchAll(/MERGE ([^\s#]+)#(\d+) -> (\S+)/g)) {
    const sha = m[3];
    if (/^\d+:/.test(sha)) continue;
    out.push({ repo: m[1], number: Number(m[2]), sha });
  }
  return out;
}

export interface OrgPrMergeWorkerCycleResult {
  ok: boolean;
  skipped: boolean;
  skip_reason?: string;
  green_candidates?: number;
  merged?: number;
  message?: string;
}

/** Squash-merge green PRs from PVC queue via org-merge-from-queue.py (REST only). */
export async function orgPrMergeWorkerCycle(): Promise<OrgPrMergeWorkerCycleResult> {
  if (!orgPrMergeWorkerEnabled()) {
    return { ok: true, skipped: true, skip_reason: "LI_ORG_PR_MERGE_WORKER_ALWAYS_ON not set" };
  }
  if (!hasGhToken()) {
    return { ok: false, skipped: true, skip_reason: "GH_TOKEN required" };
  }

  const root = agentsPackageRoot();
  const backoff = getPrBackoff(root);
  const untilMs = backoff?.until ? Date.parse(backoff.until) : NaN;
  if (Number.isFinite(untilMs) && Date.now() < untilMs) {
    return {
      ok: true,
      skipped: true,
      skip_reason: `GitHub rate limit backoff until ${backoff!.until}`,
    };
  }

  const green = readGreenQueuePrs(root);
  const limit = orgPrMergeWorkerLimit();
  workerConsole("org-pr-merge-worker", "info", `cycle start green=${green.length} limit=${limit}`);

  if (green.length === 0) {
    return { ok: true, skipped: true, skip_reason: "no green PRs in queue", green_candidates: 0, merged: 0 };
  }
  if (limit === 0) {
    return { ok: true, skipped: true, skip_reason: "merge limit=0", green_candidates: green.length, merged: 0 };
  }

  const queuePath = mergeQueuePath(root);
  if (!existsSync(queuePath)) {
    return { ok: false, skipped: true, skip_reason: `missing ${queuePath}` };
  }

  const merge = runPython("org-merge-from-queue.py", [
    "--queue",
    queuePath,
    "--merge-green",
    "--limit",
    String(limit),
  ]);

  const mergedMatch = /merged=(\d+)/.exec(merge.tail);
  const merged = mergedMatch ? Number(mergedMatch[1]) : 0;
  const mergedRows = parseMergedFromTail(merge.tail);
  for (const row of mergedRows) {
    removeClosedPrFromQueue(row.repo, row.number, root);
    appendMergeAudit({ repo: row.repo, number: row.number, sha: row.sha, ok: true });
  }

  const msg = `green=${green.length} merged=${merged}${mergedRows.length ? ` (${mergedRows.map((r) => `${r.repo}#${r.number}`).join(", ")})` : ""}`;
  workerConsole("org-pr-merge-worker", merge.ok ? "info" : "ERROR", msg);
  agentLog("org-pr-merge-worker", merge.ok ? "info" : "ERROR", `${msg} | ${merge.tail.slice(-400)}`);

  return {
    ok: merge.ok,
    skipped: false,
    green_candidates: green.length,
    merged,
    message: merge.ok ? msg : merge.tail.slice(-500),
  };
}
