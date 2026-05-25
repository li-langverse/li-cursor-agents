import { agentBackendLabel } from "../runner.js";
import { resolveCursorApiKey } from "../env.js";
import { runtimeSnapshot, isSupervisorLoopRunning, listActiveRuns } from "../control-plane/runtime.js";
import { handoffRunStatus } from "../lanes/handoff-run-coordinator.js";
import { laneRuntimeSnapshot } from "../lanes/lane-runtime.js";
import type { ControlPlaneState } from "../control-plane/types.js";
import { saveWorkerStatusToDb } from "../db/worker-status.js";
import { dbEnabled } from "../db/client.js";
import { sdkMaxConcurrent, sdkSessionInProcessActive } from "../backends/sdk-session-lock.js";

/** Persist worker heartbeat for read-only dashboard API (no in-process state in Next). */
export async function persistWorkerHeartbeat(state: ControlPlaneState): Promise<void> {
  if (!dbEnabled()) return;

  const runtime = runtimeSnapshot(state);
  const lanes = laneRuntimeSnapshot();

  await saveWorkerStatusToDb({
    supervisor_loop_running: isSupervisorLoopRunning() || Boolean(runtime.supervisor_loop_running),
    async_swarm_running: Boolean(runtime.async_swarm_running),
    research_lane_running: lanes.research_lane_running,
    implement_lane_running: lanes.implement_lane_running,
    maintenance_lane_running: lanes.maintenance_lane_running,
    agent_backend: agentBackendLabel(),
    sdk_ready: agentBackendLabel() === "cursor-sdk" && Boolean(resolveCursorApiKey()),
    sdk_max_concurrent: sdkMaxConcurrent(),
    sdk_sessions_active: sdkSessionInProcessActive(),
    active_runs: listActiveRuns(),
    handoff_run: handoffRunStatus() as unknown as Record<string, unknown>,
    last_tick_at: state.last_tick_at || new Date().toISOString(),
  });
}
