import { laneRuntimeSnapshot } from "../lanes/lane-runtime.js";
import { agentWorkerPoolSnapshot, asyncWorkerAgentIds } from "./agent-worker-pool.js";

let asyncSwarmRunning = false;
let asyncSwarmStartedAt: string | null = null;

export function setAsyncSwarmRunning(running: boolean): void {
  asyncSwarmRunning = running;
  asyncSwarmStartedAt = running ? new Date().toISOString() : null;
}

export function isAsyncSwarmRunning(): boolean {
  return asyncSwarmRunning;
}

export function asyncSwarmSnapshot() {
  return {
    async_swarm_running: asyncSwarmRunning,
    async_swarm_started_at: asyncSwarmStartedAt,
    worker_pool: agentWorkerPoolSnapshot(),
    worker_agent_ids: asyncWorkerAgentIds(),
    lanes: laneRuntimeSnapshot(),
  };
}
