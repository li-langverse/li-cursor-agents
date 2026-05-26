import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

/** Mark agent_runs stuck in `running` after worker loss (dashboard still lists them live). */
export function staleRunningRunMaxAgeMs(): number {
  const raw = process.env.LI_STALE_RUNNING_RUN_MS?.trim();
  const n = Number(raw ?? 1_800_000);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(7 * 24 * 3_600_000, Math.floor(n)) : 1_800_000;
}

export async function reconcileStaleRunningAgentRuns(): Promise<number> {
  if (!dbEnabled()) return 0;

  const cutoff = new Date(Date.now() - staleRunningRunMaxAgeMs()).toISOString();
  const now = new Date().toISOString();

  return withSupabaseRetry("reconcileStaleRunningAgentRuns", async () => {
    const { data, error } = await getSupabase()
      .from("agent_runs")
      .select("run_id")
      .eq("status", "running")
      .lt("updated_at", cutoff);

    if (error) throw new Error(`reconcileStaleRunningAgentRuns: ${error.message}`);
    const ids = (data ?? []).map((r) => String(r.run_id));
    if (!ids.length) return 0;

    const { error: updateErr } = await getSupabase()
      .from("agent_runs")
      .update({
        status: "error",
        finished_at: now,
        error: "stale_running_reconciled",
        updated_at: now,
      })
      .eq("status", "running")
      .in("run_id", ids);

    if (updateErr) throw new Error(`reconcileStaleRunningAgentRuns update: ${updateErr.message}`);
    return ids.length;
  });
}
