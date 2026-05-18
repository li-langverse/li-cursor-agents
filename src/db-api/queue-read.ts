import type { ControlPlaneState } from "../control-plane/types.js";
import type { AgentWorkQueueItem } from "../control-plane/agent-work-queue.js";
import { loadWorkQueueFromDb } from "../db/queued-tasks.js";
import { loadWorkQueueSnapshotFromDb } from "../db/work-queue-snapshot.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import { loadLaneStateFromDb } from "../db/lane-state.js";
import { laneSnapshotFromDb } from "./runtime-read.js";
import { dbEnabled } from "../db/client.js";

function groupByAgent(items: AgentWorkQueueItem[]): Record<string, AgentWorkQueueItem[]> {
  const by: Record<string, AgentWorkQueueItem[]> = {};
  for (const item of items) {
    const id = String(item.agent_id);
    if (!by[id]) by[id] = [];
    by[id].push(item);
  }
  return by;
}

function rowsToItems(
  rows: Awaited<ReturnType<typeof loadWorkQueueFromDb>>,
): AgentWorkQueueItem[] {
  return rows.map((row) => ({
    id: row.id,
    agent_id: row.agent_id,
    source: row.source as AgentWorkQueueItem["source"],
    priority: row.priority,
    reason: row.reason,
    status: row.status as AgentWorkQueueItem["status"],
    meta: row.meta,
  }));
}

export async function loadQueuePayloadForRead(
  state: ControlPlaneState,
  store: string,
): Promise<Record<string, unknown>> {
  const briefingHash = state.last_briefing_hash ?? "";
  const worker = await loadWorkerStatusFromDb();
  const runtimeActive = worker?.active_runs ?? [];

  if (dbEnabled() && briefingHash) {
    const snapshot = await loadWorkQueueSnapshotFromDb(briefingHash);
    if (snapshot) {
      return {
        queue: snapshot.items,
        by_agent: snapshot.by_agent,
        generated_at: snapshot.generated_at,
        swarm: snapshot.swarm,
        briefing_hash: briefingHash,
        completed: state.recent_tasks,
        stopped_agents: state.stopped_agents ?? [],
        active_runs: runtimeActive,
        store,
      };
    }

    const dbRows = await loadWorkQueueFromDb(briefingHash);
    if (dbRows.length > 0) {
      const items = rowsToItems(dbRows);
      const lane = await loadLaneStateFromDb();
      return {
        queue: items,
        by_agent: groupByAgent(items),
        generated_at: new Date().toISOString(),
        swarm: {
          async_swarm_running: worker?.async_swarm_running ?? false,
          handoff_run_in_progress: Boolean(worker?.handoff_run),
          lanes: laneSnapshotFromDb(lane, worker),
        },
        briefing_hash: briefingHash,
        completed: state.recent_tasks,
        stopped_agents: state.stopped_agents ?? [],
        active_runs: runtimeActive,
        store,
      };
    }
  }

  return {
    queue: [],
    by_agent: {},
    generated_at: new Date().toISOString(),
    swarm: null,
    briefing_hash: briefingHash,
    completed: state.recent_tasks,
    stopped_agents: state.stopped_agents ?? [],
    active_runs: runtimeActive,
    queue_stale: true,
    queue_building: Boolean(briefingHash),
    store,
  };
}
