import { computeInSdkCount } from "../control-plane/active-run-metrics.js";
import { enrichActiveRunsWithRecentEvents } from "../control-plane/enrich-active-runs.js";
import { mergeActiveRunsForDisplay } from "../control-plane/merge-active-runs.js";
import { sdkMaxConcurrent, sdkSlotsInUse } from "../backends/sdk-session-lock.js";
import { swarmWorkersPaused } from "../swarm/swarm-worker-pause.js";
import type { ControlPlaneState } from "../control-plane/types.js";
import type { ActiveAgentRun } from "../control-plane/types.js";
import type { WorkerStatusRow } from "../db/worker-status.js";
import { defaultWorkerStatus } from "../db/worker-status.js";
import type { AgentRunHistoryRow } from "../db/runs.js";
import type { LaneStateFile } from "../lanes/lane-state.js";
import { implementLaneIntervalMs } from "../lanes/implement-lane.js";
import { researchLaneIntervalMs } from "../lanes/research-lane.js";
import { maintenanceLaneIntervalMs } from "../lanes/maintenance-lane.js";
import { researchLaneAgentIds } from "../lanes/lane-agent-ids.js";
import { defaultProactiveAgentIds } from "../control-plane/proactive-agent-work.js";
import {
  configuredStore,
  dataStoreLabel,
  dbEnabled,
  type ControlPlaneStore,
} from "../db/client.js";

/** Store/db fields for `/api/runtime` (matches `/api/status` runtime block). */
export function runtimeStoreFields(): {
  store: ControlPlaneStore;
  db_enabled: boolean;
  control_plane_store: ControlPlaneStore;
} {
  const store = dataStoreLabel();
  return {
    store,
    db_enabled: dbEnabled(),
    control_plane_store: configuredStore(),
  };
}

export function runtimeSnapshotFromDb(
  state: ControlPlaneState,
  worker: WorkerStatusRow | null,
  dbRunning: AgentRunHistoryRow[] = [],
) {
  const w = worker ?? defaultWorkerStatus();
  const loopRunning = w.supervisor_loop_running || Boolean(state.supervisor_loop_running);
  const activeRuns: ActiveAgentRun[] = mergeActiveRunsForDisplay(w.active_runs, dbRunning);
  return {
    supervisor_loop_running: loopRunning,
    supervisor_loop_started_at: loopRunning ? (state.supervisor_loop_started_at ?? null) : null,
    stopped_agents: state.stopped_agents ?? [],
    current_supervisor_agent: state.current_supervisor_agent ?? null,
    active_runs: activeRuns,
    active_run_count: computeInSdkCount(activeRuns, w.sdk_sessions_active),
    async_swarm_running: w.async_swarm_running,
    handoff_run: w.handoff_run,
    sdk_max_concurrent: w.sdk_max_concurrent ?? sdkMaxConcurrent(),
    sdk_slots_in_use: sdkSlotsInUse(),
    sdk_sessions_active: w.sdk_sessions_active ?? 0,
    workers_paused: swarmWorkersPaused(),
    ...runtimeStoreFields(),
  };
}

/** Same as runtimeSnapshotFromDb but embeds recent_events on active runs for live activity. */
export async function runtimeSnapshotFromDbEnriched(
  state: ControlPlaneState,
  worker: WorkerStatusRow | null,
  dbRunning: AgentRunHistoryRow[] = [],
) {
  const snap = runtimeSnapshotFromDb(state, worker, dbRunning);
  const enriched = await enrichActiveRunsWithRecentEvents(snap.active_runs);
  return {
    ...snap,
    active_runs: enriched,
    active_run_count: computeInSdkCount(enriched, snap.sdk_sessions_active),
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
    research_agent_ids: [...researchLaneAgentIds()],
    proactive_agent_ids: defaultProactiveAgentIds(),
  };
}
