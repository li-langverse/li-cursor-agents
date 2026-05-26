import { agentBackendLabel } from "../runner.js";
import { resolveCursorApiKey } from "../env.js";
import { runtimeSnapshot, isSupervisorLoopRunning, listActiveRuns } from "../control-plane/runtime.js";
import { compactActiveRunsForStatus } from "../control-plane/active-run-snapshot.js";
import { handoffRunStatus } from "../lanes/handoff-run-coordinator.js";
import { laneRuntimeSnapshot } from "../lanes/lane-runtime.js";
import type { ControlPlaneState } from "../control-plane/types.js";
import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { loadWorkerStatusPeer, saveWorkerStatusToDb } from "../db/worker-status.js";
import { sdkMaxConcurrent, sdkSessionInProcessActive } from "../backends/sdk-session-lock.js";
import { externalSwarmRunnerEnabled } from "../swarm/detached-swarm-process.js";

/** Persist worker heartbeat for read-only dashboard API (no in-process state in Next). */
export async function persistWorkerHeartbeat(state: ControlPlaneState): Promise<void> {
  const runtime = runtimeSnapshot(state);
  const lanes = laneRuntimeSnapshot();

  let asyncSwarmRunning = Boolean(runtime.async_swarm_running);
  let researchLaneRunning = lanes.research_lane_running;
  let implementLaneRunning = lanes.implement_lane_running;
  let maintenanceLaneRunning = lanes.maintenance_lane_running;
  let activeRuns = listActiveRuns();

  // Dashboard + systemd async-swarm split: do not clobber peer worker_status with local false.
  if (externalSwarmRunnerEnabled() && !isAsyncSwarmRunning()) {
    const peer = await loadWorkerStatusPeer();
    if (peer) {
      asyncSwarmRunning = peer.async_swarm_running;
      researchLaneRunning = peer.research_lane_running;
      implementLaneRunning = peer.implement_lane_running;
      maintenanceLaneRunning = peer.maintenance_lane_running;
      if (peer.active_runs.length) activeRuns = peer.active_runs;
    }
  }

  await saveWorkerStatusToDb({
    supervisor_loop_running: isSupervisorLoopRunning() || Boolean(runtime.supervisor_loop_running),
    async_swarm_running: asyncSwarmRunning,
    research_lane_running: researchLaneRunning,
    implement_lane_running: implementLaneRunning,
    maintenance_lane_running: maintenanceLaneRunning,
    agent_backend: agentBackendLabel(),
    sdk_ready: agentBackendLabel() === "cursor-sdk" && Boolean(resolveCursorApiKey()),
    sdk_max_concurrent: sdkMaxConcurrent(),
    sdk_sessions_active: sdkSessionInProcessActive(),
    // Full prompts/traces stay in agent_runs; worker_status is a hot dashboard heartbeat.
    active_runs: compactActiveRunsForStatus(activeRuns),
    handoff_run: handoffRunStatus() as unknown as Record<string, unknown>,
    last_tick_at: state.last_tick_at || new Date().toISOString(),
  });
}
