/**
 * PH-DB-10: control-plane writes via lidb liorm bridge (subset of Supabase schema).
 */
import type { ControlPlaneState } from "../control-plane/types.js";
import type { PersistRunInput } from "./runs.js";
import { runLidbBridge, shouldUseLidbEngine } from "./lidb-liorm.js";

export async function lidbPersistAvailable(): Promise<boolean> {
  return shouldUseLidbEngine();
}

export async function upsertAgentRunLidb(input: PersistRunInput): Promise<void> {
  const { run } = input;
  const base = run.outputPath.split("/").pop() ?? `${run.agentId}-${Date.now()}.md`;
  const runId = base.replace(/\.md$/, "");
  const tsMatch = /-(\d+)\.(md|json)$/.exec(base);
  const startedAt = tsMatch
    ? new Date(Number(tsMatch[1])).toISOString()
    : new Date(Date.now() - (run.durationMs ?? 0)).toISOString();

  const result = await runLidbBridge(
    "upsert_agent_run",
    JSON.stringify({
      run_id: runId,
      agent_id: run.agentId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: run.status,
      briefing_hash: run.briefing_hash ?? null,
    }),
  );
  if (!result.ok) {
    throw new Error(`[lidb] agent_runs upsert: ${result.error ?? "unknown"}`);
  }
}

export async function persistControlPlaneStateLidb(state: ControlPlaneState): Promise<void> {
  const snapshot = { ...state, updated_at: new Date().toISOString() };
  const result = await runLidbBridge("upsert_control_plane_state", JSON.stringify(snapshot));
  if (!result.ok) {
    throw new Error(`[lidb] control_plane_state: ${result.error ?? "unknown"}`);
  }
}
