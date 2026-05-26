import { listRunsGlobalInRange } from "../db/runs.js";
import type { AgentRunHistoryRow } from "../db/runs.js";
import type { ParsedStatsTimeRange } from "./stats-time-range.js";

export interface RunErrorCategory {
  error_key: string;
  count: number;
  agents: string[];
  sample_run_id: string;
  latest_at: string;
}

export interface RunErrorsSummary {
  generated_at: string;
  range_preset?: string;
  range_since?: string | null;
  range_until?: string;
  total_errors: number;
  unique_categories: number;
  categories: RunErrorCategory[];
}

function errorKey(row: AgentRunHistoryRow): string {
  const err = (row.error ?? "").trim() || "(no error message)";
  if (err === "stale_running_reconciled") return "stale_running_reconciled";
  return err.slice(0, 200);
}

/** Group error-status runs for dashboard summary (dedupes identical error strings). */
export function summarizeRunErrors(
  rows: AgentRunHistoryRow[],
  timeRange?: ParsedStatsTimeRange,
): RunErrorsSummary {
  const errors = rows.filter((r) => r.status === "error");
  const byKey = new Map<
    string,
    { count: number; agents: Set<string>; sample_run_id: string; latest_at: string }
  >();

  for (const row of errors) {
    const key = errorKey(row);
    const at = row.finished_at ?? row.started_at;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        count: 0,
        agents: new Set(),
        sample_run_id: row.run_id,
        latest_at: at,
      };
      byKey.set(key, bucket);
    }
    bucket.count++;
    bucket.agents.add(row.agent_id);
    if (at >= bucket.latest_at) {
      bucket.latest_at = at;
      bucket.sample_run_id = row.run_id;
    }
  }

  const categories: RunErrorCategory[] = [...byKey.entries()]
    .map(([error_key, b]) => ({
      error_key,
      count: b.count,
      agents: [...b.agents].sort(),
      sample_run_id: b.sample_run_id,
      latest_at: b.latest_at,
    }))
    .sort((a, b) => b.count - a.count || b.latest_at.localeCompare(a.latest_at));

  return {
    generated_at: new Date().toISOString(),
    range_preset: timeRange?.preset,
    range_since: timeRange?.since?.toISOString() ?? null,
    range_until: timeRange?.until.toISOString(),
    total_errors: errors.length,
    unique_categories: categories.length,
    categories,
  };
}

export async function buildRunErrorsSummary(
  limit: number,
  timeRange: ParsedStatsTimeRange,
): Promise<RunErrorsSummary> {
  const rows = await listRunsGlobalInRange({
    since: timeRange.since,
    until: timeRange.until,
    limit,
    light: true,
  });
  return summarizeRunErrors(rows, timeRange);
}

const STALE_RECONCILE_ERROR = "stale_running_reconciled";

/** Collapse noisy duplicate error rows in run history / activity lists. */
export function dedupeRunCatalogForDisplay<
  T extends { run_id: string; agent_id: string; status: string; error?: string | null; started_at: string },
>(runs: T[]): T[] {
  const out: T[] = [];
  const staleByAgent = new Map<string, T>();

  for (const run of runs) {
    const err = (run.error ?? "").trim();
    if (run.status === "error" && err === STALE_RECONCILE_ERROR) {
      const prev = staleByAgent.get(run.agent_id);
      if (!prev || run.started_at > prev.started_at) {
        staleByAgent.set(run.agent_id, run);
      }
      continue;
    }
    out.push(run);
  }
  out.push(...staleByAgent.values());
  out.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  return out;
}
