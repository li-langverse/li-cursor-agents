import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { agentsPackageRoot } from "../runner.js";

export type OrgIssueActiveStatus = "claimed" | "running" | "completed" | "failed";

export interface OrgIssueActiveEntry {
  issueRef: string;
  repo: string;
  number: number;
  workerId: string;
  jobName?: string;
  startedAt: string;
  updatedAt: string;
  status: OrgIssueActiveStatus;
  message?: string;
}

export interface OrgIssueActiveState {
  version: 1;
  updatedAt: string;
  issues: Record<string, OrgIssueActiveEntry>;
}

export interface QueuedOrgIssue {
  repo: string;
  number: number;
  title?: string;
  html_url?: string;
  classification_note?: string;
}

const ACTIVE_FILE = "org-issue-active.json";
const AUDIT_FILE = "org-issue-implement-audit.jsonl";

export function sprintDataDir(root = agentsPackageRoot()): string {
  return join(root, "data", "goal-directed-sprints");
}

export function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function implementAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), AUDIT_FILE);
}

function emptyState(): OrgIssueActiveState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, issues: {} };
}

function withFileLock<T>(path: string, fn: () => T): T {
  const lockPath = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  let fd: number | null = null;
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      fd = openSync(lockPath, "wx");
      break;
    } catch {
      // spin
    }
  }
  if (fd === null) throw new Error(`could not acquire lock ${lockPath}`);
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      /* ignore */
    }
  }
}

export function readActiveState(root = agentsPackageRoot()): OrgIssueActiveState {
  const path = activeStatePath(root);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgIssueActiveState;
    if (parsed?.version === 1 && parsed.issues && typeof parsed.issues === "object") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return emptyState();
}

export function writeActiveState(state: OrgIssueActiveState, root = agentsPackageRoot()): void {
  const path = activeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const payload = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}

export function mutateActiveState(
  mutator: (state: OrgIssueActiveState) => void,
  root = agentsPackageRoot(),
): OrgIssueActiveState {
  const path = activeStatePath(root);
  return withFileLock(path, () => {
    const state = readActiveState(root);
    mutator(state);
    writeActiveState(state, root);
    return readActiveState(root);
  });
}

export function activeIssueRefs(state: OrgIssueActiveState): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.issues)) {
    if (entry.status === "claimed" || entry.status === "running") active.add(ref);
  }
  return active;
}

export function countActiveWorkers(state: OrgIssueActiveState): number {
  return activeIssueRefs(state).size;
}

export function claimIssue(
  issueRef: string,
  repo: string,
  number: number,
  workerId: string,
  jobName?: string,
  root = agentsPackageRoot(),
): boolean {
  let claimed = false;
  mutateActiveState((state) => {
    const existing = state.issues[issueRef];
    if (existing && (existing.status === "claimed" || existing.status === "running")) {
      return;
    }
    const now = new Date().toISOString();
    state.issues[issueRef] = {
      issueRef,
      repo,
      number,
      workerId,
      jobName,
      startedAt: now,
      updatedAt: now,
      status: "claimed",
    };
    claimed = true;
  }, root);
  return claimed;
}

export function updateIssueStatus(
  issueRef: string,
  status: OrgIssueActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  mutateActiveState((state) => {
    const entry = state.issues[issueRef];
    if (!entry) return;
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    if (message) entry.message = message;
    if (jobName) entry.jobName = jobName;
  }, root);
}

export function appendImplementAudit(
  row: Record<string, unknown>,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  const path = implementAuditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function readQueueIssues(root = agentsPackageRoot()): QueuedOrgIssue[] {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return [];
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const buckets = ["implement", "route_planner", "needs_triage"] as const;
  const out: QueuedOrgIssue[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    const rows = q[bucket];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as QueuedOrgIssue;
      if (!r.repo || !r.number) continue;
      const key = `${r.repo}#${r.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export function pruneTerminalActiveEntries(root = agentsPackageRoot()): number {
  let removed = 0;
  mutateActiveState((state) => {
    for (const [ref, entry] of Object.entries(state.issues)) {
      if (entry.status === "completed" || entry.status === "failed") {
        delete state.issues[ref];
        removed++;
      }
    }
  }, root);
  return removed;
}



