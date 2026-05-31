import { agentLog } from "../agent-log.js";
import { sdkMaxConcurrentFromEnv, SWARM_PARALLEL_DEFAULT } from "../config/swarm-concurrency.js";
import { pushSupervisorActivity } from "../control-plane/supervisor-activity.js";
import { loadState, saveState } from "../control-plane/state.js";
import { stopSupervisorLoop } from "../control-plane/runtime.js";
import {
  startImplementLaneLoop,
  startMaintenanceLaneLoop,
  startObserverLaneLoop,
  startResearchLaneLoop,
  stopImplementLaneLoop,
  stopMaintenanceLaneLoop,
  stopObserverLaneLoop,
  stopResearchLaneLoop,
  updateLaneFlags,
} from "../lanes/lane-runtime.js";
import { shouldUseMock } from "../runner.js";
import { startAgentWorkerPool, stopAgentWorkerPool } from "./agent-worker-pool.js";
import { isAsyncSwarmRunning, setAsyncSwarmRunning } from "./async-swarm-state.js";
import {
  flushWorkerHeartbeat,
  startWorkerHeartbeatLoop,
  stopWorkerHeartbeatLoop,
} from "../worker/heartbeat-loop.js";
import { proactiveAllPoolWorkersEnabled } from "../control-plane/proactive-agent-work.js";
import { workerConsole } from "../worker/worker-console.js";
import { startOrgIssueWorkerLoop, stopOrgIssueWorkerLoop } from "../org-issues/org-issue-worker-loop.js";

export { isAsyncSwarmRunning, asyncSwarmSnapshot } from "./async-swarm-state.js";

/** Lanes + per-agent workers — no supervisor tick queue. */
export async function startAsyncSwarm(options?: {
  mock?: boolean;
  stopSupervisor?: boolean;
}): Promise<{ started: boolean; message: string; already_running?: boolean }> {
  if (isAsyncSwarmRunning()) {
    startWorkerHeartbeatLoop();
    await flushWorkerHeartbeat();
    return { started: false, already_running: true, message: "async swarm already running" };
  }

  if (options?.stopSupervisor !== false) {
    await stopSupervisorLoop();
  }

  const mock = options?.mock ?? shouldUseMock(false);
  updateLaneFlags({ research_lane_enabled: true, implement_lane_enabled: true });

  const research = startResearchLaneLoop({ mock });
  const implement = startImplementLaneLoop({ mock });
  const maintenance = startMaintenanceLaneLoop({ mock });
  const observer = startObserverLaneLoop();
  const workers = startAgentWorkerPool({ mock });
  const issueWorker = startOrgIssueWorkerLoop();

  setAsyncSwarmRunning(true);
  startWorkerHeartbeatLoop();

  const state = loadState();
  state.supervisor_loop_running = false;
  state.supervisor_loop_started_at = undefined;
  state.supervisor_status = "waiting";
  saveState(state);

  const message = [
    "Async swarm started (no supervisor)",
    research.message,
    implement.message,
    maintenance.message,
    observer.message,
    workers.message,
    issueWorker.message,
  ].join("; ");

  pushSupervisorActivity("info", message, { mode: "async_swarm", mock });
  agentLog("async-swarm", "info", message);
  await flushWorkerHeartbeat();

  const sdkSlots = sdkMaxConcurrentFromEnv();
  workerConsole(
    "async-swarm",
    "info",
    `worker pool: ${workers.agents.length} agents; sdk_max_concurrent=${sdkSlots} (default ${SWARM_PARALLEL_DEFAULT}); proactive_all_pool=${proactiveAllPoolWorkersEnabled()}`,
    workers.agents.slice(0, 8).join(", ") + (workers.agents.length > 8 ? ", …" : ""),
  );

  return { started: true, message };
}

export async function stopAsyncSwarm(): Promise<{ stopped: boolean; message: string }> {
  if (!isAsyncSwarmRunning()) {
    return { stopped: false, message: "async swarm not running" };
  }

  stopResearchLaneLoop();
  stopImplementLaneLoop();
  stopMaintenanceLaneLoop();
  stopObserverLaneLoop();
  stopOrgIssueWorkerLoop();
  const workers = stopAgentWorkerPool();

  setAsyncSwarmRunning(false);
  stopWorkerHeartbeatLoop();
  await flushWorkerHeartbeat();

  const message = `Async swarm stopped; ${workers.message}`;
  pushSupervisorActivity("info", message, { mode: "async_swarm" });
  agentLog("async-swarm", "info", message);

  return { stopped: true, message };
}
