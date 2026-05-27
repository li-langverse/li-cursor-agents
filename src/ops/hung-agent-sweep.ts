/**
 * Detect and optionally terminate hung agent processes while preserving
 * dashboard + systemd async-swarm trees (unless --force).
 */

import { execFile, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { reclaimAllStaleSdkSlots } from "../backends/sdk-session-lock.js";
import { dbEnabled } from "../db/client.js";
import { reconcileUnregisteredRunningAgentRuns } from "../db/reconcile-stale-runs.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { agentsPackageRoot } from "../runner.js";
import { listUserPlanLoopUnits, systemctlUserIsActive } from "../swarm/systemd-probe.js";

const execFileAsync = promisify(execFile);

export type SweepActionKind =
  | "reclaim_sdk_slot"
  | "kill_run_agent"
  | "kill_orphan_async_swarm"
  | "kill_plan_loop_python";

export interface SweepCandidate {
  kind: SweepActionKind;
  pid: number;
  reason: string;
  cmdline?: string;
  protected?: boolean;
}

export interface HungAgentSweepOptions {
  dryRun?: boolean;
  apply?: boolean;
  force?: boolean;
}

export interface HungAgentSweepReport {
  dry_run: boolean;
  apply: boolean;
  force: boolean;
  sdk_slots_reclaimed: number;
  unregistered_runs_reconciled: number;
  candidates: SweepCandidate[];
  executed: SweepCandidate[];
  skipped_protected: SweepCandidate[];
}

const ASYNC_SWARM_UNIT = "li-agents-async-swarm.service";
const DASHBOARD_UNIT = "li-agents-dashboard.service";

function envMs(key: string, fallback: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function sweepMaxRunAgeMs(): number {
  return envMs("LI_AGENT_MAX_RUN_AGE_MS", 7_200_000);
}

export function sweepLogIdleMs(): number {
  return envMs("LI_SWEEP_GRACE_MS", 1_800_000);
}

function processAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code !== "ESRCH" && code !== "EINVAL";
  }
}

function readCmdline(pid: number): string {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return raw.replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

function processAgeMs(pid: number): number {
  try {
    const st = statSync(`/proc/${pid}`);
    return Date.now() - st.mtimeMs;
  } catch {
    return 0;
  }
}

function parentPid(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.indexOf(")");
    if (close < 0) return null;
    const rest = stat.slice(close + 2).trim().split(/\s+/);
    const ppid = Number(rest[1]);
    return Number.isFinite(ppid) ? ppid : null;
  } catch {
    return null;
  }
}

function isDescendantOf(pid: number, ancestor: number): boolean {
  if (pid === ancestor) return true;
  let cur = pid;
  for (let depth = 0; depth < 64; depth++) {
    const ppid = parentPid(cur);
    if (ppid == null || ppid <= 1) return false;
    if (ppid === ancestor) return true;
    cur = ppid;
  }
  return false;
}

async function systemdMainPid(unit: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "systemctl",
      ["--user", "show", unit, "-p", "MainPID", "--value"],
      { timeout: 8_000 },
    );
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function listMatchingPids(pattern: RegExp): Array<{ pid: number; cmdline: string }> {
  const out = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8", timeout: 15_000 });
  if (out.status !== 0 || !out.stdout) return [];
  const rows: Array<{ pid: number; cmdline: string }> = [];
  for (const line of out.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const cmdline = m[2] ?? "";
    if (!Number.isFinite(pid) || !pattern.test(cmdline)) continue;
    rows.push({ pid, cmdline });
  }
  return rows;
}

function logFilesForPid(pid: number): string[] {
  const dir = `/proc/${pid}/fd`;
  const paths: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const target = readFileSync(join(dir, name), "utf8").trim();
        if (target.includes(".log") || target.includes("/logs/") || target.includes("/data/runs")) {
          paths.push(target);
        }
      } catch {
        /* symlink read may fail */
      }
    }
  } catch {
    /* */
  }
  return [...new Set(paths)];
}

