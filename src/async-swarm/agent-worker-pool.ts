/** Continuous per-agent workers — parallel loops; wait for SDK slots (no tick gating). */

import { agentLog } from "../agent-log.js";
import {
  buildAgentWorkQueue,
  peekAgentWorkQueueSnapshot,
  pickNextWorkForAgent,
  scheduleAgentWorkQueueRefresh,
} from "../control-plane/agent-work-queue.js";
import {
  pickProactiveWorkForAgent,
  recordProactiveAgentRun,
  sortWorkerAgentsByEligibleGoals,
} from "../control-plane/proactive-agent-work.js";
import { loadState } from "../control-plane/state.js";
import { asyncWorkerAgentIds } from "../lanes/lane-agent-ids.js";
import { resolveSpawnWorkflowRepo } from "../handoffs/resolve-spawn-workflow-repo.js";
import { isSdkSlotLockError, sdkSlotLikelyAvailable } from "../backends/sdk-session-lock.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import type { AgentId } from "../types.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  continuousIdleMs,
  nextContinuousLoopDelayMs,
  sleepUntil,
} from "./continuous-agent-loop.js";
import { swarmWorkersPaused } from "../swarm/swarm-worker-pause.js";

export {
  IMPLEMENT_LANE_AGENTS,
  asyncWorkerAgentIds,
  researchLaneAgentIds,
} from "../lanes/lane-agent-ids.js";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function agentWorkerIdleMs(agentId: AgentId): number {
  const base = continuousIdleMs(180_000);
  const stagger = Math.abs(hashString(agentId)) % 45_000;
  return base + stagger;
}

/** @deprecated Use agentWorkerIdleMs — kept for callers expecting interval naming. */
export function agentWorkerIntervalMs(agentId: AgentId): number {
  return agentWorkerIdleMs(agentId);
}

export interface AgentWorkerCycleResult {
  skipped: boolean;
  skip_reason?: string;
  status?: string;
  work_kind?: "queued" | "proactive";
  pending_for_agent?: number;
}

export async function agentHasPendingWork(agentId: AgentId): Promise<boolean> {
  const state = loadState();
  if ((state.stopped_agents ?? []).includes(agentId)) return false;
  const lightOpts = { light: true as const };
  let queue = peekAgentWorkQueueSnapshot(state, lightOpts);
  if (!queue) {
    queue = await buildAgentWorkQueue(state, lightOpts);
  }
  const pending = (queue.by_agent[agentId] ?? []).filter((i) => i.status === "pending").length;
  if (pending > 0) return true;
  return pickProactiveWorkForAgent(agentId) !== null;
}

