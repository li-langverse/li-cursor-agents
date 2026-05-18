import type { AgentsPayload, QueuePayload, StatusPayload } from "./types";

export type AgentUiStatus =
  | "running"
  | "on_duty"
  | "queued"
  | "recommended"
  | "cooldown"
  | "stopped"
  | "idle";

export interface AgentStatusInfo {
  status: AgentUiStatus;
  reason?: string;
}

export function buildAgentStatusMap(
  roster: AgentsPayload | undefined,
  report: Record<string, unknown> | undefined,
  status: StatusPayload | undefined,
): Map<string, AgentStatusInfo> {
  const map = new Map<string, AgentStatusInfo>();
  const runtime = status?.runtime ?? roster?.runtime;
  const activeRuns = runtime?.active_runs ?? [];
  const stopped = new Set(runtime?.stopped_agents ?? []);
  const rec = new Map(
    ((report?.recommended_agents as Array<{ agent: string; reason: string }>) ?? []).map((r) => [
      r.agent,
      r.reason,
    ]),
  );

  for (const entry of roster?.roster ?? []) {
    if (entry.role === "coordinator") continue;
    let s: AgentUiStatus = "idle";
    const activeRun = activeRuns.find((r) => r.agent_id === entry.id && r.status === "running");
    if (stopped.has(entry.id)) s = "stopped";
    else if (activeRun) s = "running";
    else if (runtime?.async_swarm_running) {
      if (activeRuns.some((r) => r.agent_id === entry.id)) s = "running";
      else s = "on_duty";
    } else if (rec.has(entry.id)) s = "recommended";
    map.set(entry.id, { status: s, reason: rec.get(entry.id) });
  }
  return map;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    running: "Running",
    on_duty: "On duty",
    queued: "In queue",
    recommended: "Recommended",
    stopped: "Stopped",
    idle: "Idle",
    cooldown: "Cooldown",
  };
  return labels[status] ?? status;
}
