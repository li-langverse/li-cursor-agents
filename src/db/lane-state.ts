import type { LaneStateFile } from "../lanes/lane-state.js";
import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export async function loadLaneStateFromDb(): Promise<LaneStateFile | null> {
  if (!dbEnabled()) return null;

  return withSupabaseRetry("loadLaneState", async () => {
    const { data, error } = await getSupabase()
      .from("lane_state")
      .select("payload")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`loadLaneState: ${error.message}`);
    if (!data?.payload) return null;
    return data.payload as LaneStateFile;
  });
}

export async function saveLaneStateToDb(state: LaneStateFile): Promise<void> {
  if (!dbEnabled()) return;

  await withSupabaseRetry("saveLaneState", async () => {
    const { error } = await getSupabase()
      .from("lane_state")
      .upsert({
        id: 1,
        payload: state,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`saveLaneState: ${error.message}`);
  });
}
