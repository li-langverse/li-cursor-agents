import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { implementAuditPath, sprintDataDir } from "./org-issue-coordination.js";
import { issueRef } from "./org-issue-supervisor-config.js";

const SKIP_FILE = "org-issue-skip.json";

export interface IssueSkipEntry {
  until: string;
  reason: string;
  failures: number;
}

export type IssueSkipState = Record<string, IssueSkipEntry>;

function skipPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), SKIP_FILE);
}

export function maxFailuresBeforeDemote(): number {
  const n = Number(process.env.LI_ORG_ISSUE_MAX_FAILURES ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
}

export function skipCooldownHours(): number {
  const n = Number(process.env.LI_ORG_ISSUE_SKIP_HOURS ?? 24);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 168) : 24;
}

export function readSkipState(root = agentsPackageRoot()): IssueSkipState {
  const path = skipPath(root);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as IssueSkipState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSkipState(state: IssueSkipState, root = agentsPackageRoot()): void {
  writeFileSync(skipPath(root), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isIssueSkipped(ref: string, root = agentsPackageRoot()): boolean {
  const entry = readSkipState(root)[ref];
  if (!entry?.until) return false;
  return Date.now() < Date.parse(entry.until);
}

export function countRecentFailures(
  ref: string,
  root = agentsPackageRoot(),
  maxLines = 500,
): number {
  const path = implementAuditPath(root);
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, "utf8").trim().split("\n").slice(-maxLines);
  let n = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { issueRef?: string; status?: string };
      if (row.issueRef === ref && row.status === "failed") n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}

export function setIssueSkip(
  ref: string,
  reason: string,
  failures: number,
  root = agentsPackageRoot(),
): void {
  const state = readSkipState(root);
  const until = new Date(Date.now() + skipCooldownHours() * 3_600_000).toISOString();
  state[ref] = { until, reason, failures };
  writeSkipState(state, root);
}

/** Move issue from implement bucket to route_planner after repeated failures. */
export function demoteIssueFromImplement(
  repo: string,
  number: number,
  note: string,
  root = agentsPackageRoot(),
): boolean {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return false;
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const implement = q.implement;
  if (!Array.isArray(implement)) return false;

  let row: Record<string, unknown> | undefined;
  const rest = implement.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const r = item as { repo?: string; number?: number };
    if (r.repo === repo && Number(r.number) === number) {
      row = { ...r, classification_note: note };
      return false;
    }
    return true;
  });
  if (!row) return false;

  q.implement = rest;
  const planners = Array.isArray(q.route_planner) ? (q.route_planner as unknown[]) : [];
  planners.push(row);
  q.route_planner = planners;

  const report = q.report;
  if (report && typeof report === "object" && !Array.isArray(report)) {
    const r = report as { implement?: number; route_planner?: number };
    if (typeof r.implement === "number" && r.implement > 0) r.implement -= 1;
    r.route_planner = (r.route_planner ?? 0) + 1;
  }

  writeFileSync(path, `${JSON.stringify(q, null, 2)}\n`, "utf8");
  return true;
}

export interface IssueFailurePolicyResult {
  demoted: string[];
  skipped: string[];
}

/** Apply backoff / demotion for issues that failed too many times. */
export function applyIssueFailurePolicy(root = agentsPackageRoot()): IssueFailurePolicyResult {
  const demoted: string[] = [];
  const skipped: string[] = [];
  const path = implementAuditPath(root);
  if (!existsSync(path)) return { demoted, skipped };

  const lines = readFileSync(path, "utf8").trim().split("\n").slice(-500);
  const failCounts = new Map<string, number>();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { issueRef?: string; status?: string };
      if (row.issueRef && row.status === "failed") {
        failCounts.set(row.issueRef, (failCounts.get(row.issueRef) ?? 0) + 1);
      }
    } catch {
      /* ignore */
    }
  }

  const max = maxFailuresBeforeDemote();
  for (const [ref, count] of failCounts) {
    if (count < max) continue;
    if (isIssueSkipped(ref, root)) {
      skipped.push(ref);
      continue;
    }
    const m = /^[^/]+\/([^#]+)#(\d+)$/.exec(ref);
    if (!m) continue;
    const repo = m[1];
    const number = Number(m[2]);
    const note = `${count} implement failures — demoted to route_planner (retry after ${skipCooldownHours()}h)`;
    if (demoteIssueFromImplement(repo, number, note, root)) {
      demoted.push(ref);
      setIssueSkip(ref, note, count, root);
    }
  }
  return { demoted, skipped };
}

export function issueRefFromQueue(repo: string, number: number): string {
  return issueRef(repo, number);
}
