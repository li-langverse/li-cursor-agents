import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export async function loadLatestBriefingFromDb(): Promise<Record<string, unknown> | null> {
  if (!dbEnabled()) return null;

  return withSupabaseRetry("loadLatestBriefing", async () => {
    const { data, error } = await getSupabase()
      .from("briefing_snapshots")
      .select("payload, briefing_hash, generated_at")
      .eq("is_latest", true)
      .maybeSingle();
    if (error) throw new Error(`loadLatestBriefing: ${error.message}`);
    if (!data?.payload || typeof data.payload !== "object") return null;
    return data.payload as Record<string, unknown>;
  });
}

export async function saveLatestBriefingSnapshot(
  briefing: Record<string, unknown>,
  briefingHash: string,
  sourcePath?: string,
): Promise<void> {
  if (!dbEnabled() || !briefingHash) return;

  await withSupabaseRetry("saveLatestBriefing", async () => {
    const supabase = getSupabase();
    await supabase.from("briefing_snapshots").update({ is_latest: false }).eq("is_latest", true);

    const generated =
      typeof briefing.generated_at === "string" ? briefing.generated_at : new Date().toISOString();

    const { error } = await supabase.from("briefing_snapshots").upsert(
      {
        briefing_hash: briefingHash,
        generated_at: generated,
        source_path: sourcePath ?? null,
        payload: briefing,
        is_latest: true,
      },
      { onConflict: "briefing_hash" },
    );
    if (error) throw new Error(`saveLatestBriefing: ${error.message}`);
  });
}
