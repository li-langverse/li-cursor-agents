import { createHash } from "node:crypto";

/** Stable hash so we do not re-dispatch agents when briefing is unchanged. */
export function hashBriefing(briefing: unknown): string {
  const payload = extractSignals(briefing);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function extractSignals(briefing: unknown): Record<string, unknown> {
  if (!briefing || typeof briefing !== "object") return { empty: true };
  const b = briefing as Record<string, unknown>;
  return {
    recommended_agents: b.recommended_agents,
    preflight_failed: failedPreflightKeys(b),
    pr_summary: prSummary(b),
    plan_findings: planFindings(b),
    red_benches: redBenches(b),
  };
}

function failedPreflightKeys(b: Record<string, unknown>): string[] {
  const runs = b.preflight_runs as Record<string, { exit_code?: number; skipped?: boolean }> | undefined;
  if (!runs) return [];
  return Object.entries(runs)
    .filter(([, v]) => v && !v.skipped && (v.exit_code ?? 0) !== 0)
    .map(([k]) => k);
}

function prSummary(b: Record<string, unknown>): Record<string, number> | null {
  const pr = b.pr_program as Record<string, unknown> | undefined;
  const summary = (pr?.summary ?? pr) as Record<string, number> | undefined;
  if (!summary || typeof summary !== "object") return null;
  return {
    open_prs: summary.open_prs ?? (pr?.open as number) ?? 0,
    ci_green: summary.ci_green ?? 0,
    merge_approved: summary.merge_approved ?? 0,
  };
}

function planFindings(b: Record<string, unknown>): number {
  const plan = b.plan_completion_audit as Record<string, unknown> | undefined;
  const summary = plan?.summary as { total_findings?: number } | undefined;
  return summary?.total_findings ?? 0;
}

function redBenches(b: Record<string, unknown>): number {
  const audit = b.ecosystem_audit as Record<string, unknown> | undefined;
  const bench = audit?.benchmarks as { red?: number } | undefined;
  return bench?.red ?? 0;
}
