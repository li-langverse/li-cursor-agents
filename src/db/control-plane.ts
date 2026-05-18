import type { ControlPlaneReport, ControlPlaneState, HumanIntervention } from "../control-plane/types.js";
import type { HeapPlan } from "../heap/plan.js";
import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export async function loadControlPlaneStateFromDb(): Promise<ControlPlaneState | null> {
  if (!dbEnabled()) return null;

  return withSupabaseRetry("loadControlPlaneState", async () => {
    const { data, error } = await getSupabase()
      .from("control_plane_state")
      .select("payload")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`loadControlPlaneState: ${error.message}`);
    if (!data?.payload) return null;
    return data.payload as ControlPlaneState;
  });
}

export async function saveControlPlaneStateToDb(state: ControlPlaneState): Promise<void> {
  if (!dbEnabled()) return;

  await withSupabaseRetry("saveControlPlaneState", async () => {
    const { error } = await getSupabase()
      .from("control_plane_state")
      .upsert({ id: 1, version: state.version, payload: state, updated_at: new Date().toISOString() });
    if (error) throw new Error(`saveControlPlaneState: ${error.message}`);
  });
}

export async function saveReportToDb(
  report: ControlPlaneReport,
  interventions: HumanIntervention[],
): Promise<void> {
  if (!dbEnabled()) return;

  const supabase = getSupabase();
  const generatedAt = report.generated_at;

  await supabase.from("control_plane_reports").update({ is_latest: false }).eq("is_latest", true);

  const { error: repErr } = await supabase.from("control_plane_reports").insert({
    generated_at: generatedAt,
    briefing_hash: report.briefing_hash,
    payload: report,
    is_latest: true,
  });
  if (repErr) throw new Error(`control_plane_reports: ${repErr.message}`);

  const { error: ivErr } = await supabase.from("interventions_snapshots").insert({
    generated_at: generatedAt,
    briefing_hash: report.briefing_hash,
    items: interventions,
  });
  if (ivErr) throw new Error(`interventions_snapshots: ${ivErr.message}`);

  const briefing = report.preflight?.briefing;
  if (briefing && report.briefing_hash) {
    const generated =
      (briefing as Record<string, unknown>).generated_at ?? report.briefing_generated_at ?? generatedAt;
    await supabase.from("briefing_snapshots").update({ is_latest: false }).eq("is_latest", true);
    await supabase.from("briefing_snapshots").upsert({
      briefing_hash: report.briefing_hash,
      generated_at: String(generated),
      source_path: report.preflight.briefing_path ?? null,
      payload: briefing,
      is_latest: true,
    });
  }

  if (report.heap_plan && report.briefing_hash) {
    await supabase.from("heap_plan_snapshots").upsert({
      briefing_hash: report.briefing_hash,
      generated_at: generatedAt,
      payload: report.heap_plan,
    });
  }

  await saveQueuedTasksFromHeap(report.briefing_hash, report.heap_plan);
}

async function saveQueuedTasksFromHeap(briefingHash: string, heapPlan?: HeapPlan): Promise<void> {
  if (!dbEnabled() || !heapPlan?.flat_tasks?.length) return;

  const { syncWorkQueueToDb } = await import("./queued-tasks.js");
  const items = heapPlan.flat_tasks.map((t) => ({
    id: `heap:${t.coordinator}:${t.agent}:${t.reason}`.slice(0, 200),
    agent_id: t.agent,
    source: "heap" as const,
    priority: 50 + Math.min(10, t.priority ?? 0),
    reason: `[${t.coordinator}] ${t.reason}`,
    status: "pending" as const,
    meta: { coordinator: t.coordinator },
  }));
  await syncWorkQueueToDb(briefingHash, items);
}

export async function loadLatestReportFromDb(): Promise<ControlPlaneReport | null> {
  if (!dbEnabled()) return null;

  return withSupabaseRetry("loadLatestReport", async () => {
    const { data, error } = await getSupabase()
      .from("control_plane_reports")
      .select("payload")
      .eq("is_latest", true)
      .maybeSingle();

    if (error) throw new Error(`loadLatestReport: ${error.message}`);
    if (!data?.payload) return null;
    return data.payload as ControlPlaneReport;
  });
}

export async function loadLatestInterventionsFromDb(): Promise<HumanIntervention[]> {
  if (!dbEnabled()) return [];

  const live = await loadLiveInterventionsFromDb();
  if (live.length) return live;

  const { data, error } = await getSupabase()
    .from("interventions_snapshots")
    .select("items")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`loadLatestInterventions: ${error.message}`);
  return (data?.items as HumanIntervention[]) ?? [];
}

export async function saveLiveInterventionsToDb(params: {
  interventions: HumanIntervention[];
  briefingHash: string;
  briefingGeneratedAt: string;
  generatedAt: string;
}): Promise<void> {
  if (!dbEnabled()) return;

  const row = {
    id: 1,
    generated_at: params.generatedAt,
    briefing_hash: params.briefingHash,
    briefing_generated_at: params.briefingGeneratedAt,
    items: params.interventions,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabase().from("interventions_latest").upsert(row);
  if (error) throw new Error(`interventions_latest: ${error.message}`);

  const { error: snapErr } = await getSupabase().from("interventions_snapshots").insert({
    generated_at: params.generatedAt,
    briefing_hash: params.briefingHash,
    items: params.interventions,
  });
  if (snapErr) throw new Error(`interventions_snapshots: ${snapErr.message}`);
}

export async function loadLiveInterventionsFromDb(): Promise<HumanIntervention[]> {
  if (!dbEnabled()) return [];

  return withSupabaseRetry("loadLiveInterventions", async () => {
    const { data, error } = await getSupabase()
      .from("interventions_latest")
      .select("items")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new Error(`loadLiveInterventions: ${error.message}`);
    return (data?.items as HumanIntervention[]) ?? [];
  });
}

export async function loadBriefingFromDb(briefingHash: string): Promise<unknown | null> {
  if (!dbEnabled()) return null;

  const { data, error } = await getSupabase()
    .from("briefing_snapshots")
    .select("payload")
    .eq("briefing_hash", briefingHash)
    .maybeSingle();

  if (error) throw new Error(`loadBriefing: ${error.message}`);
  return data?.payload ?? null;
}
