import { getAgent } from "../agents/registry.js";
import { coordinatorForLeaf } from "../heap/coordinators.js";
import type { AgentId } from "../types.js";
import type { ControlPlaneState } from "../control-plane/types.js";
import { loadLatestReportHybrid } from "../db/persist.js";
import { loadWorkQueueFromDb } from "../db/queued-tasks.js";
import { loadWorkerStatusFromDb } from "../db/worker-status.js";
import {
  getAgentRunHistory,
  listRunsForAgent,
} from "../control-plane/runs-catalog.js";
import type { AgentWorkQueueItem } from "../control-plane/agent-work-queue.js";

function rowsToQueueItems(
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

export async function getAgentDetailFromDb(agentId: AgentId, state: ControlPlaneState) {
  const def = getAgent(agentId);
  if (!def) return null;

  const report = (await loadLatestReportHybrid()) as Record<string, unknown> | null;
  const recommended = (report?.recommended_agents as Array<{ agent: string; reason: string }>) ?? [];
  const rec = recommended.find((r) => r.agent === agentId);
  const heapPlan = report?.heap_plan as Record<string, unknown> | undefined;
  const flatTasks =
    (heapPlan?.flat_tasks as Array<{ agent: string; reason: string; coordinator: string }>) ?? [];
  const heapTask = flatTasks.find((t) => t.agent === agentId);

  let agentQueue: AgentWorkQueueItem[] = [];
  if (state.last_briefing_hash) {
    const rows = await loadWorkQueueFromDb(state.last_briefing_hash);
    agentQueue = rowsToQueueItems(rows).filter((q) => String(q.agent_id) === agentId);
  }

  const recentTasks = state.recent_tasks.filter((t) => t.agentId === agentId).slice(-8).reverse();
  const worker = await loadWorkerStatusFromDb();
  const activeRun =
    worker?.active_runs.find((r) => r.agent_id === agentId && r.status === "running") ?? null;
  const supervisorRunning =
    state.supervisor_status === "running_agent" && state.current_supervisor_agent === agentId;
  const stopped = (state.stopped_agents ?? []).includes(agentId);
  const runs = await listRunsForAgent(agentId, 12);
  const history = await getAgentRunHistory(agentId, 50);

  let status: "running" | "stopped" | "recommended" | "idle" | "cooldown" = "idle";
  if (stopped) status = "stopped";
  else if (activeRun || supervisorRunning) status = "running";
  else if (recentTasks.length && recentTasks[0].status === "finished") {
    const finishedAt = new Date(recentTasks[0].finished_at).getTime();
    if (Date.now() - finishedAt < 3_600_000) status = "cooldown";
  } else if (rec || heapTask) status = "recommended";

  return {
    agent: {
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
      role: def.id === "orchestrator" ? "root" : "leaf",
      coordinator: coordinatorForLeaf(def.id),
      skills: def.skills,
      needsWeb: def.needsWeb,
      promptFile: def.promptFile,
    },
    status,
    stopped,
    active_run: activeRun,
    recommended_reason:
      agentQueue.find((q) => q.status === "pending")?.reason ?? rec?.reason ?? heapTask?.reason,
    heap_coordinator: heapTask?.coordinator,
    work_queue: agentQueue,
    recent_tasks: recentTasks,
    runs,
    history,
    briefing_hash: (report?.briefing_hash as string) ?? state.last_briefing_hash,
  };
}
