import type { SupervisorActivityEntry } from "../control-plane/supervisor-activity.js";
import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export async function appendSupervisorActivityToDb(entry: SupervisorActivityEntry): Promise<void> {
  if (!dbEnabled()) return;

  await withSupabaseRetry("appendSupervisorActivity", async () => {
    const { error } = await getSupabase().from("supervisor_activity").insert({
      at: entry.at,
      level: entry.level,
      message: entry.message,
      meta: entry.meta ?? null,
    });
    if (error) throw new Error(`appendSupervisorActivity: ${error.message}`);
  });
}

export async function listSupervisorActivityFromDb(limit: number): Promise<SupervisorActivityEntry[]> {
  if (!dbEnabled()) return [];

  return withSupabaseRetry("listSupervisorActivity", async () => {
    const { data, error } = await getSupabase()
      .from("supervisor_activity")
      .select("at, level, message, meta")
      .order("at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`listSupervisorActivity: ${error.message}`);
    return (data ?? []).map((row) => ({
      at: String(row.at),
      level: row.level as SupervisorActivityEntry["level"],
      message: String(row.message),
      meta: (row.meta as Record<string, unknown> | null) ?? undefined,
    }));
  });
}
