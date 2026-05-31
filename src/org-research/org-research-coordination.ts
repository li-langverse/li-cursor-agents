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
import { defaultResearchDimensions } from "./org-research-supervisor-config.js";

export type OrgResearchActiveStatus = "claimed" | "running" | "completed" | "failed";

export interface OrgResearchActiveEntry {
  researchRef: string;
  goalId: string;
  dimension: string;
  workerId: string;
  jobName?: string;
  startedAt: string;
  updatedAt: string;
  status: OrgResearchActiveStatus;
  message?: string;
}

export interface OrgResearchActiveState {
  version: 1;
  updatedAt: string;
  /** Round-robin cursor for dimension assignment across ticks. */
  dimensionCursor: number;
  research: Record<string, OrgResearchActiveEntry>;
}

export interface ResearchDimensionsConfig {
  version: 1;
  dimensions: string[];
  updatedAt: string;
}

const ACTIVE_FILE = "org-research-active.json";
const AUDIT_FILE = "org-research-audit.jsonl";
const DIMENSIONS_FILE = "org-research-dimensions.json";

export function sprintDataDir(root = agentsPackageRoot()): string {
  return join(root, "data", "goal-directed-sprints");
}

export function activeStatePath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), ACTIVE_FILE);
}

export function researchAuditPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), AUDIT_FILE);
}

export function dimensionsConfigPath(root = agentsPackageRoot()): string {
  return join(sprintDataDir(root), DIMENSIONS_FILE);
}

function emptyState(): OrgResearchActiveState {
  const now = new Date().toISOString();
  return { version: 1, updatedAt: now, dimensionCursor: 0, research: {} };
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

export function readActiveState(root = agentsPackageRoot()): OrgResearchActiveState {
  const path = activeStatePath(root);
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as OrgResearchActiveState;
    if (parsed?.version === 1 && parsed.research && typeof parsed.research === "object") {
      return {
        ...parsed,
        dimensionCursor: Number(parsed.dimensionCursor) || 0,
      };
    }
  } catch {
    /* fall through */
  }
  return emptyState();
}

export function writeActiveState(state: OrgResearchActiveState, root = agentsPackageRoot()): void {
  const path = activeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const payload = { ...state, updatedAt: new Date().toISOString() };
  writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  renameSync(tmp, path);
}

export function mutateActiveState(
  mutator: (state: OrgResearchActiveState) => void,
  root = agentsPackageRoot(),
): OrgResearchActiveState {
  const path = activeStatePath(root);
  return withFileLock(path, () => {
    const state = readActiveState(root);
    mutator(state);
    writeActiveState(state, root);
    return readActiveState(root);
  });
}

/** Load dimension list from PVC JSON or env defaults. */
export function loadResearchDimensions(root = agentsPackageRoot()): string[] {
  const path = dimensionsConfigPath(root);
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as ResearchDimensionsConfig;
      if (Array.isArray(parsed.dimensions) && parsed.dimensions.length) {
        return parsed.dimensions.map((d) => String(d).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }
  return defaultResearchDimensions();
}

/** Dimensions already in use by active claims ÔÇö avoid duplicate parallel assignment. */
export function activeDimensions(state: OrgResearchActiveState): Set<string> {
  const active = new Set<string>();
  for (const entry of Object.values(state.research)) {
    if (entry.status === "claimed" || entry.status === "running") {
      active.add(entry.dimension);
    }
  }
  return active;
}

/**
 * Pick the next dimension for a new Job, round-robin from cursor.
 * Skips dimensions already claimed when alternatives exist.
 */
export function pickNextDimension(
  dimensions: string[],
  cursor: number,
  inUse: Set<string>,
): { dimension: string; nextCursor: number } {
  if (!dimensions.length) {
    return { dimension: "general", nextCursor: cursor + 1 };
  }
  for (let offset = 0; offset < dimensions.length; offset++) {
    const idx = (cursor + offset) % dimensions.length;
    const dim = dimensions[idx]!;
    if (!inUse.has(dim) || inUse.size >= dimensions.length) {
      return { dimension: dim, nextCursor: cursor + offset + 1 };
    }
  }
  const dim = dimensions[cursor % dimensions.length]!;
  return { dimension: dim, nextCursor: cursor + 1 };
}

export function activeResearchRefs(state: OrgResearchActiveState): Set<string> {
  const active = new Set<string>();
  for (const [ref, entry] of Object.entries(state.research)) {
    if (entry.status === "claimed" || entry.status === "running") active.add(ref);
  }
  return active;
}

export function countActiveWorkers(state: OrgResearchActiveState): number {
  return activeResearchRefs(state).size;
}

export function claimResearch(
  researchRef: string,
  goalId: string,
  dimension: string,
  workerId: string,
  jobName?: string,
  root = agentsPackageRoot(),
): boolean {
  let claimed = false;
  mutateActiveState((state) => {
    const existing = state.research[researchRef];
    if (existing && (existing.status === "claimed" || existing.status === "running")) {
      return;
    }
    const now = new Date().toISOString();
    state.research[researchRef] = {
      researchRef,
      goalId,
      dimension,
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

export function updateResearchStatus(
  researchRef: string,
  status: OrgResearchActiveStatus,
  message?: string,
  root = agentsPackageRoot(),
  jobName?: string,
): void {
  mutateActiveState((state) => {
    const entry = state.research[researchRef];
    if (!entry) return;
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    if (message) entry.message = message;
    if (jobName) entry.jobName = jobName;
  }, root);
}

export function advanceDimensionCursor(nextCursor: number, root = agentsPackageRoot()): void {
  mutateActiveState((state) => {
    state.dimensionCursor = nextCursor;
  }, root);
}

export function appendResearchAudit(
  row: Record<string, unknown>,
  root = agentsPackageRoot(),
): void {
  const path = researchAuditPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), ...row })}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function activeClaimsForDb(state: OrgResearchActiveState): unknown[] {
  return Object.values(state.research).filter(
    (e) => e.status === "claimed" || e.status === "running",
  );
}

export function pruneTerminalActiveEntries(root = agentsPackageRoot()): number {
  let removed = 0;
  mutateActiveState((state) => {
    for (const [ref, entry] of Object.entries(state.research)) {
      if (entry.status === "completed" || entry.status === "failed") {
        delete state.research[ref];
        removed++;
      }
    }
  }, root);
  return removed;
}