/** True when all tracked log paths are older than idleMs (no recent writes). */
export function logIdleExceeds(pid: number, idleMs: number): boolean {
  const files = logFilesForPid(pid);
  if (files.length === 0) {
    return processAgeMs(pid) >= idleMs;
  }
  const now = Date.now();
  for (const path of files) {
    try {
      const st = statSync(path);
      if (now - st.mtimeMs < idleMs) return false;
    } catch {
      /* missing file — treat as idle */
    }
  }
  return true;
}

function readDetachedSwarmPid(root: string): number | null {
  const path = join(root, "logs", "async-swarm.pid");
  if (!existsSync(path)) return null;
  const n = Number(readFileSync(path, "utf8").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function buildProtectedPids(root: string, force: boolean): Promise<Set<number>> {
  const protected_ = new Set<number>();
  if (force) return protected_;

  const dashboardMain = await systemdMainPid(DASHBOARD_UNIT);
  const asyncMain = await systemdMainPid(ASYNC_SWARM_UNIT);
  const detachedPid = readDetachedSwarmPid(root);

  for (const { pid, cmdline } of listMatchingPids(/serve-dashboard\.js/)) {
    if (!processAlive(pid)) continue;
    protected_.add(pid);
    collectDescendants(pid, protected_);
  }

  if (dashboardMain != null && processAlive(dashboardMain)) {
    protected_.add(dashboardMain);
    collectDescendants(dashboardMain, protected_);
  }

  if (asyncMain != null && processAlive(asyncMain)) {
    protected_.add(asyncMain);
    collectDescendants(asyncMain, protected_);
  }

  if (detachedPid != null && processAlive(detachedPid)) {
    protected_.add(detachedPid);
    collectDescendants(detachedPid, protected_);
  }

  return protected_;
}

function buildParentMap(): Map<number, number> {
  const map = new Map<number, number>();
  const out = spawnSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8", timeout: 15_000 });
  if (out.status !== 0 || !out.stdout) return map;
  for (const line of out.stdout.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)/);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    if (Number.isFinite(pid) && Number.isFinite(ppid)) map.set(pid, ppid);
  }
  return map;
}

function collectDescendants(rootPid: number, into: Set<number>): void {
  const parents = buildParentMap();
  for (const [pid] of parents) {
    if (pid === rootPid) continue;
    let cur = pid;
    for (let depth = 0; depth < 64; depth++) {
      const ppid = parents.get(cur);
      if (ppid == null || ppid <= 1) break;
      if (ppid === rootPid) {
        into.add(pid);
        break;
      }
      cur = ppid;
    }
  }
}

function isProtected(pid: number, protected_: Set<number>): boolean {
  for (const ancestor of protected_) {
    if (pid === ancestor || isDescendantOf(pid, ancestor)) return true;
  }
  return false;
}

function findHungRunAgents(
  protected_: Set<number>,
  maxRunAgeMs: number,
  logIdleMs: number,
): SweepCandidate[] {
  const out: SweepCandidate[] = [];
  for (const { pid, cmdline } of listMatchingPids(/run-agent\.js/)) {
    if (!processAlive(pid)) continue;
    const age = processAgeMs(pid);
    if (age < maxRunAgeMs) continue;
    if (!logIdleExceeds(pid, logIdleMs)) continue;
    const prot = isProtected(pid, protected_);
    out.push({
      kind: "kill_run_agent",
      pid,
      cmdline,
      protected: prot,
      reason: `run-agent age ${Math.round(age / 60_000)}m, log idle ≥${Math.round(logIdleMs / 60_000)}m`,
    });
  }
  return out;
}

function findOrphanAsyncSwarms(protected_: Set<number>): SweepCandidate[] {
  const out: SweepCandidate[] = [];
  for (const { pid, cmdline } of listMatchingPids(/async-swarm\.js/)) {
    if (!processAlive(pid)) continue;
    const prot = isProtected(pid, protected_);
    if (prot) continue;
    out.push({
      kind: "kill_orphan_async_swarm",
      pid,
      cmdline,
      protected: false,
      reason: "async-swarm not under systemd li-agents-async-swarm, dashboard, or logs/async-swarm.pid",
    });
  }
  return out;
}

