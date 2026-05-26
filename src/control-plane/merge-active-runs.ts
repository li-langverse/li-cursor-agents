import type { AgentRunHistoryRow } from "../db/runs.js";
import type { ActiveAgentRun } from "./types.js";
import type { AgentId } from "../types.js";

function overlayDbRunningRow(heartbeat: ActiveAgentRun, row: AgentRunHistoryRow): ActiveAgentRun {
  return {
    ...heartbeat,
    reason: heartbeat.reason ?? row.reason ?? undefined,
    run_input: heartbeat.run_input ?? row.run_input ?? undefined,
    run_trace: heartbeat.run_trace ?? row.run_trace ?? undefined,
    output_path: heartbeat.output_path ?? row.output_path ?? undefined,
  };
}

/** Union heartbeat active_runs with DB `running` rows (worker crash leaves DB-only live runs). */
export function mergeActiveRunsForDisplay(
  heartbeatRuns: ActiveAgentRun[],
  dbRunning: AgentRunHistoryRow[],
): ActiveAgentRun[] {
  const byId = new Map<string, ActiveAgentRun>();
  for (const r of heartbeatRuns) {
    if (r.status === "running") byId.set(r.run_id, r);
  }
  for (const row of dbRunning) {
    const existing = byId.get(row.run_id);
    if (existing) {
      byId.set(row.run_id, overlayDbRunningRow(existing, row));
      continue;
    }
    byId.set(row.run_id, {
      run_id: row.run_id,
      agent_id: row.agent_id as AgentId,
      pid: 0,
      started_at: row.started_at,
      status: "running",
      reason: row.reason ?? undefined,
      run_input: row.run_input ?? undefined,
      run_trace: row.run_trace ?? undefined,
      output_path: row.output_path ?? undefined,
    });
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
}
