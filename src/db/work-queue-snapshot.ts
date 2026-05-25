import type { AgentWorkQueueSnapshot } from "../control-plane/agent-work-queue.js";
import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export async function loadWorkQueueSnapshotFromDb(
  briefingHash: string,
): Promise<AgentWorkQueueSnapshot | null> {
  if (!dbEnabled() || !briefingHash) return null;

  return withSupabaseRetry("loadWorkQueueSnapshot", async () => {
    const { data, error } = await getSupabase()
      .from("work_queue_snapshots")
      .select("payload, generated_at")
      .eq("briefing_hash", briefingHash)
      .maybeSingle();
    if (error) throw new Error(`loadWorkQueueSnapshot: ${error.message}`);
    if (!data?.payload) return null;
    const payload = data.payload as AgentWorkQueueSnapshot;
    if (data.generated_at && !payload.generated_at) {
      payload.generated_at = String(data.generated_at);
    }
    return payload;
  });
}

export async function saveWorkQueueSnapshotToDb(
  briefingHash: string,
  snapshot: AgentWorkQueueSnapshot,
): Promise<void> {
  if (!dbEnabled() || !briefingHash) return;

  await withSupabaseRetry("saveWorkQueueSnapshot", async () => {
    const { error } = await getSupabase()
      .from("work_queue_snapshots")
      .upsert({
        briefing_hash: briefingHash,
        payload: snapshot,
        generated_at: snapshot.generated_at ?? new Date().toISOString(),
      });
    if (error) throw new Error(`saveWorkQueueSnapshot: ${error.message}`);
  });
}
