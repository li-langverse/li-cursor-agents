import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { defaultGaLanes, gaRef } from "./org-ga-supervisor-config.js";
import { loadOrgRepoList } from "./org-ga-repo-queue.js";

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
