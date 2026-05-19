/** One continuous loop per research-lane agent — parallel goals on the demo/benchmarks repo. */

import { agentLog } from "../agent-log.js";
import { isSdkSlotLockError } from "../backends/sdk-session-lock.js";
import { researchLaneAgentIds } from "../lanes/lane-agent-ids.js";
import { loadLaneState } from "../lanes/lane-state.js";
import { researchAgentIdleMs } from "../lanes/research-parallel.js";
import { researchAgentWorkerCycle } from "../lanes/research-lane.js";
import { shouldUseMock } from "../runner.js";
import type { AgentId } from "../types.js";
import { workerConsole } from "../worker/worker-console.js";
import {
  nextContinuousLoopDelayMs,
  sleepUntil,
} from "./continuous-agent-loop.js";

const workerAborts = new Map<AgentId, AbortController>();

async function researchHasPendingWork(agentId: AgentId): Promise<boolean> {
  const { pickResearchWorkForAgent } = await import("../lanes/research-lane.js");
  if (!loadLaneState().research_lane_enabled) return false;
  const work = await pickResearchWorkForAgent(agentId);
  return work !== null;
}

async function researchAgentLoop(
  agentId: AgentId,
  abort: AbortSignal,
  mock: boolean,
): Promise<void> {
  const startupDefer = Number(process.env.LI_RESEARCH_WORKER_STARTUP_DEFER_MS ?? process.env.LI_LANE_STARTUP_DELAY_MS ?? 3_000);
  const idleMs = researchAgentIdleMs(agentId);
  workerConsole(`research:${agentId}`, "info", `continuous research worker started — first cycle in ${startupDefer}ms`);
  await sleepUntil(abort, startupDefer);
  while (!abort.aborted) {
    try {
      let cycle;
      try {
        cycle = await researchAgentWorkerCycle(agentId, { mock });
      } catch (err) {
        if (isSdkSlotLockError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          workerConsole(`research:${agentId}`, "info", `waiting for sdk slot: ${msg}`);
          cycle = {
            skipped: true,
            skip_reason: "sdk session slots busy (waiting for slot)",
            agentId,
          };
        } else {
          throw err;
        }
      }

      const hasMore = cycle.skipped ? false : await researchHasPendingWork(agentId);
      const msg = cycle.skipped
        ? `idle: ${cycle.skip_reason}`
        : `goal=${cycle.goalId ?? "—"} status=${cycle.status}`;
      workerConsole(`research:${agentId}`, "info", msg);
      agentLog(`research:${agentId}`, "info", msg);

      const delayMs = nextContinuousLoopDelayMs({
        skipped: cycle.skipped,
        skip_reason: cycle.skip_reason,
        hasMoreWork: hasMore,
        idleMs,
      });
      await sleepUntil(abort, delayMs);
    } catch (err) {
      agentLog(
        `research:${agentId}`,
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
      await sleepUntil(abort, researchAgentIdleMs(agentId));
    }
  }
}

export function startResearchAgentWorkerPool(options?: { mock?: boolean }): {
  started: boolean;
  message: string;
  agents: AgentId[];
} {
  const agents = [...researchLaneAgentIds()];
  const mock = options?.mock ?? shouldUseMock(false);
  workerConsole(
    "research-pool",
    "info",
    `starting ${agents.length} parallel research workers`,
    agents.join(", "),
  );
  let started = 0;
  for (const agentId of agents) {
    if (workerAborts.has(agentId) && !workerAborts.get(agentId)!.signal.aborted) continue;
    const abort = new AbortController();
    workerAborts.set(agentId, abort);
    void researchAgentLoop(agentId, abort.signal, mock);
    started++;
  }
  return {
    started: started > 0,
    message: `research worker pool: ${started} parallel loops`,
    agents,
  };
}

export function stopResearchAgentWorkerPool(): { stopped: boolean; message: string } {
  if (workerAborts.size === 0) {
    return { stopped: false, message: "research worker pool not running" };
  }
  for (const abort of workerAborts.values()) abort.abort();
  workerAborts.clear();
  return { stopped: true, message: "research worker pool stopping" };
}

export function researchAgentWorkerPoolSnapshot(): {
  running: boolean;
  worker_count: number;
  agents: AgentId[];
} {
  const active = [...workerAborts.entries()].filter(([, a]) => !a.signal.aborted);
  return {
    running: active.length > 0,
    worker_count: active.length,
    agents: active.map(([id]) => id),
  };
}
