import type { ActiveAgentRun } from "../control-plane/types.js";
import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export interface WorkerStatusRow {
  supervisor_loop_running: boolean;
  async_swarm_running: boolean;
  research_lane_running: boolean;
  implement_lane_running: boolean;
  maintenance_lane_running: boolean;
  agent_backend: string | null;
  sdk_ready: boolean;
  sdk_max_concurrent: number | null;
  sdk_sessions_active: number | null;
  active_runs: ActiveAgentRun[];
  handoff_run: Record<string, unknown> | null;
  last_tick_at: string | null;
  updated_at: string;
}

const DEFAULT_WORKER_STATUS: WorkerStatusRow = {
  supervisor_loop_running: false,
  async_swarm_running: false,
  research_lane_running: false,
  implement_lane_running: false,
  maintenance_lane_running: false,
  agent_backend: null,
  sdk_ready: false,
  sdk_max_concurrent: null,
  sdk_sessions_active: null,
  active_runs: [],
  handoff_run: null,
  last_tick_at: null,
  updated_at: new Date(0).toISOString(),
};

export async function loadWorkerStatusFromDb(): Promise<WorkerStatusRow | null> {
  if (!dbEnabled()) return null;

  return withSupabaseRetry("loadWorkerStatus", async () => {
    const { data, error } = await getSupabase()
      .from("worker_status")
      .select(
        "supervisor_loop_running, async_swarm_running, research_lane_running, implement_lane_running, maintenance_lane_running, agent_backend, sdk_ready, sdk_max_concurrent, sdk_sessions_active, active_runs, handoff_run, last_tick_at, updated_at",
      )
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`loadWorkerStatus: ${error.message}`);
    if (!data) return null;
    return {
      supervisor_loop_running: Boolean(data.supervisor_loop_running),
      async_swarm_running: Boolean(data.async_swarm_running),
      research_lane_running: Boolean(data.research_lane_running),
      implement_lane_running: Boolean(data.implement_lane_running),
      maintenance_lane_running: Boolean(data.maintenance_lane_running),
      agent_backend: (data.agent_backend as string | null) ?? null,
      sdk_ready: Boolean(data.sdk_ready),
      sdk_max_concurrent: data.sdk_max_concurrent as number | null,
      sdk_sessions_active: data.sdk_sessions_active as number | null,
      active_runs: (data.active_runs as ActiveAgentRun[]) ?? [],
      handoff_run: (data.handoff_run as Record<string, unknown> | null) ?? null,
      last_tick_at: (data.last_tick_at as string | null) ?? null,
      updated_at: String(data.updated_at),
    };
  });
}

export async function saveWorkerStatusToDb(row: Partial<WorkerStatusRow>): Promise<void> {
  if (!dbEnabled()) return;

  await withSupabaseRetry("saveWorkerStatus", async () => {
    const { error } = await getSupabase()
      .from("worker_status")
      .upsert({
        id: 1,
        ...row,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`saveWorkerStatus: ${error.message}`);
  });
}

export function defaultWorkerStatus(): WorkerStatusRow {
  return { ...DEFAULT_WORKER_STATUS, updated_at: new Date().toISOString() };
}
