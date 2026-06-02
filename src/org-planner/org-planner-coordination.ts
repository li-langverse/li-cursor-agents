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

export type OrgPlannerActiveStatus = "claimed" | "running" | "completed" | "failed";
export type PlannerWorkKind = "issue_plan" | "research_plan";

export interface OrgPlannerActiveEntry {
  planRef: string;
  kind: PlannerWorkKind;
  issueRef?: string;
  repo?: string;
  number?: number;
  goalId?: string;
  sessionId?: string;
  handoffId?: string;
  workerId: string;
  jobName?: string;
  startedAt: string;
  updatedAt: string;
  status: OrgPlannerActiveStatus;
  message?: string;
}

export interface OrgPlannerActiveState {
  version: 1;
  updatedAt: string;
  plans: Record<string, OrgPlannerActiveEntry>;
}

export interface QueuedIssuePlan {
  kind: "issue_plan";
  repo: string;
  number: number;
  source: string;
  priority: number;
  title?: string;
  html_url?: string;
  classification_note?: string;
}

export interface QueuedResearchPlan {
  kind: "research_plan";
  goal_id: string;
  session_id: string;
  handoff_id?: string;
  source: string;
  allow_implementation?: boolean;
  priority: number;
}

export type QueuedPlannerItem = QueuedIssuePlan | QueuedResearchPlan;

export interface OrgPlannerQueueReport {
  issue_plan: number;
  research_plan: number;
  total: number;
}

export interface OrgPlannerQueue {
  report: OrgPlannerQueueReport;
  issue_plan: QueuedIssuePlan[];
  research_plan: QueuedResearchPlan[];
}

const ACTIVE_FILE = "org-planner-active.json";
const AUDIT_FILE = "org-planner-audit.jsonl";
const QUEUE_FILE = "org-planner-queue.json";

export function sprintDataDir(root = agentsPackageRoot()): string {
  return join(root, "data", "goal-directed-sprints");
}

export function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function plannerAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), AUDIT_FILE);
}

export function plannerQueuePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), QUEUE_FILE);
}

function emptyState(): OrgPlannerActiveState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, plans: {} };
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

export function readActiveState(root = agentsPackageRoot()): OrgPlannerActiveState {
  const path = activeStatePath(root);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgPlannerActiveState;
    if (parsed?.version === 1 && parsed.plans && typeof parsed.plans === "object") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return emptyState();
}

export function writeActiveState(state: OrgPlannerActiveState, root = agentsPackageRoot()): void {
  const path = activeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const payload = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}

export function mutateActiveState(
  mutator: (state: OrgPlannerActiveState) => void,
  root = agentsPackageRoot(),
): OrgPlannerActiveState {
  const path = activeStatePath(root);
  return withFileLock(path, () => {
    const state = readActiveState(root);
    mutator(state);
    writeActiveState(state, root);
    return readActiveState(root);
  });
}

export function activePlanRefs(state: OrgPlannerActiveState): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.plans)) {
    if (entry.status === "claimed" || entry.status === "running") active.add(ref);
  }
  return active;
}

export function countActiveWorkers(state: OrgPlannerActiveState): number {
  return activePlanRefs(state).size;
}

export function claimPlan(
  planRef: string,
  entry: Omit<OrgPlannerActiveEntry, "startedAt" | "updatedAt" | "status">,
  root = agentsPackageRoot(),
): boolean {
  let claimed = false;
  mutateActiveState((state) => {
    const existing = state.plans[planRef];
    if (existing && (existing.status === "claimed" || existing.status === "running")) {
      return;
    }
    const now = new Date().toISOString();
    state.plans[planRef] = {
      ...entry,
      planRef,
      startedAt: now,
      updatedAt: now,
      status: "claimed",
    };
    claimed = true;
  }, root);
  return claimed;
}

export function updatePlanStatus(
  planRef: string,
  status: OrgPlannerActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  mutateActiveState((state) => {
    const entry = state.plans[planRef];
    if (!entry) return;
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    if (message) entry.message = message;
    if (jobName) entry.jobName = jobName;
  }, root);
}

export function appendPlannerAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  const path = plannerAuditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function writePlannerQueue(queue: OrgPlannerQueue, root = agentsPackageRoot()): void {
  const path = plannerQueuePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(queue, null, 2), "utf8");
  renameSync(tmp, path);
}

export function readPlannerQueue(root = agentsPackageRoot()): OrgPlannerQueue {
  const path = plannerQueuePath(root);
  if (!existsSync(path)) {
    return { report: { issue_plan: 0, research_plan: 0, total: 0 }, issue_plan: [], research_plan: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgPlannerQueue;
    if (parsed?.issue_plan && parsed?.research_plan) return parsed;
  } catch {
    /* fall through */
  }
  return { report: { issue_plan: 0, research_plan: 0, total: 0 }, issue_plan: [], research_plan: [] };
}

/** Merged queue: research plans first (unblock implement pipeline), then issue plans. */
export function readPlannerWorkQueue(root = agentsPackageRoot()): QueuedPlannerItem[] {
  const q = readPlannerQueue(root);
  return [...q.research_plan, ...q.issue_plan];
}

export function activeClaimsForDb(state: OrgPlannerActiveState): unknown[] {
  return Object.values(state.plans).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

export function pruneTerminalActiveEntries(root = agentsPackageRoot()): number {
  let removed = 0;
  mutateActiveState((state) => {
    for (const [ref, entry] of Object.entries(state.plans)) {
      if (entry.status === "completed" || entry.status === "failed") {
        delete state.plans[ref];
        removed++;
      }
    }
  }, root);
  return removed;
}

export interface PlannerBackoffState {
  until: string;
  reason?: string;
}

export function plannerBackoffPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), "org-planner-gh-backoff.json");
}

export function getPlannerBackoff(root = agentsPackageRoot()): PlannerBackoffState | null {
  const path = plannerBackoffPath(root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as PlannerBackoffState;
    if (!parsed?.until) return null;
    if (!Number.isFinite(Date.parse(parsed.until))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setPlannerBackoff(untilIso: string, reason?: string, root = agentsPackageRoot()): void {
  const path = plannerBackoffPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ until: untilIso, reason }, null, 2), "utf8");
  renameSync(tmp, path);
}
