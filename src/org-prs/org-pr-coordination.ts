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
import { sprintDataDir } from "../org-issues/org-issue-coordination.js";

export type OrgPrActiveStatus = "claimed" | "running" | "completed" | "failed";
export type OrgPrWorkerRole = "implementer" | "reviewer";

export interface OrgPrActiveEntry {
  prRef: string;
  repo: string;
  number: number;
  role: OrgPrWorkerRole;
  workerId: string;
  jobName?: string;
  startedAt: string;
  updatedAt: string;
  status: OrgPrActiveStatus;
  message?: string;
}

export interface OrgPrActiveState {
  version: 1;
  updatedAt: string;
  prs: Record<string, OrgPrActiveEntry>;
}

export interface QueuedOrgPr {
  repo: string;
  number: number;
  title?: string;
  html_url?: string;
  mergeable_state?: string;
  ci?: string;
}

const ACTIVE_FILE = "org-pr-active.json";
const IMPLEMENT_AUDIT = "org-pr-implement-audit.jsonl";
const REVIEW_AUDIT = "org-pr-review-audit.jsonl";

export function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function implementAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), IMPLEMENT_AUDIT);
}

export function reviewAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), REVIEW_AUDIT);
}

function emptyState(): OrgPrActiveState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, prs: {} };
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

export function readActiveState(root = agentsPackageRoot()): OrgPrActiveState {
  const path = activeStatePath(root);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgPrActiveState;
    if (parsed?.version === 1 && parsed.prs && typeof parsed.prs === "object") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return emptyState();
}

export function writeActiveState(state: OrgPrActiveState, root = agentsPackageRoot()): void {
  const path = activeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const payload = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}

export function mutateActiveState(
  mutator: (state: OrgPrActiveState) => void,
  root = agentsPackageRoot(),
): OrgPrActiveState {
  const path = activeStatePath(root);
  return withFileLock(path, () => {
    const state = readActiveState(root);
    mutator(state);
    writeActiveState(state, root);
    return readActiveState(root);
  });
}

export function activePrRefs(state: OrgPrActiveState): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.prs)) {
    if (entry.status === "claimed" || entry.status === "running") active.add(ref);
  }
  return active;
}

export function countActiveWorkers(state: OrgPrActiveState, role?: OrgPrWorkerRole): number {
  let n = 0;
  for (const entry of Object.values(state.prs)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    if (role && entry.role !== role) continue;
    n++;
  }
  return n;
}

/** True when any role still holds this PR (implementer blocks reviewer and vice versa). */
export function isPrBusy(state: OrgPrActiveState, prRef: string): boolean {
  const entry = state.prs[prRef];
  return Boolean(entry && (entry.status === "claimed" || entry.status === "running"));
}

