import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { agentsPackageRoot } from "../runner.js";
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";
import { buildHeapTaskQueue } from "../heap/task-queue.js";
import { hashBriefing } from "./briefing-hash.js";
import type { SupervisorOptions } from "../supervisor/loop.js";
import { runSupervisorLoop, supervisorTick } from "../supervisor/loop.js";
import { loadState, saveState } from "./state.js";
import type { ActiveAgentRun, AgentRunLifecycle, ControlPlaneState } from "./types.js";
import type { AgentId } from "../types.js";

const activeRuns = new Map<string, ActiveAgentRun>();
const childByRunId = new Map<string, ChildProcess>();
let supervisorAbort: AbortController | null = null;
let supervisorLoopPromise: Promise<void> | null = null;

export function defaultSupervisorOptions(overrides?: Partial<SupervisorOptions>): SupervisorOptions {
  return {
    mock: process.env.CURSOR_MOCK === "1" || process.env.CURSOR_MOCK === "true",
    once: false,
    force: false,
    intervalMs: Number(process.env.LI_SUPERVISOR_INTERVAL_MS ?? 300_000),
    cooldownMs: Number(process.env.LI_AGENTS_COOLDOWN_MS ?? 1_800_000),
    maxTasksPerTick: Number(process.env.LI_SUPERVISOR_MAX_TASKS ?? 2),
    benchmarksRoot: resolveBenchmarksRoot(),
    skipSlowPreflight: false,
    ...overrides,
  };
}

export function listActiveRuns(): ActiveAgentRun[] {
  return [...activeRuns.values()].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
}

/** Track in-process supervisor runs (same map as spawnAgentRun child processes). */
export function registerSupervisorRun(agentId: AgentId, reason: string): string {
  const runId = `${agentId}-supervisor-${Date.now()}`;
  activeRuns.set(runId, {
    run_id: runId,
    agent_id: agentId,
    pid: process.pid,
    started_at: new Date().toISOString(),
    status: "running",
    reason,
  });
  return runId;
}

export function completeSupervisorRun(runId: string, status: AgentRunLifecycle): void {
  setRunStatus(runId, status);
  setTimeout(() => clearRun(runId), 30_000);
}

export function isSupervisorLoopRunning(): boolean {
  return supervisorAbort !== null && !supervisorAbort.signal.aborted;
}

export function runtimeSnapshot(state: ControlPlaneState) {
  return {
    supervisor_loop_running: isSupervisorLoopRunning() || Boolean(state.supervisor_loop_running),
    stopped_agents: state.stopped_agents ?? [],
    active_runs: listActiveRuns(),
    active_run_count: activeRuns.size,
  };
}

function setRunStatus(runId: string, status: AgentRunLifecycle): void {
  const row = activeRuns.get(runId);
  if (row) row.status = status;
}

function clearRun(runId: string): void {
  activeRuns.delete(runId);
  childByRunId.delete(runId);
}

export function spawnAgentRun(
  agentId: AgentId,
  reason = "dashboard manual start",
): { ok: true; run: ActiveAgentRun } | { ok: false; error: string } {
  const state = loadState();
  if ((state.stopped_agents ?? []).includes(agentId)) {
    return { ok: false, error: `agent ${agentId} is stopped — resume before start` };
  }
  const running = [...activeRuns.values()].find((r) => r.agent_id === agentId && r.status === "running");
  if (running) {
    return { ok: false, error: `agent ${agentId} already running (${running.run_id})` };
  }

  const packageRoot = agentsPackageRoot();
  const benchmarksRoot = resolveBenchmarksRoot();
  const mock = defaultSupervisorOptions().mock;
  const runId = `${agentId}-${Date.now()}`;
  const cli = join(packageRoot, "dist/cli/run-agent.js");
  const args = ["--agent", agentId];
  if (mock) args.push("--mock");
  if (benchmarksRoot) args.push("--benchmarks", benchmarksRoot);

  const child = spawn(process.execPath, [cli, ...args], {
    cwd: benchmarksRoot ?? packageRoot,
    env: { ...process.env },
    stdio: "ignore",
    detached: false,
  });

  const run: ActiveAgentRun = {
    run_id: runId,
    agent_id: agentId,
    pid: child.pid ?? 0,
    started_at: new Date().toISOString(),
    status: "running",
    reason,
  };
  activeRuns.set(runId, run);
  childByRunId.set(runId, child);

  const onDone = (status: AgentRunLifecycle) => {
    setRunStatus(runId, status);
    setTimeout(() => clearRun(runId), 30_000);
  };

  child.on("error", () => onDone("error"));
  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGKILL") onDone("cancelled");
    else if (code === 0) onDone("finished");
    else onDone("error");
  });

  return { ok: true, run };
}

