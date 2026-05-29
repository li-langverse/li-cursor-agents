import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";
import type { WorkerStatusRow } from "./worker-status.js";

/** Mark agent_runs stuck in `running` after worker loss (dashboard still lists them live). */
export function staleRunningRunMaxAgeMs(): number {
  const raw = process.env.LI_STALE_RUNNING_RUN_MS?.trim();
  const n = Number(raw ?? 1_800_000);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(7 * 24 * 3_600_000, Math.floor(n)) : 1_800_000;
}

export function unregisteredReconcileFreshMs(): number {
  const raw = process.env.LI_UNREGISTERED_RECONCILE_FRESH_MS?.trim();
  const n = Number(raw ?? 120_000);
  return Number.isFinite(n) && n >= 5_000 ? Math.min(3_600_000, Math.floor(n)) : 120_000;
}

async function markRunningRunsError(runIds: string[], error: string): Promise<number> {
  if (!runIds.length) return 0;
  const now = new Date().toISOString();
  const { error: updateErr } = await getSupabase()
    .from("agent_runs")
    .update({
      status: "error",
      finished_at: now,
      error,
      updated_at: now,
    })
    .eq("status", "running")
    .in("run_id", runIds);
  if (updateErr) throw new Error(`markRunningRunsError: ${updateErr.message}`);
  return runIds.length;
}

export async function reconcileStaleRunningAgentRuns(): Promise<number> {
  if (!dbEnabled()) return 0;

  const cutoff = new Date(Date.now() - staleRunningRunMaxAgeMs()).toISOString();

  return withSupabaseRetry("reconcileStaleRunningAgentRuns", async () => {
    const { data, error } = await getSupabase()
      .from("agent_runs")
      .select("run_id")
      .eq("status", "running")
      .lt("updated_at", cutoff);

    if (error) throw new Error(`reconcileStaleRunningAgentRuns: ${error.message}`);
    const ids = (data ?? []).map((r) => String(r.run_id));
    return markRunningRunsError(ids, "stale_running_reconciled");
  });
}

/**
 * Mark DB `running` rows absent from the worker heartbeat (pid=0 orphans in /api/runtime).
 * Requires a fresh async-swarm heartbeat unless `force` (sweep / systemd-active path).
 */
export async function reconcileUnregisteredRunningAgentRuns(
  registeredRunIds: readonly string[],
  options?: { worker?: WorkerStatusRow | null; force?: boolean },
): Promise<number> {
  if (!dbEnabled()) return 0;

  const worker = options?.worker ?? null;
  if (!options?.force) {
    if (!worker?.async_swarm_running) return 0;
    const ageMs = Date.now() - new Date(worker.updated_at).getTime();
    if (ageMs > unregisteredReconcileFreshMs()) return 0;
  }

  const registered = new Set(registeredRunIds);

  return withSupabaseRetry("reconcileUnregisteredRunningAgentRuns", async () => {
    const { data, error } = await getSupabase()
      .from("agent_runs")
      .select("run_id")
      .eq("status", "running");

    if (error) throw new Error(`reconcileUnregisteredRunningAgentRuns: ${error.message}`);
    const ids = (data ?? [])
      .map((r) => String(r.run_id))
      .filter((id) => !registered.has(id));
    return markRunningRunsError(ids, "unregistered_running_reconciled");
  });
}
