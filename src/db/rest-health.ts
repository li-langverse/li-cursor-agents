import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export interface RestHealthResult {
  ok: boolean;
  error?: string;
}

/** Verify PostgREST (SUPABASE_URL) — distinct from Postgres on 54322. */
export async function probeSupabaseRest(): Promise<RestHealthResult> {
  if (!dbEnabled()) {
    return { ok: false, error: "Supabase REST not configured (SUPABASE_URL + service role key)" };
  }

  try {
    await withSupabaseRetry(
      "probeSupabaseRest",
      async () => {
        const { error: stateErr } = await getSupabase()
          .from("control_plane_state")
          .select("id")
          .eq("id", 1)
          .maybeSingle();
        if (stateErr) throw new Error(stateErr.message);
        const { error: handoffErr } = await getSupabase()
          .from("agent_handoffs")
          .select("handoff_id")
          .limit(1);
        if (handoffErr) throw new Error(handoffErr.message);
      },
      { attempts: 3, baseDelayMs: 250 },
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
