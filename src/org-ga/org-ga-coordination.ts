import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { reconcileOrphanedK8sJobs } from "../org/k8s-job-reconcile.js";
import {
  defaultGaLanes,
  gaLaneAgentId,
  gaRef,
  orgGaOrphanClaimGraceMs,
  orgGaStaleClaimMaxAgeMs,
  type GaLaneId,
} from "./org-ga-supervisor-config.js";
import { loadOrgRepoList } from "./org-ga-repo-queue.js";

export interface GaReconcileJobSummary {
  name: string;
  gaRef: string;
  active: boolean;
  succeeded: boolean;
  failed: boolean;
}

export interface GaReconcileResult {
  terminalUpdated: number;
  orphanedJobs: number;
  staleByAge: number;
  orphanClaims: number;
}

export type GaActiveStatus = "claimed" | "running" | "completed" | "failed";

export interface GaActiveEntry {
  gaRef: string;
  repo: string;
  lane: string;
  workerId: string;
  status: GaActiveStatus;
  jobName?: string;
  updatedAt: string;
  message?: string;
}

export interface GaActiveState {
  cursor: { repo: number; lane: number };
  audits: Record<string, GaActiveEntry>;
}

function sprintDir(root: string): string {
  return join(root, "data", "goal-directed-sprints");
}

function statePath(root: string): string {
  return join(sprintDir(root), "org-ga-active.json");
}

export function readGaActiveState(root = agentsPackageRoot()): GaActiveState {
  const path = statePath(root);
  if (!existsSync(path)) {
    return { cursor: { repo: 0, lane: 0 }, audits: {} };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as GaActiveState;
    return {
      cursor: raw.cursor ?? { repo: 0, lane: 0 },
      audits: raw.audits ?? {},
    };
  } catch {
    return { cursor: { repo: 0, lane: 0 }, audits: {} };
  }
}

export function writeGaActiveState(state: GaActiveState, root = agentsPackageRoot()): void {
  const dir = sprintDir(root);
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function activeGaRefs(state: GaActiveState): Set<string> {
  const out = new Set<string>();
  for (const entry of Object.values(state.audits)) {
    if (entry.status === "claimed" || entry.status === "running") {
      out.add(entry.gaRef);
    }
  }
  return out;
}

export function countActiveGaWorkers(state: GaActiveState): number {
  return [...activeGaRefs(state)].length;
}

export function claimGaAudit(
  repo: string,
  lane: string,
  workerId: string,
  jobName: string | undefined,
  root = agentsPackageRoot(),
): boolean {
  const state = readGaActiveState(root);
  const ref = gaRef(repo, lane as never);
  const existing = state.audits[ref];
  if (existing && (existing.status === "claimed" || existing.status === "running")) {
    return false;
  }
  state.audits[ref] = {
    gaRef: ref,
    repo,
    lane,
    workerId,
    status: "claimed",
    jobName,
    updatedAt: new Date().toISOString(),
  };
  writeGaActiveState(state, root);
  return true;
}

export function updateGaAuditStatus(
  ref: string,
  status: GaActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
): void {
  const state = readGaActiveState(root);
  const entry = state.audits[ref];
  if (!entry) return;
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  if (message) entry.message = message.slice(0, 500);
  writeGaActiveState(state, root);
}

export function updateGaJobName(ref: string, jobName: string, root = agentsPackageRoot()): void {
  const state = readGaActiveState(root);
  const entry = state.audits[ref];
  if (!entry) return;
  entry.jobName = jobName;
  entry.updatedAt = new Date().toISOString();
  writeGaActiveState(state, root);
}

const GA_AUDIT_FILE = "org-ga-audit.jsonl";

export function gaAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDir(root), GA_AUDIT_FILE);
}

