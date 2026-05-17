import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { agentsPackageRoot } from "../runner.js";
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";
import { buildHeapTaskQueue } from "../heap/task-queue.js";
import { hashBriefing } from "./briefing-hash.js";
import type { SupervisorOptions } from "../supervisor/loop.js";
import { assertRealBackendReady, shouldUseMock } from "../runner.js";
import { runSupervisorLoop, supervisorTick } from "../supervisor/loop.js";
import { pushSupervisorActivity } from "./supervisor-activity.js";
import { loadState, saveState } from "./state.js";
import type { ActiveAgentRun, AgentRunLifecycle, ControlPlaneState } from "./types.js";
import type { AgentId } from "../types.js";
import { runHandoffPhasedSwarm } from "../lanes/run-handoff-phases.js";
import { resolveSpawnWorkflowRepo } from "../handoffs/resolve-spawn-workflow-repo.js";

const activeRuns = new Map<string, ActiveAgentRun>();
const childByRunId = new Map<string, ChildProcess>();
let supervisorAbort: AbortController | null = null;
let supervisorLoopPromise: Promise<void> | null = null;
let supervisorChild: ChildProcess | null = null;

export function defaultSupervisorOptions(overrides?: Partial<SupervisorOptions>): SupervisorOptions {
  return {
    mock: shouldUseMock(false),
    once: false,
    force: false,
    forceFirstTick: true,
    intervalMs: Number(process.env.LI_SUPERVISOR_INTERVAL_MS ?? 120_000),
    cooldownMs: Number(process.env.LI_AGENTS_COOLDOWN_MS ?? 300_000),
    maxTasksPerTick: Number(process.env.LI_SUPERVISOR_MAX_TASKS ?? 3),
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
  if (supervisorChild) {
    return supervisorChild.exitCode === null && !supervisorChild.killed;
  }
  return supervisorAbort !== null && !supervisorAbort.signal.aborted;
}

function supervisorRunsAsSubprocess(): boolean {
  return process.env.LI_SUPERVISOR_IN_PROCESS !== "1";
}

function spawnSupervisorChild(options: SupervisorOptions): ChildProcess {
  const packageRoot = agentsPackageRoot();
  const benchmarksRoot = resolveBenchmarksRoot(options.benchmarksRoot);
  const cli = join(packageRoot, "dist/cli/supervisor.js");
  const args: string[] = [];
  if (benchmarksRoot) args.push("--benchmarks", benchmarksRoot);
  if (options.mock) args.push("--mock");
  args.push("--interval-ms", String(options.intervalMs));
  args.push("--cooldown-ms", String(options.cooldownMs));
  args.push("--max-tasks", String(options.maxTasksPerTick));

  const child = spawn(process.execPath, [cli, ...args], {
    cwd: benchmarksRoot ?? packageRoot,
    env: {
      ...process.env,
      LI_SUPERVISOR_FORCE_FIRST_TICK: "1",
      LI_AGENTS_COOLDOWN_MS: String(options.cooldownMs),
      LI_SUPERVISOR_INTERVAL_MS: String(options.intervalMs),
      LI_SUPERVISOR_MAX_TASKS: String(options.maxTasksPerTick),
    },
    stdio: "inherit",
    detached: false,
  });

  child.on("exit", (code, signal) => {
    supervisorChild = null;
    const s = loadState();
    s.supervisor_loop_running = false;
    s.supervisor_loop_started_at = undefined;
    saveState(s);
    pushSupervisorActivity(
      "info",
      `Supervisor process exited (code=${code ?? "?"} signal=${signal ?? ""})`,
    );
  });

  return child;
}

export function runtimeSnapshot(state: ControlPlaneState) {
  const loopRunning = isSupervisorLoopRunning() || Boolean(state.supervisor_loop_running);
  return {
    supervisor_loop_running: loopRunning,
    supervisor_loop_started_at: loopRunning ? (state.supervisor_loop_started_at ?? null) : null,
    stopped_agents: state.stopped_agents ?? [],
    current_supervisor_agent: state.current_supervisor_agent ?? null,
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
  options?: { workflowRepo?: string },
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
  const mock = shouldUseMock(false);
  const runId = `${agentId}-${Date.now()}`;
  const cli = join(packageRoot, "dist/cli/run-agent.js");
  const args = ["--agent", agentId];
  if (mock) args.push("--mock");
  if (benchmarksRoot) args.push("--benchmarks", benchmarksRoot);
  if (options?.workflowRepo) args.push("--workflow-repo", options.workflowRepo);

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
): Promise<{
  started: boolean;
  already_running?: boolean;
  message: string;
  started_at?: string;
  options?: SupervisorOptions;
}> {
  if (isSupervisorLoopRunning()) {
    const msg = "Supervisor loop is already running";
    pushSupervisorActivity("warn", msg);
    return { started: false, already_running: true, message: msg };
  }

  const state = loadState();
  const startedAt = new Date().toISOString();
  state.supervisor_loop_running = true;
  state.supervisor_loop_started_at = startedAt;
  saveState(state);

  const options = defaultSupervisorOptions(overrides);
  assertRealBackendReady(options.mock);

  if (supervisorRunsAsSubprocess()) {
    supervisorChild = spawnSupervisorChild(options);
    const pid = supervisorChild.pid ?? 0;
    const message = `Supervisor started (pid ${pid}, mock=${options.mock}, interval=${Math.round(options.intervalMs / 1000)}s) — agents run in background process`;
    pushSupervisorActivity("info", message, { pid, subprocess: true });
    return { started: true, message, started_at: startedAt, options };
  }

  supervisorAbort = new AbortController();
  const signal = supervisorAbort.signal;

  const message = `Supervisor loop started in-process (mock=${options.mock}, interval=${Math.round(options.intervalMs / 1000)}s, max ${options.maxTasksPerTick} agents/tick)`;
  pushSupervisorActivity("info", message, {
    mock: options.mock,
    interval_ms: options.intervalMs,
    cooldown_ms: options.cooldownMs,
    max_tasks_per_tick: options.maxTasksPerTick,
  });

  supervisorLoopPromise = (async () => {
    try {
      await runSupervisorLoop(options, signal);
    } finally {
      const s = loadState();
      s.supervisor_loop_running = false;
      s.supervisor_loop_started_at = undefined;
      saveState(s);
      supervisorAbort = null;
      supervisorLoopPromise = null;
      pushSupervisorActivity("info", "Supervisor loop stopped");
    }
  })();

  return { started: true, message, started_at: startedAt, options };
}

export async function stopSupervisorLoop(): Promise<{ stopped: boolean; message: string }> {
  if (!isSupervisorLoopRunning()) {
    const message = "Supervisor loop was not running";
    pushSupervisorActivity("warn", message);
    return { stopped: false, message };
  }
  pushSupervisorActivity("info", "Stopping supervisor loop…");
  if (supervisorChild) {
    try {
      supervisorChild.kill("SIGTERM");
      setTimeout(() => {
        if (supervisorChild && !supervisorChild.killed) supervisorChild.kill("SIGKILL");
      }, 5_000);
    } catch {
      /* dead */
    }
    supervisorChild = null;
    const state = loadState();
    state.supervisor_loop_running = false;
    state.supervisor_loop_started_at = undefined;
    saveState(state);
    return { stopped: true, message: "Supervisor process stopped" };
  }
  supervisorAbort?.abort();
  if (supervisorLoopPromise) {
    await supervisorLoopPromise.catch(() => undefined);
  }
  const state = loadState();
  state.supervisor_loop_running = false;
  state.supervisor_loop_started_at = undefined;
  saveState(state);
  return { stopped: true, message: "Supervisor loop stopped" };
}

/** Fire-and-forget: handoff phases or parallel leaf spawns. */
export async function runAllAgentsNow(): Promise<{
  spawned: ActiveAgentRun[];
  skipped: Array<{ agent: AgentId; reason: string }>;
  handoff_phases?: Awaited<ReturnType<typeof runHandoffPhasedSwarm>>;
}> {
  if (process.env.LI_SWARM_HANDOFF_PHASES !== "0") {
    const mock = shouldUseMock(false);
    const phases = await runHandoffPhasedSwarm({ mock });
    return { spawned: [], skipped: [], handoff_phases: phases };
  }

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
    const workflowRepo =
      agentId === "code_implementer" ? await resolveSpawnWorkflowRepo(agentId) : undefined;
    const result = spawnAgentRun(agentId, "swarm run-all", { workflowRepo });
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
