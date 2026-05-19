/** Compact briefing JSON for Cursor SDK user messages (full file remains on disk). */

const MAX_CHARS = Number(process.env.LI_BRIEFING_PROMPT_MAX_CHARS ?? 16_000);

export function compactBriefingForPrompt(briefing: unknown): string {
  if (!briefing || typeof briefing !== "object") {
    return JSON.stringify({ empty: true }, null, 2);
  }
  const b = briefing as Record<string, unknown>;
  const audit = b.ecosystem_audit as Record<string, unknown> | undefined;
  const bench = audit?.benchmarks as Record<string, unknown> | undefined;
  const plan = b.plan_completion_audit as Record<string, unknown> | undefined;
  const gaps = b.agent_deliverable_gaps as Record<string, unknown> | undefined;
  const dirty = b.workspace_dirty_sweep as Record<string, unknown> | undefined;
  const merge = b.merge_plan as Record<string, unknown> | undefined;
  const pr = b.pr_program as Record<string, unknown> | undefined;

  const compact: Record<string, unknown> = {
    generated_at: b.generated_at,
    recommended_agents: b.recommended_agents,
    org_roadmap: b.org_roadmap,
    heap_plan: b.heap_plan
      ? {
          priority_order: (b.heap_plan as Record<string, unknown>).priority_order,
          flat_tasks: (b.heap_plan as Record<string, unknown>).flat_tasks,
        }
      : undefined,
    ecosystem_audit: audit
      ? {
          generated_at: audit.generated_at,
          benchmarks: bench
            ? {
                generated_at: bench.generated_at,
                red: bench.red,
                yellow: bench.yellow,
                near_threshold: bench.near_threshold,
                green_count: bench.green_count,
                unknown: bench.unknown,
              }
            : undefined,
          metrics: audit.metrics,
          failed_prs: Array.isArray(audit.failed_prs)
            ? (audit.failed_prs as unknown[]).slice(0, 8)
            : undefined,
        }
      : undefined,
    plan_completion_audit: plan
      ? { summary: plan.summary, master_plan_open: plan.master_plan_open }
      : undefined,
    agent_deliverable_gaps: gaps,
    workspace_dirty_sweep: dirty
      ? { dirty_count: dirty.dirty_count, dirty_repos: dirty.dirty_repos }
      : undefined,
    merge_plan: merge
      ? {
          next_merge: merge.next_merge,
          summary: merge.summary,
          merge_sequence: Array.isArray(merge.merge_sequence)
            ? (merge.merge_sequence as unknown[]).slice(0, 5)
            : undefined,
        }
      : undefined,
    pr_program: pr ? { summary: pr.summary, merge_first: pr.merge_first } : undefined,
    implementation_queue: Array.isArray(b.implementation_queue)
      ? (b.implementation_queue as unknown[]).slice(0, 8)
      : undefined,
    org_new_repos_discovery: summarizeOrgNewReposDiscovery(b.org_new_repos_discovery),
    preflight_runs: summarizePreflightRuns(b.preflight_runs),
  };

  let text = JSON.stringify(compact, null, 2);
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS - 80)}\n/* truncated — read full agent-briefing.json on disk */\n`;
  }
  return text;
}

function summarizeOrgNewReposDiscovery(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const entries = Array.isArray(d.new_repo_entries)
    ? (d.new_repo_entries as unknown[]).slice(0, 12)
    : undefined;
  return {
    summary: d.summary,
    new_repos: d.new_repos,
    stale_known_repos: d.stale_known_repos,
    new_repo_entries: entries,
  };
}

function summarizePreflightRuns(
  runs: unknown,
): Record<string, { exit_code?: number; skipped?: boolean; reason?: string }> | undefined {
  if (!runs || typeof runs !== "object") return undefined;
  const out: Record<string, { exit_code?: number; skipped?: boolean; reason?: string }> = {};
  for (const [key, v] of Object.entries(runs as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const row = v as Record<string, unknown>;
    const skipped = Boolean(row.skipped);
    const exit = row.exit_code as number | undefined;
    if (skipped && exit === undefined) {
      out[key] = { skipped: true, reason: String(row.reason ?? "") };
      continue;
    }
    if ((exit ?? 0) !== 0 || key === "ecosystem_audit" || key === "workspace_dirty_sweep") {
      out[key] = {
        exit_code: exit,
        skipped,
        reason: typeof row.reason === "string" ? row.reason : undefined,
      };
    }
  }
  return Object.keys(out).length ? out : undefined;
}
