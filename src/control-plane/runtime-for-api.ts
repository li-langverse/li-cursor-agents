import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { computeInSdkCount } from "./active-run-metrics.js";
import { mergeActiveRunsForDisplay } from "./merge-active-runs.js";
import { runtimeSnapshot } from "./runtime.js";
import type { ControlPlaneState } from "./types.js";
import { dbEnabled } from "../db/client.js";
import { listRunningAgentRuns } from "../db/runs.js";
import { loadWorkerStatusPeer, type WorkerStatusRow } from "../db/worker-status.js";

let peerCache: { at: number; row: WorkerStatusRow | null } | null = null;
const PEER_CACHE_MS = 2_000;

/** Dashboard API runtime: in-process swarm, else latest peer heartbeat (systemd async-swarm / disk file). */
export async function runtimeForApi(state: ControlPlaneState) {
  const local = runtimeSnapshot(state);
  if (isAsyncSwarmRunning() || local.async_swarm_running) {
    return local;
  }

  const now = Date.now();
  if (!peerCache || now - peerCache.at > PEER_CACHE_MS) {
    peerCache = { at: now, row: await loadWorkerStatusPeer() };
  }
  const peer = peerCache.row;
  if (!peer?.async_swarm_running) {
    return local;
  }

  const dbRunning = dbEnabled() ? await listRunningAgentRuns(30) : [];
  const peerRuns = peer.active_runs.length ? peer.active_runs : local.active_runs;
  const activeRuns = mergeActiveRunsForDisplay(peerRuns, dbRunning);
  const runningRuns = activeRuns.filter((r) => r.status === "running");
  return {
    ...local,
    async_swarm_running: true,
    active_runs: activeRuns,
    active_run_count: computeInSdkCount(activeRuns, peer.sdk_sessions_active),
    worker_pool: {
      running: true,
      worker_count: runningRuns.length > 0 ? runningRuns.length : 1,
      agents: runningRuns.map((r) => r.agent_id),
      paused: false,
    },
    lanes: {
      research_lane_running: peer.research_lane_running,
      implement_lane_running: peer.implement_lane_running,
      maintenance_lane_running: peer.maintenance_lane_running,
    },
    sdk_sessions_active: peer.sdk_sessions_active ?? local.sdk_sessions_active,
    sdk_max_concurrent: peer.sdk_max_concurrent ?? local.sdk_max_concurrent,
  };
}