export async function agentWorkerCycle(
  agentId: AgentId,
  options?: { mock?: boolean },
): Promise<AgentWorkerCycleResult> {
  if (swarmWorkersPaused()) {
    return { skipped: true, skip_reason: "worker pool paused (LI_SWARM_PAUSE_WORKERS)" };
  }

  const state = loadState();
  if ((state.stopped_agents ?? []).includes(agentId)) {
    return { skipped: true, skip_reason: "agent stopped" };
  }
  if (!sdkSlotLikelyAvailable()) {
    return {
      skipped: true,
      skip_reason: "sdk session slots busy (waiting for slot)",
    };
  }

  const lightOpts = { light: true as const };
  let queue = peekAgentWorkQueueSnapshot(state, lightOpts);
  if (!queue) {
    queue = await buildAgentWorkQueue(state, lightOpts);
  } else {
    scheduleAgentWorkQueueRefresh(state, lightOpts);
  }
  const next = pickNextWorkForAgent(agentId, queue);
  const proactive = next ? null : pickProactiveWorkForAgent(agentId);
  const work = next ?? proactive;
  const pendingForAgent = (queue.by_agent[agentId] ?? []).filter((i) => i.status === "pending").length;
  if (!work) {
    return {
      skipped: true,
      skip_reason: "no queued work for this agent",
      pending_for_agent: pendingForAgent,
    };
  }

  const mock = options?.mock ?? shouldUseMock(false);
  const benchmarksRoot = resolveBenchmarksRoot();
  const packageRoot = agentsPackageRoot();
  const workflowRepo = await resolveSpawnWorkflowRepo(agentId);

  let result;
  try {
    result = await runAgent({
      agentId,
      cwd: benchmarksRoot ?? packageRoot,
      benchmarksRoot,
      mock,
      dryRun: false,
      workflowRepo,
      extraInstruction: next
        ? `## Queued task\n\n${next.reason}\n\nSource: ${next.source} · id: ${next.id}`
        : `## Proactive run\n\n${proactive!.reason}\n\nSource: ${proactive!.source}`,
    });
  } catch (err) {
    if (isSdkSlotLockError(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      workerConsole(`pool:${agentId}`, "info", `waiting for sdk slot: ${msg}`);
      return {
        skipped: true,
        skip_reason: "sdk session slots busy (waiting for slot)",
        pending_for_agent: pendingForAgent,
      };
    }
    throw err;
  }

  if (proactive) recordProactiveAgentRun(agentId);

  if (result.status === "error" && isSdkSlotLockError(result.error)) {
    return {
      skipped: true,
      skip_reason: "sdk session slots busy (waiting for slot)",
      pending_for_agent: pendingForAgent,
    };
  }

  return {
    skipped: false,
    status: result.status,
    work_kind: next ? "queued" : "proactive",
    pending_for_agent: pendingForAgent,
  };
}

/** @deprecated Alias for agentWorkerCycle */
export const agentWorkerTick = agentWorkerCycle;

const workerAborts = new Map<AgentId, AbortController>();

async function agentWorkerLoop(agentId: AgentId, abort: AbortSignal, mock: boolean): Promise<void> {
  const startupDefer = Number(process.env.LI_WORKER_STARTUP_DEFER_MS ?? 0);
  const staggerCap = Number(process.env.LI_WORKER_STAGGER_MAX_MS ?? 20_000);
  const stagger = Math.abs(hashString(agentId)) % (Number.isFinite(staggerCap) && staggerCap > 0 ? staggerCap : 20_000);
  const waitMs = startupDefer + stagger;
  const idleMs = agentWorkerIdleMs(agentId);
  workerConsole(`pool:${agentId}`, "info", `continuous worker started — first cycle in ${waitMs}ms`);
  await sleepUntil(abort, waitMs);
  while (!abort.aborted) {
    try {
      const cycle = await agentWorkerCycle(agentId, { mock });
      const hasMore = cycle.skipped ? false : await agentHasPendingWork(agentId);
      const msg = cycle.skipped
        ? `idle: ${cycle.skip_reason} (pending=${cycle.pending_for_agent ?? 0})`
        : `run ${cycle.work_kind ?? "work"} status=${cycle.status}`;
      workerConsole(`pool:${agentId}`, "info", msg);
      agentLog(`worker:${agentId}`, "info", msg);
      const delayMs = nextContinuousLoopDelayMs({
        skipped: cycle.skipped,
        skip_reason: cycle.skip_reason,
        hasMoreWork: hasMore,
        idleMs,
      });
      await sleepUntil(abort, delayMs);
    } catch (err) {
      agentLog(
        `worker:${agentId}`,
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
      await sleepUntil(abort, continuousIdleMs(30_000));
    }
  }
}

export function startAgentWorkerPool(options?: { mock?: boolean }): {
  started: boolean;
  message: string;
  agents: AgentId[];
} {
  if (swarmWorkersPaused()) {
    return {
      started: false,
      message: "agent worker pool paused (LI_SWARM_PAUSE_WORKERS)",
      agents: [],
    };
  }

  const agents = sortWorkerAgentsByEligibleGoals(asyncWorkerAgentIds());
  const mock = options?.mock ?? shouldUseMock(false);
  workerConsole(
    "worker-pool",
    "info",
    `starting ${agents.length} continuous agent workers`,
    `defer_ms=${process.env.LI_WORKER_STARTUP_DEFER_MS ?? "0"} idle_ms=${process.env.LI_ASYNC_AGENT_IDLE_MS ?? process.env.LI_ASYNC_AGENT_INTERVAL_MS ?? "180000"}`,
  );
  let started = 0;
  for (const agentId of agents) {
    if (workerAborts.has(agentId) && !workerAborts.get(agentId)!.signal.aborted) continue;
    const abort = new AbortController();
    workerAborts.set(agentId, abort);
    void agentWorkerLoop(agentId, abort.signal, mock).catch((err) => {
      agentLog(
        `worker:${agentId}`,
        "ERROR",
        `worker loop exited: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    started++;
  }
  return {
    started: started > 0,
    message: `agent worker pool: ${started} continuous loops`,
    agents,
  };
}

export function stopAgentWorkerPool(): { stopped: boolean; message: string } {
  if (workerAborts.size === 0) {
    return { stopped: false, message: "agent worker pool not running" };
  }
  for (const abort of workerAborts.values()) abort.abort();
  workerAborts.clear();
  return { stopped: true, message: "agent worker pool stopping" };
}

export function agentWorkerPoolSnapshot(): {
  running: boolean;
  worker_count: number;
  agents: AgentId[];
  paused: boolean;
} {
  const paused = swarmWorkersPaused();
  const active = [...workerAborts.entries()].filter(([, a]) => !a.signal.aborted);
  return {
    running: !paused && active.length > 0,
    worker_count: paused ? 0 : active.length,
    agents: paused ? [] : active.map(([id]) => id),
    paused,
  };
}
