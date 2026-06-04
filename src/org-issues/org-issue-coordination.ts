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
export type OrgIssueWorkerRole = "implementer" | "triage";

export interface OrgIssueActiveEntry {
  issueRef: string;
  repo: string;
  number: number;
  workerId: string;
  role?: OrgIssueWorkerRole;
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
const TRIAGE_AUDIT_FILE = "org-issue-triage-audit.jsonl";

export function sprintDataDir(root = agentsPackageRoot()): string {
  return join(root, "data", "goal-directed-sprints");
}

export function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function implementAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), AUDIT_FILE);
}

export function triageAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), TRIAGE_AUDIT_FILE);
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

export function activeIssueRefs(
  state: OrgIssueActiveState,
  role?: OrgIssueWorkerRole,
): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.issues)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    const entryRole = entry.role ?? "implementer";
    if (role && entryRole !== role) continue;
    active.add(ref);
  }
  return active;
}

export function countActiveWorkers(state: OrgIssueActiveState, role?: OrgIssueWorkerRole): number {
  return activeIssueRefs(state, role).size;
}

export function claimIssue(
  issueRef: string,
  repo: string,
  number: number,
  workerId: string,
  jobName?: string,
  root = agentsPackageRoot(),
  role: OrgIssueWorkerRole = "implementer",
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
      role,
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
): void {
  appendIssueAudit(implementAuditPath(root), row);
}

export function appendTriageAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  appendIssueAudit(triageAuditPath(root), row);
}

function appendIssueAudit(path: string, row: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}


function readQueueBucket(
  root: string,
  bucket: string,
): QueuedOrgIssue[] {
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

/** Implement-bucket issues only  supervisor spawns real implementer Jobs for these. */
export function readImplementQueueIssues(root = agentsPackageRoot()): QueuedOrgIssue[] {
  return readQueueBucket(root, "implement");
}

/** Count of issues ready for implementer Jobs (from last classify report or bucket length). */
export function readImplementQueueCount(root = agentsPackageRoot()): number {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return 0;
  const q = JSON.parse(readFileSync(path, "utf8")) as {
    report?: { implement?: number };
    implement?: unknown[];
  };
  if (typeof q.report?.implement === "number") return q.report.implement;
  return Array.isArray(q.implement) ? q.implement.length : 0;
}

const TRIAGE_BUCKETS_DEFAULT = ["needs_triage", "stale_needs_human"] as const;

export function triageQueueBuckets(): readonly string[] {
  const raw = process.env.LI_ORG_ISSUE_TRIAGE_BUCKETS?.trim();
  if (!raw) return TRIAGE_BUCKETS_DEFAULT;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Issues awaiting triage agent (close, relabel, or route to planner/implement). */
export function readTriageQueueIssues(root = agentsPackageRoot()): QueuedOrgIssue[] {
  const out: QueuedOrgIssue[] = [];
  const seen = new Set<string>();
  for (const bucket of triageQueueBuckets()) {
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
  const q = JSON.parse(readFileSync(path, "utf8")) as { report?: Record<string, number> };
  const buckets = triageQueueBuckets();
  let sum = 0;
  for (const b of buckets) {
    const n = q.report?.[b];
    if (typeof n === "number") sum += n;
  }
  if (sum > 0) return sum;
  return readTriageQueueIssues(root).length;
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


export function activeClaimsForDb(state: OrgIssueActiveState): unknown[] {
  return Object.values(state.issues).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
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

/** Drop a closed issue from all queue buckets and decrement report.total_open. */
export function removeClosedIssueFromQueue(
  repo: string,
  number: number,
  root = agentsPackageRoot(),
): boolean {
  const path = join(sprintDataDir(root), "org-issue-queue.json");
  if (!existsSync(path)) return false;
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  let removed = false;
  for (const [key, value] of Object.entries(q)) {
    if (key === "report" || !Array.isArray(value)) continue;
    const before = value.length;
    q[key] = (value as QueuedOrgIssue[]).filter(
      (row) => !(row.repo === repo && Number(row.number) === number),
    );
    if ((q[key] as unknown[]).length < before) removed = true;
  }
  if (removed) {
    const report = q.report;
    if (report && typeof report === "object" && !Array.isArray(report)) {
      const total = (report as { total_open?: number }).total_open;
      if (typeof total === "number" && total > 0) {
        (report as { total_open: number }).total_open = total - 1;
      }
    }
    writeFileSync(path, `${JSON.stringify(q, null, 2)}\n`, "utf8");
  }
  return removed;
}



export interface OrgIssueBackoffState {
  until: string;
  reason?: string;
}

export interface OrgIssueCooldownState {
  version: 1;
  updatedAt: string;
  untilByRef: Record<string, string>;
}

function issueBackoffPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), "org-issue-gh-backoff.json");
}

function issueCooldownPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), "org-issue-cooldown.json");
}

export function getIssueBackoff(root = agentsPackageRoot()): OrgIssueBackoffState | null {
  const path = issueBackoffPath(root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgIssueBackoffState;
    if (!parsed?.until) return null;
    if (!Number.isFinite(Date.parse(parsed.until))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setIssueBackoff(untilIso: string, reason?: string, root = agentsPackageRoot()): void {
  const path = issueBackoffPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ until: untilIso, reason }, null, 2), "utf8");
  renameSync(tmp, path);
}

function emptyIssueCooldown(): OrgIssueCooldownState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, untilByRef: {} };
}

function readIssueCooldown(root = agentsPackageRoot()): OrgIssueCooldownState {
  const path = issueCooldownPath(root);
  if (!existsSync(path)) return emptyIssueCooldown();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgIssueCooldownState;
    if (parsed?.version === 1 && parsed.untilByRef && typeof parsed.untilByRef === "object") return parsed;
  } catch {
    /* ignore */
  }
  return emptyIssueCooldown();
}

function writeIssueCooldown(state: OrgIssueCooldownState, root = agentsPackageRoot()): void {
  const path = issueCooldownPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmp, path);
}

export function cooldownUntilForIssue(issueRef: string, root = agentsPackageRoot()): string | null {
  const state = readIssueCooldown(root);
  const until = state.untilByRef[issueRef];
  if (!until) return null;
  const ms = Date.parse(until);
  if (!Number.isFinite(ms)) return null;
  if (Date.now() >= ms) return null;
  return until;
}

export function setIssueCooldown(issueRef: string, untilIso: string, root = agentsPackageRoot()): void {
  const state = readIssueCooldown(root);
  state.updatedAt = new Date().toISOString();
  state.untilByRef[issueRef] = untilIso;
  writeIssueCooldown(state, root);
}