export function stopAgent(agentId: AgentId, killRunning = true): ControlPlaneState {
  const state = loadState();
  const stopped = new Set(state.stopped_agents ?? []);
  stopped.add(agentId);
  state.stopped_agents = [...stopped];

  if (killRunning) {
    for (const [runId, run] of activeRuns) {
      if (run.agent_id === agentId && run.status === "running") {
        cancelRun(runId);
      }
    }
  }

  saveState(state);
  return state;
}

export function resumeAgent(agentId: AgentId): ControlPlaneState {
  const state = loadState();
  state.stopped_agents = (state.stopped_agents ?? []).filter((id) => id !== agentId);
  saveState(state);
  return state;
}

export function cancelRun(runId: string): boolean {
  const child = childByRunId.get(runId);
  const run = activeRuns.get(runId);
  if (!child || !run) return false;
  try {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 5_000);
  } catch {
    /* already dead */
  }
  setRunStatus(runId, "cancelled");
  return true;
}

export async function startSupervisorLoop(
  overrides?: Partial<SupervisorOptions>,
): Promise<{ started: boolean; already_running?: boolean }> {
  if (isSupervisorLoopRunning()) {
    return { started: false, already_running: true };
  }

  const state = loadState();
  state.supervisor_loop_running = true;
  saveState(state);

  const options = defaultSupervisorOptions(overrides);
  supervisorAbort = new AbortController();
  const signal = supervisorAbort.signal;

  supervisorLoopPromise = (async () => {
    try {
      await runSupervisorLoop(options, signal);
    } finally {
      const s = loadState();
      s.supervisor_loop_running = false;
      saveState(s);
      supervisorAbort = null;
      supervisorLoopPromise = null;
    }
  })();

  return { started: true };
}

export async function stopSupervisorLoop(): Promise<void> {
  supervisorAbort?.abort();
  if (supervisorLoopPromise) {
    await supervisorLoopPromise.catch(() => undefined);
  }
  const state = loadState();
  state.supervisor_loop_running = false;
  saveState(state);
}

/** Fire-and-forget: spawn every leaf agent once (parallel processes). */
export async function runAllAgentsNow(): Promise<{
  spawned: ActiveAgentRun[];
  skipped: Array<{ agent: AgentId; reason: string }>;
}> {
  const options = defaultSupervisorOptions({ once: true, force: true });
  const benchmarksRoot = options.benchmarksRoot;
  const preflight = runPreflight(benchmarksRoot, options.skipSlowPreflight !== false);
  const briefing = preflight.briefing;
  const briefingHash = hashBriefing(briefing);
  const state = loadState();
  const stopped = new Set(state.stopped_agents ?? []);

  const { tasks } = buildHeapTaskQueue(briefing, state, {
    briefingHash,
    cooldownMs: 0,
    maxTasks: 100,
  });

  const agentIds = new Set<AgentId>();
  for (const t of tasks) agentIds.add(t.agentId);
  if (agentIds.size === 0) {
    for (const a of AGENT_REGISTRY) {
      if (a.id !== "orchestrator") agentIds.add(a.id);
    }
  }

  const spawned: ActiveAgentRun[] = [];
  const skipped: Array<{ agent: AgentId; reason: string }> = [];

  for (const agentId of agentIds) {
    if (stopped.has(agentId)) {
      skipped.push({ agent: agentId, reason: "stopped" });
      continue;
    }
    const result = spawnAgentRun(agentId, "swarm run-all");
    if (result.ok) spawned.push(result.run);
    else skipped.push({ agent: agentId, reason: result.error });
  }

  return { spawned, skipped };
}

/** One supervisor tick from dashboard (blocking). */
export async function runOneTick(overrides?: Partial<SupervisorOptions>) {
  return supervisorTick(defaultSupervisorOptions({ once: true, force: true, ...overrides }));
}

export async function stopAllActiveRuns(): Promise<number> {
  let n = 0;
  for (const runId of [...activeRuns.keys()]) {
    if (cancelRun(runId)) n += 1;
  }
  return n;
}