export function claimPr(
  prRef: string,
  repo: string,
  number: number,
  role: OrgPrWorkerRole,
  workerId: string,
  jobName?: string,
  root = agentsPackageRoot(),
): boolean {
  let claimed = false;
  mutateActiveState((state) => {
    if (isPrBusy(state, prRef)) return;
    const now = new Date().toISOString();
    state.prs[prRef] = {
      prRef,
      repo,
      number,
      role,
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

export function updatePrStatus(
  prRef: string,
  status: OrgPrActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  mutateActiveState((state) => {
    const entry = state.prs[prRef];
    if (!entry) return;
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    if (message) entry.message = message;
    if (jobName) entry.jobName = jobName;
  }, root);
}

function appendAudit(path: string, row: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function appendImplementAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  appendAudit(implementAuditPath(root), row);
}

export function appendReviewAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  appendAudit(reviewAuditPath(root), row);
}

function readQueueBucket(root: string, bucket: string): QueuedOrgPr[] {
  const path = join(sprintDataDir(root), "org-pr-merge-queue.json");
  if (!existsSync(path)) return [];
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const rows = q[bucket];
  if (!Array.isArray(rows)) return [];
  const out: QueuedOrgPr[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as QueuedOrgPr;
    if (!r.repo || !r.number) continue;
    out.push(r);
  }
  return out;
}

/** PRs needing implementer work (CI fix, rebase, dirty branch). */
export function readImplementQueuePrs(root = agentsPackageRoot()): QueuedOrgPr[] {
  const buckets = ["dirty", "ci_not_ok", "blocked"] as const;
  const out: QueuedOrgPr[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    for (const row of readQueueBucket(root, bucket)) {
      const key = `${row.repo}#${row.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/** PRs ready for standards review (green + blocked merge queue). */
export function readReviewQueuePrs(root = agentsPackageRoot()): QueuedOrgPr[] {
  const buckets = ["green", "blocked"] as const;
  const out: QueuedOrgPr[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    for (const row of readQueueBucket(root, bucket)) {
      const key = `${row.repo}#${row.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

export function readQueueOpenTotal(root = agentsPackageRoot()): number {
  const path = join(sprintDataDir(root), "org-pr-merge-queue.json");
  if (!existsSync(path)) return 0;
  const q = JSON.parse(readFileSync(path, "utf8")) as { report?: { total?: number } };
  return q.report?.total ?? 0;
}

export function pruneTerminalActiveEntries(root = agentsPackageRoot()): number {
  let removed = 0;
  mutateActiveState((state) => {
    for (const [ref, entry] of Object.entries(state.prs)) {
      if (entry.status === "completed" || entry.status === "failed") {
        delete state.prs[ref];
        removed++;
      }
    }
  }, root);
  return removed;
}

/** Drop a merged/closed PR from merge queue buckets and decrement report.total. */
export function removeClosedPrFromQueue(
  repo: string,
  number: number,
  root = agentsPackageRoot(),
): boolean {
  const path = join(sprintDataDir(root), "org-pr-merge-queue.json");
  if (!existsSync(path)) return false;
  const q = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  let removed = false;
  for (const [key, value] of Object.entries(q)) {
    if (key === "report" || !Array.isArray(value)) continue;
    const before = value.length;
    q[key] = (value as { repo: string; number: number }[]).filter(
      (row) => !(row.repo === repo && Number(row.number) === number),
    );
    if ((q[key] as unknown[]).length < before) removed = true;
  }
  if (removed) {
    const report = q.report;
    if (report && typeof report === "object" && !Array.isArray(report)) {
      const total = (report as { total?: number }).total;
      if (typeof total === "number" && total > 0) {
        (report as { total: number }).total = total - 1;
      }
    }
    writeFileSync(path, `${JSON.stringify(q, null, 2)}\n`, "utf8");
  }
  return removed;
}

export function activeClaimsForDb(state: OrgPrActiveState): unknown[] {
  return Object.values(state.prs).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

export interface OrgPrBackoffState {
  until: string;
  reason?: string;
}

export interface OrgPrCooldownState {
  version: 1;
  updatedAt: string;
  untilByRef: Record<string, string>;
}

function prBackoffPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), "org-pr-gh-backoff.json");
}

function prCooldownPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), "org-pr-cooldown.json");
}

export function getPrBackoff(root = agentsPackageRoot()): OrgPrBackoffState | null {
  const path = prBackoffPath(root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgPrBackoffState;
    if (!parsed?.until) return null;
    if (!Number.isFinite(Date.parse(parsed.until))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPrBackoff(untilIso: string, reason?: string, root = agentsPackageRoot()): void {
  const path = prBackoffPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ until: untilIso, reason }, null, 2), "utf8");
  renameSync(tmp, path);
}

function emptyCooldown(): OrgPrCooldownState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, untilByRef: {} };
}

function readCooldown(root = agentsPackageRoot()): OrgPrCooldownState {
  const path = prCooldownPath(root);
  if (!existsSync(path)) return emptyCooldown();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgPrCooldownState;
    if (parsed?.version === 1 && parsed.untilByRef && typeof parsed.untilByRef === "object") return parsed;
  } catch {
    /* ignore */
  }
  return emptyCooldown();
}

function writeCooldown(state: OrgPrCooldownState, root = agentsPackageRoot()): void {
  const path = prCooldownPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmp, path);
}

export function cooldownUntilForPr(prRef: string, root = agentsPackageRoot()): string | null {
  const state = readCooldown(root);
  const until = state.untilByRef[prRef];
  if (!until) return null;
  const ms = Date.parse(until);
  if (!Number.isFinite(ms)) return null;
  if (Date.now() >= ms) return null;
  return until;
}

export function setPrCooldown(prRef: string, untilIso: string, root = agentsPackageRoot()): void {
  const state = readCooldown(root);
  state.updatedAt = new Date().toISOString();
  state.untilByRef[prRef] = untilIso;
  writeCooldown(state, root);
}
