import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";
import {
  pruneTerminalActiveEntries,
  readActiveState,
  updateIssueStatus,
} from "../org-issues/org-issue-coordination.js";
import {
  pruneTerminalTriageEntries,
  readTriageActiveState,
  updateTriageIssueStatus,
} from "../org-issues/org-issue-triage-coordination.js";
import {
  pruneTerminalActiveEntries as prunePrTerminal,
  readActiveState as readPrActive,
  updatePrStatus,
} from "../org-prs/org-pr-coordination.js";
import {
  pruneTerminalActiveEntries as prunePlannerTerminal,
  readActiveState as readPlannerActive,
  updatePlanStatus,
} from "../org-planner/org-planner-coordination.js";
import {
  pruneTerminalActiveEntries as pruneResearchTerminal,
  readActiveState as readResearchActive,
  updateResearchStatus,
} from "../org-research/org-research-coordination.js";
import type { UnblockerAction } from "./org-unblocker-config.js";

const BACKOFF_FILES = ["org-pr-gh-backoff.json", "org-planner-gh-backoff.json"] as const;

function clearExpiredJsonUntil(
  filename: string,
  root: string,
): UnblockerAction | null {
  const path = join(sprintDataDir(root), filename);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { until?: string };
    const untilMs = parsed?.until ? Date.parse(parsed.until) : NaN;
    if (!Number.isFinite(untilMs) || Date.now() < untilMs) return null;
    unlinkSync(path);
    return { kind: "cleared_expired_backoff", detail: filename };
  } catch {
    unlinkSync(path);
    return { kind: "cleared_corrupt_backoff", detail: filename };
  }
}

/** Remove expired GitHub rate-limit backoff files blocking supervisor ticks. */
export function healBackoffFiles(root = agentsPackageRoot()): UnblockerAction[] {
  const actions: UnblockerAction[] = [];
  for (const file of BACKOFF_FILES) {
    const a = clearExpiredJsonUntil(file, root);
    if (a) actions.push(a);
  }
  return actions;
}

/** Drop expired issue skip cooldown entries (keeps active skips). */
export function pruneExpiredIssueSkips(root = agentsPackageRoot()): UnblockerAction[] {
  const path = join(sprintDataDir(root), "org-issue-skip.json");
  if (!existsSync(path)) return [];
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      { until?: string }
    >;
    const now = Date.now();
    let removed = 0;
    const next: typeof state = {};
    for (const [ref, entry] of Object.entries(state)) {
      const untilMs = entry?.until ? Date.parse(entry.until) : NaN;
      if (Number.isFinite(untilMs) && now < untilMs) {
        next[ref] = entry;
      } else {
        removed++;
      }
    }
    if (removed === 0) return [];
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return [{ kind: "pruned_issue_skip", detail: String(removed) }];
  } catch {
    writeFileSync(path, "{}\n", "utf8");
    return [{ kind: "reset_corrupt_issue_skip", detail: path }];
  }
}

function pruneCooldownFile(
  filename: string,
  root: string,
): UnblockerAction | null {
  const path = join(sprintDataDir(root), filename);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      untilByRef?: Record<string, string>;
    };
    const untilByRef = parsed?.untilByRef ?? {};
    const now = Date.now();
    const next: Record<string, string> = {};
    let removed = 0;
    for (const [ref, until] of Object.entries(untilByRef)) {
      const untilMs = Date.parse(until);
      if (Number.isFinite(untilMs) && now < untilMs) next[ref] = until;
      else removed++;
    }
    if (removed === 0) return null;
    writeFileSync(
      path,
      `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), untilByRef: next }, null, 2)}\n`,
      "utf8",
    );
    return { kind: "pruned_cooldown", detail: `${filename}:${removed}` };
  } catch {
    return null;
  }
}

export function pruneExpiredCooldowns(root = agentsPackageRoot()): UnblockerAction[] {
  const actions: UnblockerAction[] = [];
  for (const file of ["org-pr-cooldown.json", "org-issue-triage-cooldown.json", "org-planner-cooldown.json"]) {
    const a = pruneCooldownFile(file, root);
    if (a) actions.push(a);
  }
  return actions;
}

export function pruneTerminalLaneClaims(root = agentsPackageRoot()): UnblockerAction[] {
  const n =
    pruneTerminalActiveEntries(root) +
    pruneTerminalTriageEntries(root) +
    prunePrTerminal(root) +
    prunePlannerTerminal(root) +
    pruneResearchTerminal(root);
  if (n === 0) return [];
  return [{ kind: "pruned_terminal_claims", detail: String(n) }];
}

/** Clear claimed/running rows whose Batch Job no longer exists. */
export function reconcileOrphanedLaneClaims(
  liveJobNames: Set<string>,
  root = agentsPackageRoot(),
): UnblockerAction[] {
  let n = 0;

  const issue = readActiveState(root);
  for (const [ref, entry] of Object.entries(issue.issues)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    if (!entry.jobName || liveJobNames.has(entry.jobName)) continue;
    updateIssueStatus(ref, "failed", "unblocker: job missing", root);
    n++;
  }

  const triage = readTriageActiveState(root);
  for (const [ref, entry] of Object.entries(triage.issues)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    if (!entry.jobName || liveJobNames.has(entry.jobName)) continue;
    updateTriageIssueStatus(ref, "failed", "unblocker: job missing", root);
    n++;
  }

  const pr = readPrActive(root);
  for (const [ref, entry] of Object.entries(pr.prs)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    if (!entry.jobName || liveJobNames.has(entry.jobName)) continue;
    updatePrStatus(ref, "failed", "unblocker: job missing", root);
    n++;
  }

  const planner = readPlannerActive(root);
  for (const [ref, entry] of Object.entries(planner.plans)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    if (!entry.jobName || liveJobNames.has(entry.jobName)) continue;
    updatePlanStatus(ref, "failed", "unblocker: job missing", root);
    n++;
  }

  const research = readResearchActive(root);
  for (const [ref, entry] of Object.entries(research.research)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    if (!entry.jobName || liveJobNames.has(entry.jobName)) continue;
    updateResearchStatus(ref, "failed", "unblocker: job missing", root);
    n++;
  }

  if (n === 0) return [];
  return [{ kind: "reconciled_orphan_claims", detail: String(n) }];
}
