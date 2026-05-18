import { computeInSdkCount } from "../control-plane/active-run-metrics.js";
import type { ControlPlaneState } from "../control-plane/types.js";
import type { WorkerStatusRow } from "../db/worker-status.js";
import { defaultWorkerStatus } from "../db/worker-status.js";
import type { LaneStateFile } from "../lanes/lane-state.js";
import { implementLaneIntervalMs } from "../lanes/implement-lane.js";
import { researchLaneIntervalMs } from "../lanes/research-lane.js";
import { maintenanceLaneIntervalMs } from "../lanes/maintenance-lane.js";

export function runtimeSnapshotFromDb(
  state: ControlPlaneState,
  worker: WorkerStatusRow | null,
) {
  const w = worker ?? defaultWorkerStatus();
  const loopRunning = w.supervisor_loop_running || Boolean(state.supervisor_loop_running);
  return {
    supervisor_loop_running: loopRunning,
    supervisor_loop_started_at: loopRunning ? (state.supervisor_loop_started_at ?? null) : null,
    stopped_agents: state.stopped_agents ?? [],
    current_supervisor_agent: state.current_supervisor_agent ?? null,
    active_runs: w.active_runs,
    active_run_count: computeInSdkCount(w.active_runs, w.sdk_sessions_active),
    async_swarm_running: w.async_swarm_running,
    handoff_run: w.handoff_run,
    sdk_max_concurrent: w.sdk_max_concurrent ?? Number(process.env.LI_SDK_MAX_CONCURRENT ?? 2),
    sdk_sessions_active: w.sdk_sessions_active ?? 0,
    store: undefined as string | undefined,
  };
}

export function laneSnapshotFromDb(
  lane: LaneStateFile | null,
  worker: WorkerStatusRow | null,
) {
  const s: LaneStateFile = lane ?? {
    research_lane_enabled: false,
    implement_lane_enabled: false,
    goal_last_run_at: {},
  };
  const w = worker ?? defaultWorkerStatus();
  return {
    research_lane_enabled: Boolean(s.research_lane_enabled),
    implement_lane_enabled: Boolean(s.implement_lane_enabled),
    research_lane_running: w.research_lane_running,
    implement_lane_running: w.implement_lane_running,
    maintenance_lane_running: w.maintenance_lane_running,
    last_research_tick_at: s.last_research_tick_at ?? null,
    last_implement_tick_at: s.last_implement_tick_at ?? null,
    last_maintenance_tick_at: s.last_maintenance_tick_at ?? null,
    research_interval_ms: researchLaneIntervalMs(),
    implement_interval_ms: implementLaneIntervalMs(),
    maintenance_interval_ms: maintenanceLaneIntervalMs(),
  };
}
