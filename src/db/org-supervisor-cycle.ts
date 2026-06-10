import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export type OrgSupervisorKind = "issue" | "triage" | "pr" | "review" | "research" | "planner" | "ga";

export interface OrgSupervisorCyclePatch {
  open_count: number;
  desired_workers: number;
  active_claims: unknown[];
  last_cycle_at?: string | null;
  last_error?: string | null;
}

/** Upsert latest supervisor tick snapshot (no-op when Supabase disabled). */
export async function saveOrgSupervisorCycle(
  kind: OrgSupervisorKind,
  patch: OrgSupervisorCyclePatch,
): Promise<void> {
  if (!dbEnabled()) return;

  const updatedAt = new Date().toISOString();
  const payload = {
    supervisor_kind: kind,
    open_count: patch.open_count,
    desired_workers: patch.desired_workers,
    active_claims: patch.active_claims,
    last_cycle_at: patch.last_cycle_at ?? updatedAt,
    last_error: patch.last_error ?? null,
    updated_at: updatedAt,
  };

  await withSupabaseRetry("saveOrgSupervisorCycle", async () => {
    const { error } = await getSupabase().from("org_supervisor_cycles").upsert(payload);
    if (error) throw new Error(`saveOrgSupervisorCycle(${kind}): ${error.message}`);
  });
}

export async function loadOrgSupervisorCycle(
  kind: OrgSupervisorKind,
): Promise<OrgSupervisorCyclePatch | null> {
  if (!dbEnabled()) return null;

  return withSupabaseRetry("loadOrgSupervisorCycle", async () => {
    const { data, error } = await getSupabase()
      .from("org_supervisor_cycles")
      .select("open_count, desired_workers, active_claims, last_cycle_at, last_error")
      .eq("supervisor_kind", kind)
      .maybeSingle();
    if (error) throw new Error(`loadOrgSupervisorCycle(${kind}): ${error.message}`);
    if (!data) return null;
    return {
      open_count: Number(data.open_count) || 0,
      desired_workers: Number(data.desired_workers) || 0,
      active_claims: (data.active_claims as unknown[]) ?? [],
      last_cycle_at: (data.last_cycle_at as string | null) ?? null,
      last_error: (data.last_error as string | null) ?? null,
    };
  });
}
