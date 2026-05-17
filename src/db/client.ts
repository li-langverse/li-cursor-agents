import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Primary store when SUPABASE_URL + service role (or anon) key are set. */
export function dbEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && supabaseKey());
}

function supabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    undefined
  );
}

export function getSupabase(): SupabaseClient {
  if (!dbEnabled()) {
    throw new Error("Supabase not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, supabaseKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function exportDiskCacheEnabled(): boolean {
  return process.env.LI_EXPORT_DISK_CACHE !== "0";
}
