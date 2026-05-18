/** Continuous per-agent ticks — parallel loops, SDK lock serializes LLM runs. */

import { agentLog } from "../agent-log.js";
import { withGlobalSdkSessionLock } from "../backends/sdk-session-lock.js";
import { loadState } from "../control-plane/state.js";
import { isHandoffRunInProgress } from "../lanes/handoff-run-coordinator.js";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { resolveSpawnWorkflowRepo } from "../handoffs/resolve-spawn-workflow-repo.js";
import { loadResearchGoals, resolveGoalAgent } from "../research-goals/load-goals.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import type { AgentId } from "../types.js";

export const IMPLEMENT_LANE_AGENTS = new Set<AgentId>(["code_implementer", "package_architect"]);

export function researchLaneAgentIds(): Set<AgentId> {
  const ids = new Set<AgentId>();
  for (const g of loadResearchGoals()) {
    if (g.enabled === false) continue;
    ids.add(resolveGoalAgent(g));
  }
  return ids;
}

/** Leaf agents run by the async worker pool (lanes own research + implement). */
export function asyncWorkerAgentIds(): AgentId[] {
  const research = researchLaneAgentIds();
  return AGENT_REGISTRY.map((a) => a.id).filter(
    (id) =>
      id !== "orchestrator" &&
      !IMPLEMENT_LANE_AGENTS.has(id) &&
      !research.has(id),
  );
}

export function agentWorkerIntervalMs(agentId: AgentId): number {
  const base = Number(process.env.LI_ASYNC_AGENT_INTERVAL_MS ?? 180_000);
  const floor = Number.isFinite(base) && base >= 30_000 ? base : 180_000;
  const stagger = Math.abs(hashString(agentId)) % 45_000;
  return floor + stagger;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export interface AgentWorkerTickResult {
  skipped: boolean;
  skip_reason?: string;
  status?: string;
}

export async function agentWorkerTick(
  agentId: AgentId,
  options?: { mock?: boolean },
): Promise<AgentWorkerTickResult> {
  const state = loadState();
  if ((state.stopped_agents ?? []).includes(agentId)) {
    return { skipped: true, skip_reason: "agent stopped" };
  }
  if (isHandoffRunInProgress()) {
    return { skipped: true, skip_reason: "handoff run-all in progress" };
  }

  const mock = options?.mock ?? shouldUseMock(false);
  const benchmarksRoot = resolveBenchmarksRoot();
  const packageRoot = agentsPackageRoot();
  const workflowRepo = await resolveSpawnWorkflowRepo(agentId);

  const result = await withGlobalSdkSessionLock(() =>
    runAgent({
      agentId,
      cwd: benchmarksRoot ?? packageRoot,
      benchmarksRoot,
      mock,
      dryRun: false,
      workflowRepo,
    }),
  );

  return { skipped: false, status: result.status };
}

const workerAborts = new Map<AgentId, AbortController>();

function sleepUntil(abort: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (abort.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    abort.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

async function agentWorkerLoop(agentId: AgentId, abort: AbortSignal, mock: boolean): Promise<void> {
  await sleepUntil(abort, Math.abs(hashString(agentId)) % 20_000);
  while (!abort.aborted) {
    try {
      const tick = await agentWorkerTick(agentId, { mock });
      agentLog(
        `worker:${agentId}`,
        tick.skipped ? "info" : "info",
        tick.skipped ? `skipped: ${tick.skip_reason}` : `tick status=${tick.status}`,
      );
    } catch (err) {
      agentLog(
        `worker:${agentId}`,
        "ERROR",
        err instanceof Error ? err.message : String(err),
      );
    }
    await sleepUntil(abort, agentWorkerIntervalMs(agentId));
  }
}

export function startAgentWorkerPool(options?: { mock?: boolean }): {
  started: boolean;
  message: string;
  agents: AgentId[];
} {
  const agents = asyncWorkerAgentIds();
  const mock = options?.mock ?? shouldUseMock(false);
  let started = 0;
  for (const agentId of agents) {
    if (workerAborts.has(agentId) && !workerAborts.get(agentId)!.signal.aborted) continue;
    const abort = new AbortController();
    workerAborts.set(agentId, abort);
    void agentWorkerLoop(agentId, abort.signal, mock);
    started++;
  }
  return {
    started: started > 0,
    message: `agent worker pool: ${started} loops`,
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
} {
  const active = [...workerAborts.entries()].filter(([, a]) => !a.signal.aborted);
  return {
    running: active.length > 0,
    worker_count: active.length,
    agents: active.map(([id]) => id),
  };
}
