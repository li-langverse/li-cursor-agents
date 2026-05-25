import type { AgentRunInputRecord, AgentRunTrace } from "../agent-run-trace.js";
import { dbEnabled, getSupabase } from "./client.js";
import { flushRunEvents, recordRunStarted, resetRunEventsState } from "./run-events.js";
import { withSupabaseRetry } from "./supabase-retry.js";

/** Persist finest-grain SDK stream to Supabase during runs (Next.js reads without worker in-process state). */
export function liveStreamDbEnabled(): boolean {
  if (!dbEnabled()) return false;
  const off = process.env.LI_LIVE_STREAM_DB?.trim();
  return off !== "0" && off !== "false";
}

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const liveRunMeta = new Map<string, { agentId: string; startedAt: string; outputPath?: string; reason?: string; backend?: string }>();

export function resetLiveStreamPersistState(runId?: string): void {
  if (runId) {
    liveRunMeta.delete(runId);
    const t = flushTimers.get(runId);
    if (t) clearTimeout(t);
    flushTimers.delete(runId);
    resetRunEventsState(runId);
    return;
  }
  liveRunMeta.clear();
  for (const t of flushTimers.values()) clearTimeout(t);
  flushTimers.clear();
  resetRunEventsState();
}

export async function upsertLiveAgentRunStart(params: {
  runId: string;
  agentId: string;
  startedAt: string;
  runInput?: AgentRunInputRecord;
  outputPath?: string;
  reason?: string;
  backend?: string;
}): Promise<void> {
  if (!liveStreamDbEnabled()) return;

  liveRunMeta.set(params.runId, {
    agentId: params.agentId,
    startedAt: params.startedAt,
    outputPath: params.outputPath,
    reason: params.reason,
    backend: params.backend ?? params.runInput?.backend,
  });

  await withSupabaseRetry("upsertLiveAgentRunStart", async () => {
    const { error } = await getSupabase().from("agent_runs").upsert(
      {
        run_id: params.runId,
        agent_id: params.agentId,
        started_at: params.startedAt,
        status: "running",
        backend: params.backend ?? params.runInput?.backend ?? "cursor-sdk",
        output_path: params.outputPath ?? null,
        run_input: params.runInput ?? null,
        run_trace: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id" },
    );
    if (error) throw new Error(`upsertLiveAgentRunStart: ${error.message}`);
  });
  recordRunStarted(params.runId, params.agentId, params.reason);
}

export async function flushLiveTraceToDb(
  runId: string,
  trace: AgentRunTrace,
  opts?: { runInput?: AgentRunInputRecord; agentId?: string },
): Promise<void> {
  if (!liveStreamDbEnabled()) return;

  const debounceMs = Number(process.env.LI_LIVE_STREAM_DB_DEBOUNCE_MS ?? 50);
  if (Number.isFinite(debounceMs) && debounceMs > 0) {
    const prev = flushTimers.get(runId);
    if (prev) clearTimeout(prev);
    flushTimers.set(
      runId,
      setTimeout(() => {
        flushTimers.delete(runId);
        void flushLiveTraceToDbNow(runId, trace, opts).catch(() => {});
      }, debounceMs),
    );
    return;
  }
  await flushLiveTraceToDbNow(runId, trace, opts);
}

async function flushLiveTraceToDbNow(
  runId: string,
  trace: AgentRunTrace,
  opts?: { runInput?: AgentRunInputRecord; agentId?: string },
): Promise<void> {
  const now = new Date().toISOString();

  const meta = liveRunMeta.get(runId);
  const agentId = opts?.agentId ?? meta?.agentId;
  if (!agentId) return;

  await withSupabaseRetry("flushLiveTraceToDb", async () => {
    const updatePatch: Record<string, unknown> = {
      status: "running",
      run_trace: trace,
      updated_at: now,
    };
    if (opts?.runInput) updatePatch.run_input = opts.runInput;

    const { data: updated, error: updateErr } = await getSupabase()
      .from("agent_runs")
      .update(updatePatch)
      .eq("run_id", runId)
      .select("run_id");

    if (updateErr) throw new Error(`flushLiveTraceToDb: ${updateErr.message}`);

    if (!updated?.length) {
      const startedAt = meta?.startedAt ?? now;
      const { error: upsertErr } = await getSupabase().from("agent_runs").upsert(
        {
          run_id: runId,
          agent_id: agentId,
          started_at: startedAt,
          status: "running",
          backend: meta?.backend ?? opts?.runInput?.backend ?? "cursor-sdk",
          output_path: meta?.outputPath ?? null,
          run_input: opts?.runInput ?? null,
          run_trace: trace,
          updated_at: now,
        },
        { onConflict: "run_id" },
      );
      if (upsertErr) throw new Error(`flushLiveTraceToDb upsert: ${upsertErr.message}`);
    }
  });

  await flushRunEvents(runId);
}
