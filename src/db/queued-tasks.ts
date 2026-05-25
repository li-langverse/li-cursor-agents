import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

const QUEUE_ROW_SELECT =
  "fingerprint, agent_id, reason, source, coordinator, priority, status, meta";

export interface DbQueuedTaskRow {
  id: string;
  agent_id: string;
  source: string;
  priority: number;
  reason: string;
  status: string;
  meta?: Record<string, string | number | undefined>;
}

export async function loadWorkQueueFromDb(briefingHash: string): Promise<DbQueuedTaskRow[]> {
  if (!dbEnabled() || !briefingHash) return [];

  return withSupabaseRetry("loadWorkQueueFromDb", async () => {
    const { data, error } = await getSupabase()
      .from("queued_agent_tasks")
      .select(QUEUE_ROW_SELECT)
      .eq("briefing_hash", briefingHash)
      .order("priority", { ascending: false })
      .limit(500);

    if (error) throw new Error(`loadWorkQueueFromDb: ${error.message}`);

    return (data ?? []).map((row) => {
      const fp = String(row.fingerprint);
      const meta = (row.meta as Record<string, string | number | undefined> | null) ?? undefined;
      return {
        id: `db:${fp}`,
        agent_id: String(row.agent_id),
        source: String(row.source ?? "heap"),
        priority: Number(row.priority ?? 50),
        reason: String(row.reason),
        status: String(row.status ?? "pending"),
        meta: meta && Object.keys(meta).length ? meta : undefined,
      };
    });
  });
}

export async function syncWorkQueueToDb(
  briefingHash: string,
  items: Array<{
    id: string;
    agent_id: string | { toString(): string };
    source: string;
    priority: number;
    reason: string;
    status: string;
    meta?: Record<string, string | number | undefined>;
  }>,
): Promise<void> {
  if (!dbEnabled() || !briefingHash || !items.length) return;

  await withSupabaseRetry("syncWorkQueueToDb", async () => {
    const supabase = getSupabase();
    const { error: delErr } = await supabase
      .from("queued_agent_tasks")
      .delete()
      .eq("briefing_hash", briefingHash);
    if (delErr) throw new Error(`syncWorkQueueToDb delete: ${delErr.message}`);

    const rows = items.slice(0, 500).map((item) => ({
      briefing_hash: briefingHash,
      fingerprint: item.id.replace(/^db:/, "").slice(0, 200) || item.id.slice(0, 200),
      agent_id: String(item.agent_id),
      reason: item.reason.slice(0, 4000),
      source: item.source,
      coordinator: typeof item.meta?.coordinator === "string" ? item.meta.coordinator : null,
      priority: item.priority,
      status: item.status,
      meta: item.meta ?? null,
    }));

    const chunk = 100;
    for (let i = 0; i < rows.length; i += chunk) {
      const { error } = await supabase.from("queued_agent_tasks").insert(rows.slice(i, i + chunk));
      if (error) throw new Error(`syncWorkQueueToDb insert: ${error.message}`);
    }
  });
}
