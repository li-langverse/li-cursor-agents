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
import type { AgentId } from "../types.js";

export type OrgImplementActiveStatus = "claimed" | "running" | "completed" | "failed";

export interface OrgImplementActiveEntry {
  implementRef: string;
  kind: "handoff" | "implement_goal";
  agentId: AgentId;
  handoffId?: string;
  goalId?: string;
  todoId?: string;
  workerId: string;
  jobName?: string;
  startedAt: string;
  updatedAt: string;
  status: OrgImplementActiveStatus;
  message?: string;
}

export interface OrgImplementActiveState {
  version: 1;
  updatedAt: string;
  implement: Record<string, OrgImplementActiveEntry>;
}

const ACTIVE_FILE = "org-implement-active.json";
const AUDIT_FILE = "org-implement-audit.jsonl";

export function sprintDataDir(root = agentsPackageRoot()): string {
  return join(root, "data", "goal-directed-sprints");
}

export function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function implementAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), AUDIT_FILE);
}

function emptyState(): OrgImplementActiveState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, implement: {} };
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

export function readActiveState(root = agentsPackageRoot()): OrgImplementActiveState {
  const path = activeStatePath(root);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgImplementActiveState;
    if (parsed?.version === 1 && parsed.implement && typeof parsed.implement === "object") {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return emptyState();
}

export function writeActiveState(state: OrgImplementActiveState, root = agentsPackageRoot()): void {
  const path = activeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const payload = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}

export function mutateActiveState(
  mutator: (state: OrgImplementActiveState) => void,
  root = agentsPackageRoot(),
): OrgImplementActiveState {
  const path = activeStatePath(root);
  return withFileLock(path, () => {
    const state = readActiveState(root);
    mutator(state);
    writeActiveState(state, root);
    return readActiveState(root);
  });
}

export function activeImplementRefs(state: OrgImplementActiveState): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.implement)) {
    if (entry.status === "claimed" || entry.status === "running") active.add(ref);
  }
  return active;
}

export function countActiveWorkers(state: OrgImplementActiveState): number {
  return activeImplementRefs(state).size;
}

export function claimImplement(
  entry: Omit<OrgImplementActiveEntry, "startedAt" | "updatedAt" | "status">,
  root = agentsPackageRoot(),
): boolean {
  let claimed = false;
  mutateActiveState((state) => {
    const existing = state.implement[entry.implementRef];
    if (existing && (existing.status === "claimed" || existing.status === "running")) {
      return;
    }
    const now = new Date().toISOString();
    state.implement[entry.implementRef] = {
      ...entry,
      startedAt: now,
      updatedAt: now,
      status: "claimed",
    };
    claimed = true;
  }, root);
  return claimed;
}

export function updateImplementStatus(
  implementRef: string,
  status: OrgImplementActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  mutateActiveState((state) => {
    const entry = state.implement[implementRef];
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
  const path = implementAuditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function activeClaimsForDb(state: OrgImplementActiveState): unknown[] {
  return Object.values(state.implement).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

export function pruneTerminalActiveEntries(root = agentsPackageRoot()): number {
  let removed = 0;
  mutateActiveState((state) => {
    for (const [ref, entry] of Object.entries(state.implement)) {
      if (entry.status === "completed" || entry.status === "failed") {
        delete state.implement[ref];
        removed++;
      }
    }
  }, root);
  return removed;
}
