import type { AgentRunResult } from "../types.js";
import type { AgentKitRolloutRow } from "../repo-workflow/types.js";
import { dbEnabled, getSupabase } from "./client.js";
import { withSupabaseRetry } from "./supabase-retry.js";

export interface PersistRunInput {
  run: AgentRunResult & {
    reason?: string;
    fingerprint?: string;
    briefing_hash?: string;
    coordinator?: string;
  };
  rolloutRows?: AgentKitRolloutRow[];
}

export interface AgentRunHistoryRow {
  run_id: string;
  agent_id: string;
  started_at: string;
  finished_at?: string | null;
  status: string;
  backend?: string | null;
  briefing_hash?: string | null;
  reason?: string | null;
  duration_ms?: number | null;
  output_md?: string | null;
  output_path?: string | null;
  error?: string | null;
  completion?: AgentRunResult["completion"] | null;
  pr_urls?: string[] | null;
  run_input?: AgentRunResult["runInput"] | null;
  run_trace?: AgentRunResult["trace"] | null;
  meta?: Record<string, unknown> | null;
  summary?: string;
  premature?: boolean;
}

function summaryFromOutput(text: string | undefined, max = 160): string {
  if (!text) return "";
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function rowToHistory(row: Record<string, unknown>): AgentRunHistoryRow {
  const completion = row.completion as AgentRunResult["completion"] | null;
  const output = (row.output_md as string) ?? "";
  return {
    run_id: String(row.run_id),
    agent_id: String(row.agent_id),
    started_at: String(row.started_at),
    finished_at: row.finished_at as string | null,
    status: String(row.status),
    backend: row.backend as string | null,
    briefing_hash: row.briefing_hash as string | null,
    reason: row.reason as string | null,
    duration_ms: row.duration_ms as number | null,
    output_md: output || null,
    output_path: row.output_path as string | null,
    error: row.error as string | null,
    completion: completion ?? null,
    pr_urls: (row.pr_urls as string[]) ?? [],
    run_input: (row.run_input as AgentRunResult["runInput"]) ?? null,
    run_trace: (row.run_trace as AgentRunResult["trace"]) ?? null,
    meta: (row.meta as Record<string, unknown>) ?? null,
    summary: summaryFromOutput(output),
    premature: completion?.premature ?? false,
  };
}

export async function upsertAgentRun(input: PersistRunInput): Promise<void> {
  if (!dbEnabled()) return;

  const { run, rolloutRows } = input;
  const base = run.outputPath.split("/").pop() ?? `${run.agentId}-${Date.now()}.md`;
  const runId = base.replace(/\.md$/, "");
  const tsMatch = /-(\d+)\.(md|json)$/.exec(base);
  const startedAt = tsMatch
    ? new Date(Number(tsMatch[1])).toISOString()
    : new Date(Date.now() - (run.durationMs ?? 0)).toISOString();
  const finishedAt = new Date().toISOString();
  const prUrls =
    run.completion?.pr_urls?.length ? run.completion.pr_urls : rolloutRows?.map((r) => r.pr_url).filter(Boolean) as string[] ?? [];

  const outputMd = run.outputText ?? null;

  const { error } = await getSupabase().from("agent_runs").upsert(
    {
      run_id: runId,
      agent_id: run.agentId,
      started_at: startedAt,
      finished_at: finishedAt,
      status: run.status,
      backend: run.backend,
      briefing_hash: run.briefing_hash ?? null,
      reason: run.reason ?? null,
      fingerprint: run.fingerprint ?? null,
      coordinator: run.coordinator ?? null,
      duration_ms: run.durationMs ?? null,
      output_md: outputMd,
      output_path: run.outputPath,
      error: run.error ?? null,
      completion: run.completion ?? null,
      pr_urls: prUrls,
      run_input: run.runInput ?? null,
      run_trace: run.trace ?? null,
      meta: {
        rollout_count: rolloutRows?.length ?? 0,
        tool_call_count: run.trace?.tool_call_count ?? 0,
        file_edit_count: run.trace?.file_edits?.length ?? 0,
      },
      updated_at: finishedAt,
    },
    { onConflict: "run_id" },
  );

  if (error) throw new Error(`agent_runs upsert: ${error.message}`);

  if (rolloutRows?.length) {
    await getSupabase().from("repo_workflow_rollouts").delete().eq("run_id", runId);
    const inserts = rolloutRows.map((r) => ({
      run_id: runId,
      rollout_kind: "agent_kit",
      repo: r.repo,
      install_ok: r.install_ok,
      workflow_ok: r.workflow_ok,
      pr_url: r.pr_url ?? null,
      skipped: r.skipped ?? false,
      skip_reason: r.skip_reason ?? null,
      governance: r.governance ?? false,
      error: r.error ?? null,
      workspace: r.workspace ?? null,
    }));
    const { error: roErr } = await getSupabase().from("repo_workflow_rollouts").insert(inserts);
    if (roErr) throw new Error(`repo_workflow_rollouts insert: ${roErr.message}`);
  }

  await getSupabase().from("agent_run_events").insert({
    run_id: runId,
    seq: 0,
    event_type: "run_finished",
    payload: { status: run.status, premature: run.completion?.premature ?? false },
  });

  if (run.trace?.steps?.length) {
    const events = run.trace.steps.map((step, idx) => ({
      run_id: runId,
      seq: idx + 1,
      event_type: step.type === "toolCall" ? "tool_call" : step.type,
      payload: step,
    }));
    const { error: evErr } = await getSupabase().from("agent_run_events").insert(events);
    if (evErr) throw new Error(`agent_run_events insert: ${evErr.message}`);
  }
}

export async function getRunEvents(runId: string): Promise<Array<{ seq: number; event_type: string; payload: unknown }>> {
  if (!dbEnabled()) return [];

  const { data, error } = await getSupabase()
    .from("agent_run_events")
    .select("seq, event_type, payload")
    .eq("run_id", runId)
    .order("seq", { ascending: true });

  if (error) throw new Error(`getRunEvents: ${error.message}`);
  return (data ?? []).map((r) => ({
    seq: Number(r.seq),
    event_type: String(r.event_type),
    payload: r.payload,
  }));
}

export async function listAgentRunHistory(agentId: string, limit = 50): Promise<AgentRunHistoryRow[]> {
  if (!dbEnabled()) return [];

  const { data, error } = await getSupabase()
    .from("agent_runs")
    .select("*")
    .eq("agent_id", agentId)
    .neq("backend", "mock")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listAgentRunHistory: ${error.message}`);
  return (data ?? []).map((row) => rowToHistory(row as Record<string, unknown>));
}

export async function listRunsGlobal(limit = 80): Promise<AgentRunHistoryRow[]> {
  return listRunsGlobalInRange({ limit });
}

export interface ListRunsGlobalInRangeOptions {
  since?: Date | null;
  until?: Date | null;
  /** Max rows to return (paginates in pages of 500). */
  limit?: number;
  /**
   * Omit heavy columns (`output_md`, etc.) for statistics aggregation.
   * Keeps `meta` + `run_trace` for tool/edit counts.
   */
  light?: boolean;
}

const RUNS_FULL_SELECT = "*";
const RUNS_LIGHT_SELECT =
  "run_id, agent_id, started_at, status, pr_urls, completion, meta, run_trace";

/** Scan agent_runs history with optional time bounds (newest first). */
export async function listRunsGlobalInRange(
  options: ListRunsGlobalInRangeOptions = {},
): Promise<AgentRunHistoryRow[]> {
  if (!dbEnabled()) return [];

  const max = Math.min(50_000, Math.max(1, options.limit ?? 10_000));
  const pageSize = options.light ? 200 : 500;
  const selectCols = options.light ? RUNS_LIGHT_SELECT : RUNS_FULL_SELECT;
  const out: AgentRunHistoryRow[] = [];
  let offset = 0;

  return withSupabaseRetry("listRunsGlobalInRange", async () => {
  while (out.length < max) {
    let q = getSupabase()
      .from("agent_runs")
      .select(selectCols)
      .neq("backend", "mock")
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (options.since) {
      q = q.gte("started_at", options.since.toISOString());
    }
    if (options.until) {
      q = q.lte("started_at", options.until.toISOString());
    }

    const { data, error } = await q;
    if (error) throw new Error(`listRunsGlobalInRange: ${error.message}`);
    const batch = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
      rowToHistory(row),
    );
    if (!batch.length) break;
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return out.slice(0, max);
  });
}

export async function getRunById(runId: string): Promise<AgentRunHistoryRow | null> {
  if (!dbEnabled()) return null;

  const { data, error } = await getSupabase().from("agent_runs").select("*").eq("run_id", runId).maybeSingle();
  if (error) throw new Error(`getRunById: ${error.message}`);
  if (!data) return null;
  return rowToHistory(data as Record<string, unknown>);
}

/** Live run row persisted by live-stream-persist (status still running). */
export async function getRunningRunById(runId: string): Promise<AgentRunHistoryRow | null> {
  if (!dbEnabled()) return null;

  const { data, error } = await getSupabase()
    .from("agent_runs")
    .select("*")
    .eq("run_id", runId)
    .eq("status", "running")
    .maybeSingle();
  if (error) throw new Error(`getRunningRunById: ${error.message}`);
  if (!data) return null;
  return rowToHistory(data as Record<string, unknown>);
}

export async function getRolloutsForRun(runId: string): Promise<AgentKitRolloutRow[]> {
  if (!dbEnabled()) return [];

  const { data, error } = await getSupabase().from("repo_workflow_rollouts").select("*").eq("run_id", runId);
  if (error) throw new Error(`getRolloutsForRun: ${error.message}`);

  return (data ?? []).map(
    (r): AgentKitRolloutRow => ({
      repo: String(r.repo),
      install_ok: Boolean(r.install_ok),
      workflow_ok: Boolean(r.workflow_ok),
      pr_url: r.pr_url ? String(r.pr_url) : undefined,
      skipped: Boolean(r.skipped),
      skip_reason: r.skip_reason ? String(r.skip_reason) : undefined,
      governance: Boolean(r.governance),
      error: r.error ? String(r.error) : undefined,
      workspace: r.workspace ? String(r.workspace) : undefined,
    }),
  );
}
