import type { AgentsPayload, QueuePayload, RuntimePayload, StatusPayload, WorkQueueItem } from "./types";
import type { AgentStatusInfo } from "./agent-status";
import { buildAgentStatusMap } from "./agent-status";
import { deriveLiveStreamPreview } from "./live-stream-preview";

export type LiveAgentKind = "sdk_run" | "queue_in_progress" | "supervisor";

export interface LiveAgentRow {
  agentId: string;
  agentName: string;
  kind: LiveAgentKind;
  headline: string;
  detail: string;
  startedAt?: string;
  runId?: string;
  queueItemId?: string;
}

function rosterName(agents: AgentsPayload | undefined, agentId: string): string {
  return agents?.roster?.find((r) => r.id === agentId)?.name ?? agentId;
}

function pushRow(
  map: Map<string, LiveAgentRow>,
  row: LiveAgentRow,
  prefer: LiveAgentKind[] = [],
): void {
  const existing = map.get(row.agentId);
  if (!existing) {
    map.set(row.agentId, row);
    return;
  }
  const rank = (k: LiveAgentKind) => prefer.indexOf(k);
  if (rank(row.kind) < rank(existing.kind)) map.set(row.agentId, row);
}

/** Agents actively executing (SDK run, in-progress queue, or supervisor tick). */
export function buildLiveAgentRows(
  agents: AgentsPayload | undefined,
  status: StatusPayload | undefined,
  queue: QueuePayload | undefined,
  statusMap?: Map<string, AgentStatusInfo>,
): LiveAgentRow[] {
  const map = new Map<string, LiveAgentRow>();
  const runtime: RuntimePayload | undefined = status?.runtime ?? agents?.runtime;
  const prefer: LiveAgentKind[] = ["sdk_run", "supervisor", "queue_in_progress"];

  for (const run of runtime?.active_runs ?? []) {
    if (run.status !== "running") continue;
    const stream = deriveLiveStreamPreview({
      run_trace: run.run_trace,
      run_input: run.run_input,
      reason: run.reason,
    });
    pushRow(
      map,
      {
        agentId: run.agent_id,
        agentName: rosterName(agents, run.agent_id),
        kind: "sdk_run",
        headline: stream.headline,
        detail: stream.detail || stream.snippet || run.reason?.trim() || "Agent run in progress",
        startedAt: run.started_at,
        runId: run.run_id,
      },
      prefer,
    );
  }

  if (
    runtime?.current_supervisor_agent &&
    runtime.supervisor_loop_running
  ) {
    const id = runtime.current_supervisor_agent;
    pushRow(
      map,
      {
        agentId: id,
        agentName: rosterName(agents, id),
        kind: "supervisor",
        headline: "Supervisor tick",
        detail: "Executing task in supervisor loop",
        startedAt: runtime.supervisor_loop_started_at ?? undefined,
      },
      prefer,
    );
  }

  for (const item of queue?.queue ?? []) {
    if (item.status !== "in_progress") continue;
    pushRow(
      map,
      {
        agentId: item.agent_id,
        agentName: rosterName(agents, item.agent_id),
        kind: "queue_in_progress",
        headline: "Working queued task",
        detail: item.reason,
        queueItemId: item.id,
      },
      prefer,
    );
  }

  const sm = statusMap ?? buildAgentStatusMap(agents, undefined, status, queue);
  for (const [agentId, info] of sm) {
    if (info.status !== "running" || map.has(agentId)) continue;
    const q = findQueueFocus(queue, agentId);
    pushRow(
      map,
      {
        agentId,
        agentName: rosterName(agents, agentId),
        kind: q?.status === "in_progress" ? "queue_in_progress" : "sdk_run",
        headline: q ? "Working queued task" : "Running",
        detail: info.reason ?? q?.reason ?? "Active on swarm",
        queueItemId: q?.id,
      },
      prefer,
    );
  }

  return [...map.values()].sort((a, b) => {
    const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.agentId.localeCompare(b.agentId);
  });
}

function findQueueFocus(
  queue: QueuePayload | undefined,
  agentId: string,
): WorkQueueItem | undefined {
  return (queue?.queue ?? []).find(
    (q) => q.agent_id === agentId && (q.status === "in_progress" || q.status === "pending"),
  );
}

export function formatRunningFor(iso?: string): string {
  if (!iso) return "";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}