export function appendGaAudit(row: Record<string, unknown>, root = agentsPackageRoot()): void {
  const path = gaAuditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function activeClaimsForDb(state: GaActiveState): unknown[] {
  return Object.values(state.audits).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

export function pruneTerminalActiveEntries(root = agentsPackageRoot()): number {
  const state = readGaActiveState(root);
  let removed = 0;
  for (const [ref, entry] of Object.entries(state.audits)) {
    if (entry.status === "completed" || entry.status === "failed") {
      delete state.audits[ref];
      removed++;
    }
  }
  if (removed) writeGaActiveState(state, root);
  return removed;
}

export function setGaCursor(cursor: { repo: number; lane: number }, root = agentsPackageRoot()): void {
  const state = readGaActiveState(root);
  state.cursor = cursor;
  writeGaActiveState(state, root);
}

export function pendingGaCount(root = agentsPackageRoot()): number {
  const repos = loadOrgRepoList().length;
  const lanes = defaultGaLanes().length;
  const active = countActiveGaWorkers(readGaActiveState(root));
  return Math.max(0, repos * lanes - active);
}

function entryAgeMs(entry: GaActiveEntry, now = Date.now()): number {
  const ts = Date.parse(entry.updatedAt || "");
  return Number.isFinite(ts) ? now - ts : Infinity;
}

function reconcileAppendAudit(
  entry: GaActiveEntry,
  status: "completed" | "failed",
  detail: string,
  root: string,
): void {
  appendGaAudit(
    {
      gaRef: entry.gaRef,
      repo: entry.repo,
      lane: entry.lane,
      workerId: entry.workerId,
      status,
      agentId: gaLaneAgentId(entry.lane as GaLaneId),
      stub: true,
      agentStatus: status === "completed" ? "finished" : "error",
      error: status === "failed" ? detail : undefined,
      outputTail: detail.slice(0, 500),
    },
    root,
  );
}

/** Count claimed/running rows older than stale threshold (PVC-only health probe). */
export function countGaGhostClaimsByAge(
  state = readGaActiveState(),
  staleMs = orgGaStaleClaimMaxAgeMs(),
): number {
  const now = Date.now();
  return Object.values(state.audits).filter((e) => {
    if (e.status !== "claimed" && e.status !== "running") return false;
    return entryAgeMs(e, now) > staleMs;
  }).length;
}

/**
 * Sync org-ga-active.json with Batch Job status — terminal updates, orphaned jobs, stale claims.
 * Mirrors org-issue / org-pr supervisor reconcile (see org/k8s-job-reconcile.ts).
 */
export function reconcileGaActiveWithK8sJobs(
  jobs: GaReconcileJobSummary[],
  root = agentsPackageRoot(),
): GaReconcileResult {
  const result: GaReconcileResult = {
    terminalUpdated: 0,
    orphanedJobs: 0,
    staleByAge: 0,
    orphanClaims: 0,
  };
  const state = readGaActiveState(root);
  const jobByName = new Map(jobs.map((j) => [j.name, j]));
  const activeJobRefs = new Set(jobs.filter((j) => j.active).map((j) => j.gaRef));
  const staleMs = orgGaStaleClaimMaxAgeMs();
  const orphanGraceMs = orgGaOrphanClaimGraceMs();
  const now = Date.now();

  for (const job of jobs) {
    if (!job.succeeded && !job.failed) continue;
    const entry = Object.values(state.audits).find((e) => e.jobName === job.name);
    if (!entry || (entry.status !== "claimed" && entry.status !== "running")) continue;
    const status = job.succeeded ? "completed" : "failed";
    const detail = job.succeeded ? "job succeeded" : "job failed";
    updateGaAuditStatus(entry.gaRef, status, detail, root);
    reconcileAppendAudit(entry, status, detail, root);
    result.terminalUpdated += 1;
  }

  result.orphanedJobs = reconcileOrphanedK8sJobs(state.audits, jobs, (ref, entry) => {
    updateGaAuditStatus(ref, "failed", "job missing (reconciled)", root);
    reconcileAppendAudit(entry, "failed", "job missing (reconciled)", root);
  });

  const refreshed = readGaActiveState(root);
  for (const [ref, entry] of Object.entries(refreshed.audits)) {
    if (entry.status !== "claimed" && entry.status !== "running") continue;
    const age = entryAgeMs(entry, now);

    if (!entry.jobName && age > orphanGraceMs) {
      updateGaAuditStatus(ref, "failed", "orphan claim without job (reconciled)", root);
      reconcileAppendAudit(entry, "failed", "orphan claim without job (reconciled)", root);
      result.orphanClaims += 1;
      continue;
    }

    if (entry.jobName && !jobByName.has(entry.jobName)) continue;

    const jobAlive = entry.jobName ? (jobByName.get(entry.jobName)?.active ?? false) : false;
    const refActive = activeJobRefs.has(ref);
    if (!jobAlive && !refActive && age > staleMs) {
      updateGaAuditStatus(ref, "failed", "stale claim (reconciled by age)", root);
      reconcileAppendAudit(entry, "failed", "stale claim (reconciled by age)", root);
      result.staleByAge += 1;
    }
  }

  pruneTerminalActiveEntries(root);
  return result;
}