async function findStragglerPlanLoops(): Promise<SweepCandidate[]> {
  const units = await listUserPlanLoopUnits();
  const activeUnits: string[] = [];
  for (const unit of units) {
    const state = await systemctlUserIsActive(unit);
    if (state === "active" || state === "activating") activeUnits.push(unit);
  }
  if (activeUnits.length > 0) return [];

  const out: SweepCandidate[] = [];
  for (const { pid, cmdline } of listMatchingPids(/plan-loop\.py/)) {
    if (!processAlive(pid)) continue;
    out.push({
      kind: "kill_plan_loop_python",
      pid,
      cmdline,
      reason: "legacy plan-loop.py with no active li-*-plan-loop systemd units",
    });
  }
  return out;
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* sync wait for SIGTERM grace */
  }
}

function killPidGraceful(pid: number, graceMs: number): void {
  if (!processAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return;
    sleepMs(200);
  }
  if (processAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* */
    }
  }
}

export function formatHungAgentSweepReport(report: HungAgentSweepReport): string {
  const lines: string[] = [
    `hung-agent sweep (dry_run=${report.dry_run} apply=${report.apply} force=${report.force})`,
    `sdk_slots_reclaimed: ${report.sdk_slots_reclaimed}`,
  ];
  if (report.candidates.length === 0) {
    lines.push("candidates: none");
  } else {
    lines.push("candidates:");
    for (const c of report.candidates) {
      const tag = c.protected ? " [PROTECTED]" : "";
      lines.push(`  - ${c.kind} pid=${c.pid}${tag}: ${c.reason}`);
      if (c.cmdline) lines.push(`      ${c.cmdline.slice(0, 200)}`);
    }
  }
  if (report.executed.length) {
    lines.push("executed:");
    for (const c of report.executed) {
      lines.push(`  - ${c.kind} pid=${c.pid}: ${c.reason}`);
    }
  }
  if (report.skipped_protected.length) {
    lines.push(`skipped_protected: ${report.skipped_protected.length} (use --force to kill)`);
  }
  if (report.unregistered_runs_reconciled > 0) {
    lines.push(`unregistered_runs_reconciled: ${report.unregistered_runs_reconciled}`);
  }
  return lines.join("\n");
}

export async function runHungAgentSweep(
  options: HungAgentSweepOptions = {},
): Promise<HungAgentSweepReport> {
  const apply = options.apply === true;
  const dryRun = !apply;
  const force = options.force === true;
  const root = agentsPackageRoot();
  const maxRunAgeMs = sweepMaxRunAgeMs();
  const logIdleMs = sweepLogIdleMs();
  const killGraceMs = envMs("LI_SWEEP_KILL_GRACE_MS", 15_000);

  const protected_ = await buildProtectedPids(root, force);
  const sdkReclaimed = reclaimAllStaleSdkSlots();

  const candidates: SweepCandidate[] = [
    ...findHungRunAgents(protected_, maxRunAgeMs, logIdleMs),
    ...findOrphanAsyncSwarms(protected_),
    ...(await findStragglerPlanLoops()),
  ];

  const executed: SweepCandidate[] = [];
  const skipped_protected: SweepCandidate[] = [];

  for (const c of candidates) {
    if (c.protected && !force) {
      skipped_protected.push(c);
      continue;
    }
    if (dryRun) continue;
    if (c.kind === "kill_run_agent" || c.kind === "kill_orphan_async_swarm" || c.kind === "kill_plan_loop_python") {
      killPidGraceful(c.pid, killGraceMs);
      executed.push(c);
    }
  }

  let unregistered_runs_reconciled = 0;
  if (apply && dbEnabled()) {
    try {
      const asyncState = await systemctlUserIsActive(ASYNC_SWARM_UNIT);
      const swarmUnitActive = asyncState === "active" || asyncState === "activating";
      if (swarmUnitActive) {
        const worker = await loadWorkerStatusFromDb();
        const registeredIds = (worker?.active_runs ?? [])
          .filter((r) => r.status === "running")
          .map((r) => r.run_id);
        unregistered_runs_reconciled = await reconcileUnregisteredRunningAgentRuns(registeredIds, {
          worker,
          force: true,
        });
      }
    } catch {
      /* best-effort — sweep still reports process cleanup */
    }
  }

  return {
    dry_run: dryRun,
    apply,
    force,
    sdk_slots_reclaimed: sdkReclaimed,
    unregistered_runs_reconciled,
    candidates,
    executed,
    skipped_protected,
  };
}
