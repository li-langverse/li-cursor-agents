import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export async function loadRuntimeSettingsFromDb(): Promise<Record<string, string>> {
  if (!dbEnabled()) return {};

  return withSupabaseRetry("loadRuntimeSettings", async () => {
    const { data, error } = await getSupabase()
      .from("runtime_settings")
      .select("values")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`loadRuntimeSettings: ${error.message}`);
    const values = data?.values;
    if (!values || typeof values !== "object") return {};
    return values as Record<string, string>;
  });
}

export async function saveRuntimeSettingsToDb(values: Record<string, string>): Promise<void> {
  if (!dbEnabled()) return;

  await withSupabaseRetry("saveRuntimeSettings", async () => {
    const { error } = await getSupabase()
      .from("runtime_settings")
      .upsert({
        id: 1,
        values,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`saveRuntimeSettings: ${error.message}`);
  });
}
