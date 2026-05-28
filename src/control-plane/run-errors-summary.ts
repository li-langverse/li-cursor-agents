import {
  isStaleReconcileCategory,
  isStaleReconcileError,
} from "../db/reconcile-error-categories.js";
import { listRunsGlobalInRange } from "../db/runs.js";
import type { AgentRunHistoryRow } from "../db/runs.js";
import type { ParsedStatsTimeRange } from "./stats-time-range.js";

const MAX_EXAMPLE_RUN_IDS = 5;

export interface RunErrorByAgent {
  agent_id: string;
  count: number;
  example_run_ids: string[];
  latest_at: string;
}

export interface RunErrorCategory {
  /** Normalized error category (same as error_key for now). */
  category: string;
  error_key: string;
  count: number;
  by_agent: RunErrorByAgent[];
  sample_run_id: string;
  latest_at: string;
}

export interface RunErrorsSummary {
  generated_at: string;
  range_preset?: string;
  range_since?: string | null;
  range_until?: string;
  /** Raw error rows in range (no dedupe). */
  total_errors: number;
  /** Rows categorized as restart bookkeeping (stale / unregistered reconcile). */
  stale_reconcile_count: number;
  /** Rows with any other error category — actionable failures. */
  real_error_count: number;
  unique_categories: number;
  categories: RunErrorCategory[];
}

export function splitStaleReconcileCounts(categories: RunErrorCategory[]): {
  stale_reconcile_count: number;
  real_error_count: number;
} {
  let stale_reconcile_count = 0;
  let real_error_count = 0;
  for (const c of categories) {
    if (isStaleReconcileCategory(c.category)) stale_reconcile_count += c.count;
    else real_error_count += c.count;
  }
  return { stale_reconcile_count, real_error_count };
}

function errorCategory(row: AgentRunHistoryRow): string {
  const err = (row.error ?? "").trim() || "(no error message)";
  if (isStaleReconcileError(err)) return err;
  if (err.includes("sdk-session.lock")) return "sdk_slot_timeout";
  return err.slice(0, 200);
}

/** Reporting-only: group error rows by category and agent (no DB writes). */
export function summarizeRunErrors(
  rows: AgentRunHistoryRow[],
  timeRange?: ParsedStatsTimeRange,
): RunErrorsSummary {
  const errors = rows.filter((r) => r.status === "error");
  const byCategory = new Map<
    string,
    {
      count: number;
      sample_run_id: string;
      latest_at: string;
      byAgent: Map<
        string,
        { count: number; example_run_ids: string[]; latest_at: string }
      >;
    }
  >();

  for (const row of errors) {
    const category = errorCategory(row);
    const at = row.finished_at ?? row.started_at;
    let cat = byCategory.get(category);
    if (!cat) {
      cat = {
        count: 0,
        sample_run_id: row.run_id,
        latest_at: at,
        byAgent: new Map(),
      };
      byCategory.set(category, cat);
    }
    cat.count++;
    if (at >= cat.latest_at) {
      cat.latest_at = at;
      cat.sample_run_id = row.run_id;
    }

    let agent = cat.byAgent.get(row.agent_id);
    if (!agent) {
      agent = { count: 0, example_run_ids: [], latest_at: at };
      cat.byAgent.set(row.agent_id, agent);
    }
    agent.count++;
    if (agent.example_run_ids.length < MAX_EXAMPLE_RUN_IDS) {
      agent.example_run_ids.push(row.run_id);
    }
    if (at >= agent.latest_at) agent.latest_at = at;
  }

  const categories: RunErrorCategory[] = [...byCategory.entries()]
    .map(([error_key, c]) => ({
      category: error_key,
      error_key,
      count: c.count,
      by_agent: [...c.byAgent.entries()]
        .map(([agent_id, a]) => ({
          agent_id,
          count: a.count,
          example_run_ids: a.example_run_ids,
          latest_at: a.latest_at,
        }))
        .sort((x, y) => y.count - x.count || x.agent_id.localeCompare(y.agent_id)),
      sample_run_id: c.sample_run_id,
      latest_at: c.latest_at,
    }))
    .sort((a, b) => b.count - a.count || b.latest_at.localeCompare(a.latest_at));

  const { stale_reconcile_count, real_error_count } = splitStaleReconcileCounts(categories);

  return {
    generated_at: new Date().toISOString(),
    range_preset: timeRange?.preset,
    range_since: timeRange?.since?.toISOString() ?? null,
    range_until: timeRange?.until.toISOString(),
    total_errors: errors.length,
    stale_reconcile_count,
    real_error_count,
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
