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
import { sprintDataDir, type QueuedOrgIssue } from "./org-issue-coordination.js";
import { activeIssueRefs, readActiveState } from "./org-issue-coordination.js";

export type OrgIssueTriageActiveStatus = "claimed" | "running" | "completed" | "failed";

export interface OrgIssueTriageActiveEntry {
  issueRef: string;
  repo: string;
  number: number;
  workerId: string;
  jobName?: string;
  startedAt: string;
  updatedAt: string;
  status: OrgIssueTriageActiveStatus;
  message?: string;
}

export interface OrgIssueTriageActiveState {
  version: 1;
  updatedAt: string;
  issues: Record<string, OrgIssueTriageActiveEntry>;
}

const ACTIVE_FILE = "org-issue-triage-active.json";
const AUDIT_FILE = "org-issue-triage-audit.jsonl";
const COOLDOWN_FILE = "org-issue-triage-cooldown.json";

const TRIAGE_BUCKETS = ["needs_triage", "stale_needs_human"] as const;

function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function triageAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), AUDIT_FILE);
}

function cooldownPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), COOLDOWN_FILE);
}

function emptyState(): OrgIssueTriageActiveState {
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
      /* spin */
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

export function readTriageActiveState(root = agentsPackageRoot()): OrgIssueTriageActiveState {
  const path = activeStatePath(root);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgIssueTriageActiveState;
    if (parsed?.version === 1 && parsed.issues && typeof parsed.issues === "object") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return emptyState();
}

function writeTriageActiveState(state: OrgIssueTriageActiveState, root = agentsPackageRoot()): void {
  const path = activeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const payload = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}

export function mutateTriageActiveState(
  mutator: (state: OrgIssueTriageActiveState) => void,
  root = agentsPackageRoot(),
): OrgIssueTriageActiveState {
  const path = activeStatePath(root);
  return withFileLock(path, () => {
    const state = readTriageActiveState(root);
    mutator(state);
    writeTriageActiveState(state, root);
    return readTriageActiveState(root);
  });
}

export function activeTriageIssueRefs(state: OrgIssueTriageActiveState): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.issues)) {
    if (entry.status === "claimed" || entry.status === "running") active.add(ref);
  }
  return active;
}

export function countActiveTriageWorkers(state: OrgIssueTriageActiveState): number {
  return activeTriageIssueRefs(state).size;
}

function issueBusyOnOtherLane(ref: string, root: string): boolean {
  const implement = activeIssueRefs(readActiveState(root));
  return implement.has(ref);
}

export function claimTriageIssue(
  issueRef: string,
  repo: string,
  number: number,
  workerId: string,
  jobName?: string,
  root = agentsPackageRoot(),
): boolean {
  if (issueBusyOnOtherLane(issueRef, root)) return false;
  let claimed = false;
  mutateTriageActiveState((state) => {
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

export function updateTriageIssueStatus(
  issueRef: string,
  status: OrgIssueTriageActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  mutateTriageActiveState((state) => {
    const entry = state.issues[issueRef];
    if (!entry) return;
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    if (message) entry.message = message;
    if (jobName) entry.jobName = jobName;
  }, root);
}

export function appendTriageAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  const path = triageAuditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function pruneTerminalTriageEntries(root = agentsPackageRoot()): number {
  let removed = 0;
  mutateTriageActiveState((state) => {
    for (const [ref, entry] of Object.entries(state.issues)) {
      if (entry.status === "completed" || entry.status === "failed") {
        delete state.issues[ref];
        removed++;
      }
    }
  }, root);
  return removed;
}

function readQueueBucket(root: string, bucket: string): QueuedOrgIssue[] {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return [];
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const rows = q[bucket];
  if (!Array.isArray(rows)) return [];
  const out: QueuedOrgIssue[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as QueuedOrgIssue;
    if (!r.repo || !r.number) continue;
    out.push(r);
  }
  return out;
}

export function readTriageQueueIssues(root = agentsPackageRoot()): QueuedOrgIssue[] {
  const out: QueuedOrgIssue[] = [];
  const seen = new Set<string>();
  for (const bucket of TRIAGE_BUCKETS) {
    for (const row of readQueueBucket(root, bucket)) {
      const key = `${row.repo}#${row.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

export function readTriageQueueCount(root = agentsPackageRoot()): number {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return 0;
  const q = JSON.parse(readFileSync(path, "utf8")) as {
    report?: { needs_triage?: number; stale_needs_human?: number };
    needs_triage?: unknown[];
    stale_needs_human?: unknown[];
  };
  const fromReport =
    (q.report?.needs_triage ?? 0) + (q.report?.stale_needs_human ?? 0);
  if (fromReport > 0) return fromReport;
  return readTriageQueueIssues(root).length;
}

export function triageCooldownUntilForRef(ref: string, root = agentsPackageRoot()): string | null {
  const path = cooldownPath(root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      untilByRef?: Record<string, string>;
    };
    const until = parsed?.untilByRef?.[ref];
    if (!until || !Number.isFinite(Date.parse(until))) return null;
    if (Date.now() >= Date.parse(until)) return null;
    return until;
  } catch {
    return null;
  }
}

export function setTriageCooldown(ref: string, untilIso: string, root = agentsPackageRoot()): void {
  const path = cooldownPath(root);
  mkdirSync(dirname(path), { recursive: true });
  let untilByRef: Record<string, string> = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { untilByRef?: Record<string, string> };
      untilByRef = parsed?.untilByRef ?? {};
    } catch {
      untilByRef = {};
    }
  }
  untilByRef[ref] = untilIso;
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(
    tmp,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), untilByRef }, null, 2),
    "utf8",
  );
  renameSync(tmp, path);
}

export function activeTriageClaimsForDb(state: OrgIssueTriageActiveState): unknown[] {
  return Object.values(state.issues).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}
