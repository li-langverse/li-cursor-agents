import type { AgentDefinition, AgentId } from "./types.js";
import type { AgentRunCompletionMeta, AgentRunResult, PreflightBundle } from "./types.js";
import type { AgentRunTrace } from "./agent-run-trace.js";
import {
  buildRemediationManifest,
  formatRemediationDeliverableSection,
} from "./ux-audit/remediation-manifest.js";

export interface AgentRunErrorDetail {
  name?: string;
  message: string;
  stack?: string;
}

export interface FormatAgentOutputParams {
  definition: AgentDefinition;
  runId: string;
  status: AgentRunResult["status"];
  backend: AgentRunResult["backend"];
  durationMs: number;
  /** LLM or mock deliverable (may be empty on hard failure). */
  body: string;
  error?: string;
  errorDetail?: AgentRunErrorDetail;
  briefing?: unknown;
  preflight?: PreflightBundle;
  trace?: AgentRunTrace;
  completion?: AgentRunCompletionMeta;
  mock?: boolean;
}

export function errorDetailFromUnknown(err: unknown): AgentRunErrorDetail {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message || String(err),
      stack: err.stack,
    };
  }
  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    const message = String(o.message ?? o.error ?? err);
    const stack = typeof o.stack === "string" ? o.stack : undefined;
    return { name: typeof o.name === "string" ? o.name : undefined, message, stack };
  }
  return { message: String(err) };
}

export function formatErrorMarkdown(detail: AgentRunErrorDetail): string {
  const lines = [
    "## Errors",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| **Type** | \`${detail.name ?? "Error"}\` |`,
    `| **Message** | ${escapeTableCell(detail.message)} |`,
  ];
  if (detail.stack?.trim()) {
    lines.push("", "### Stack trace", "", "```", detail.stack.trim(), "```");
  } else {
    lines.push("", "_No stack trace available._");
  }
  return lines.join("\n");
}

export function buildFormattedOutput(p: FormatAgentOutputParams): string {
  const sections: string[] = [];
  const statusLabel = p.status === "incomplete" ? "incomplete (premature)" : p.status;

  sections.push(
    `# Agent run: ${p.definition.name}`,
    "",
    `> \`${p.definition.id}\` · ${p.definition.category} · backend \`${p.backend}\`${p.mock ? " · **mock**" : ""}`,
    "",
    "## Run metadata",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| **Status** | \`${statusLabel}\` |`,
    `| **Run ID** | \`${p.runId}\` |`,
    `| **Duration** | ${(p.durationMs / 1000).toFixed(2)}s |`,
    `| **Prompt** | \`prompts/${p.definition.promptFile}\` |`,
  );

  if (p.preflight?.briefing_path) {
    sections.push(`| **Briefing** | \`${p.preflight.briefing_path}\` |`);
  }
  if (p.preflight?.generated_at) {
    sections.push(`| **Preflight at** | ${p.preflight.generated_at} |`);
  }

  const preflightCtx = buildPreflightContextSection(p.definition.id, p.briefing ?? p.preflight?.briefing);
  if (preflightCtx) {
    sections.push("", preflightCtx);
  }

  if (p.trace && (p.trace.tool_call_count > 0 || p.trace.file_edits.length > 0)) {
    sections.push("", buildTraceSummarySection(p.trace));
  }

  if (p.completion) {
    sections.push("", buildCompletionSection(p.completion));
  }

  sections.push("", "## Deliverable", "");
  const body = p.body?.trim();
  if (body) {
    sections.push(body);
  } else if (!p.error && !p.errorDetail) {
    sections.push("_No deliverable text was recorded._");
  }

  if (p.errorDetail) {
    sections.push("", formatErrorMarkdown(p.errorDetail));
  } else if (p.error?.trim()) {
    sections.push("", formatErrorMarkdown({ message: p.error.trim() }));
  }

  sections.push(
    "",
    "---",
    `_Formatted by li-cursor-agents · ${new Date().toISOString()}_`,
    `<!-- li-agent-role: ${p.definition.id} -->`,
  );
  return sections.join("\n");
}

/** Mock deliverable body before wrapping (agent-specific). */
export function buildMockDeliverable(
  definition: AgentDefinition,
  briefing: Record<string, unknown> | null,
  userMessage: string,
): string {
  switch (definition.id) {
    case "plan_verifier":
      return buildPlanVerifierMockBody(briefing);
    case "implementation_gaps":
      return buildImplementationGapsMockBody(briefing);
    case "code_implementer":
    case "studio_ui_ux_builder":
    case "bug_fixer":
    case "security_auditor":
      return buildImplementationGapsMockBody(briefing);
    case "pr_merger":
      return buildPrMergerMockBody(briefing);
    case "pr_branch_opener":
    case "pr_alignment":
    case "pr_reviewer":
      return buildPrReviewMockBody(definition.id, briefing);
    case "gap_explorer":
      return buildGapExplorerMockBody(briefing);
    case "issue_planner":
      return buildIssuePlannerMockBody(briefing);
    case "numerics_researcher":
    case "autoresearch":
    case "bench_improver":
      return buildNumericsMockBody(definition.id, briefing);
    case "org_repo_onboarder":
      return buildOrgRepoOnboarderMockBody(briefing);
    case "docs_ui_tester":
    case "docs_ux_tester":
    case "gui_ui_tester":
    case "gui_ux_tester":
    case "tui_ui_tester":
    case "tui_ux_tester":
      return buildUiUxTesterMockBody(definition.id, briefing);
    default:
      return buildGenericMockBody(definition, briefing, userMessage);
  }
}

function buildPreflightContextSection(agentId: string, briefing: unknown): string | null {
  if (!briefing || typeof briefing !== "object") return null;
  const b = briefing as Record<string, unknown>;

  if (agentId === "plan_verifier" || agentId === "implementation_gaps") {
    return buildPlanAuditSection(b);
  }
  if (
    agentId === "pr_branch_opener" ||
    agentId === "pr_alignment" ||
    agentId === "pr_reviewer" ||
    agentId === "pr_merger"
  ) {
    return buildMergePlanSection(b);
  }
  if (agentId === "gap_explorer") {
    return buildExplorerSection(b);
  }
  if (agentId === "numerics_researcher" || agentId === "autoresearch" || agentId === "bench_improver") {
    return buildEcosystemAuditSection(b);
  }
  return null;
}

function buildPlanAuditSection(b: Record<string, unknown>): string {
  const audit = (b.plan_completion_audit ?? b.plan_audit) as Record<string, unknown> | undefined;
  if (!audit) {
    return "## Preflight: plan audit\n\n_No `plan_completion_audit` in briefing — run `plan-completion-audit.py`._";
  }
  const summary = (audit.summary ?? {}) as Record<string, number>;
  const lines = [
    "## Preflight: plan completion audit",
    "",
    "| Metric | Count |",
    "|--------|------:|",
  ];
  for (const [k, v] of Object.entries(summary)) {
    if (typeof v === "number") lines.push(`| ${k.replace(/_/g, " ")} | ${v} |`);
  }
  lines.push("", "### Master plan (open excerpts)", "");
  appendItemList(lines, audit.master_plan_open, 8);
  lines.push("", "### Plan file checkboxes (sample)", "");
  appendItemList(lines, audit.plan_files_open, 6);
  const gaps = audit.provability_gaps as Record<string, unknown> | undefined;
  if (gaps) {
    lines.push("", "### Provability gaps", "");
    if (gaps.missing_file) lines.push(`- **missing file:** \`${gaps.missing_file}\``);
    appendItemList(lines, gaps.partial, 4, "partial");
    appendItemList(lines, gaps.missing, 4, "missing");
  }
  appendItemList(lines, audit.catalog_gaps, 5, "catalog");
  const actions = b.recommended_actions as unknown[] | undefined;
  if (Array.isArray(actions) && actions.length) {
    lines.push("", "### Recommended actions (briefing)", "");
    for (const a of actions.slice(0, 5)) {
      if (typeof a === "object" && a && "action" in a) {
        lines.push(`- ${(a as { action: string }).action}`);
      }
    }
  }
  return lines.join("\n");
}

function buildMergePlanSection(b: Record<string, unknown>): string {
  const mp = b.merge_plan as Record<string, unknown> | undefined;
  if (!mp) return "## Preflight: merge plan\n\n_No merge_plan in briefing._";
  const lines = ["## Preflight: merge queue", ""];
  const next = mp.next_merge as Record<string, unknown> | undefined;
  if (next) {
    lines.push(`- **Next merge:** ${next.repo}#${next.number} ${next.url ?? ""}`);
  } else {
    lines.push("- **Next merge:** _(none)_");
  }
  const seq = mp.merge_sequence as unknown[] | undefined;
  if (Array.isArray(seq) && seq.length) {
    lines.push("", "| # | Repo | PR | CI |", "|--:|------|-----|-----|");
    seq.slice(0, 10).forEach((row, i) => {
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>;
        lines.push(
          `| ${i + 1} | ${r.repo ?? "?"} | #${r.number ?? "?"} | ${r.ci_green ?? r.ci ?? "—"} |`,
        );
      }
    });
  }
  return lines.join("\n");
}

function buildExplorerSection(b: Record<string, unknown>): string {
  const ex = (b.ecosystem_explorer ?? b.explorer) as Record<string, unknown> | undefined;
  if (!ex) return "## Preflight: ecosystem explorer\n\n_No explorer payload._";
  const lines = ["## Preflight: ecosystem explorer", ""];
  const missing = ex.missing_std_modules as unknown[] | undefined;
  if (Array.isArray(missing) && missing.length) {
    lines.push("### Missing std modules", "");
    for (const m of missing.slice(0, 12)) {
      if (m && typeof m === "object") {
        const row = m as Record<string, unknown>;
        lines.push(`- \`${row.module ?? "?"}\` — ${row.status ?? ""} (${row.ph_id ?? "no PH"})`);
      }
    }
  }
  return lines.join("\n");
}

function buildEcosystemAuditSection(b: Record<string, unknown>): string {
  const audit = b.ecosystem_audit as Record<string, unknown> | undefined;
  if (!audit) return "## Preflight: ecosystem audit\n\n_No ecosystem_audit payload._";
  const bench = audit.benchmarks as Record<string, unknown> | undefined;
  const lines = ["## Preflight: ecosystem / benchmarks", ""];
  if (bench) {
    lines.push("| Signal | Value |", "|--------|-------|");
    for (const [k, v] of Object.entries(bench).slice(0, 8)) {
      lines.push(`| ${k} | ${escapeTableCell(String(v))} |`);
    }
  }
  return lines.join("\n");
}

function buildTraceSummarySection(trace: AgentRunTrace): string {
  const lines = [
    "## Execution trace (summary)",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Tool calls | ${trace.tool_call_count} |`,
    `| Steps | ${trace.steps.length} |`,
    `| File edits | ${trace.file_edits.length} |`,
  ];
  if (trace.file_edits.length) {
    lines.push("", "### Files touched", "");
    for (const e of trace.file_edits.slice(0, 20)) {
      const ok = e.ok === false ? " ✗" : "";
      lines.push(`- \`${e.path}\` (${e.tool})${ok}`);
    }
    if (trace.file_edits.length > 20) lines.push(`- _…and ${trace.file_edits.length - 20} more_`);
  }
  return lines.join("\n");
}

function buildCompletionSection(c: AgentRunCompletionMeta): string {
  const lines = [
    "## Completion audit",
    "",
    "| Check | Result |",
    "|-------|--------|",
    `| Complete | ${c.complete ? "yes" : "no"} |`,
    `| Premature | ${c.premature ? "yes" : "no"} |`,
    `| Deliverable section | ${c.deliverable_checked ? "yes" : "no"} |`,
  ];
  if (c.pr_urls.length) {
    lines.push("", "### PR URLs", "", ...c.pr_urls.map((u) => `- ${u}`));
  }
  if (c.gaps.length) {
    lines.push("", "### Gaps", "", ...c.gaps.map((g) => `- ${g}`));
  }
  if (c.evidence.length) {
    lines.push("", "### Evidence", "", ...c.evidence.map((e) => `- ${e}`));
  }
  if (c.skip_reason) lines.push("", `**Skip reason:** ${c.skip_reason}`);
  return lines.join("\n");
}

function buildPlanVerifierMockBody(briefing: Record<string, unknown> | null): string {
  const lines = [
    "## Executive summary",
    "- Audited open PH / master-plan items against preflight `plan_completion_audit`.",
    "- Marked items **done** only where test or Lean evidence exists in the audit payload.",
    "- Proposed up to 3 issues with labels `plan-needed` or `master-plan-gap`.",
    "",
    "## Tracker review",
  ];
  const audit = briefing?.plan_completion_audit as Record<string, unknown> | undefined;
  if (!audit) {
    lines.push("- _No plan audit in briefing — mock run only._");
  } else {
    const summary = audit.summary as Record<string, number> | undefined;
    if (summary) {
      lines.push(
        `- Open tracker items: **${summary.open_tracker_items ?? "?"}**`,
        `- Open plan checkboxes: **${summary.open_plan_checkboxes ?? "?"}**`,
        `- Total findings: **${summary.total_findings ?? "?"}**`,
      );
    }
    lines.push("", "### Sample open master-plan rows", "");
    appendItemList(lines, audit.master_plan_open, 5);
  }
  lines.push(
    "",
    "## Recommended issues (mock)",
    "1. `[plan-needed]` Close PH tracker with evidence links in plan doc",
    "2. `[master-plan-gap]` Link phase exit gates to G-* ids (Doc-c)",
    "",
    "## Deferred",
    "- No code changes in this pass (plan audit only).",
  );
  return lines.join("\n");
}

function buildImplementationGapsMockBody(briefing: Record<string, unknown> | null): string {
  return [
    "## Executive summary",
    "- Compared plan debt vs repo reality using plan audit + explorer signals.",
    "- Filed mock issues for missing PH implementation evidence.",
    "",
    "## Plan vs code gaps",
    ...(briefing?.plan_completion_audit
      ? ["- See preflight plan audit table above."]
      : ["- _No plan audit attached._"]),
    "",
    "## Recommended issues (mock)",
    "1. `[plan-needed]` Implement missing catalog bench path cited in audit",
  ].join("\n");
}

function buildPrMergerMockBody(briefing: Record<string, unknown> | null): string {
  const mp = briefing?.merge_plan as Record<string, unknown> | undefined;
  const next = mp?.next_merge as Record<string, unknown> | undefined;
  return [
    "## Executive summary",
    "- Reviewed merge queue from briefing `merge_plan`.",
    next
      ? `- Would merge next: **${next.repo}#${next.number}**`
      : "- No `next_merge` — would skip merge this tick.",
    "",
    "## Actions (mock)",
    "1. `pr-auto-merge.py --dry-run` on candidate PR",
    "2. Stop after at most one merge per repo",
  ].join("\n");
}

function buildPrReviewMockBody(agentId: string, briefing: Record<string, unknown> | null): string {
  const pr = briefing?.pr_program as Record<string, unknown> | undefined;
  return [
    "## Executive summary",
    `- ${agentId === "pr_reviewer" ? "Standards" : "Alignment"} review pass on open PR program.`,
    pr ? `- Open PRs: **${pr.open ?? "?"}** · CI green: **${pr.ci_green ?? "?"}**` : "- _No pr_program stats._",
    "",
    "## Findings (mock)",
    "- Release notes present: verify per PR",
    "- Proof / security / perf gates: see merge gate output",
  ].join("\n");
}

function buildGapExplorerMockBody(briefing: Record<string, unknown> | null): string {
  const ex = briefing?.ecosystem_explorer as Record<string, unknown> | undefined;
  const missing = (ex?.missing_std_modules as unknown[]) ?? [];
  return [
    "## Executive summary",
    "- Scanned ecosystem gaps (std, HPC, catalog).",
    `- Missing std modules in briefing: **${missing.length}**`,
    "",
    "## Recommended issues (mock)",
    "1. `[explorer-finding]` std module gap with PH id",
  ].join("\n");
}

function buildIssuePlannerMockBody(briefing: Record<string, unknown> | null): string {
  const triage = briefing?.issue_feature_triage as Record<string, unknown> | undefined;
  return [
    "## Executive summary",
    "- Turned plan-needed issues into scoped implementation plans (mock).",
    triage ? "- Used `issue_feature_triage` from briefing." : "- _No triage payload._",
    "",
    "## Plans drafted (mock)",
    "1. Issue → plan doc outline with PH- id and acceptance tests",
  ].join("\n");
}

function buildOrgRepoOnboarderMockBody(briefing: Record<string, unknown> | null): string {
  const disc = briefing?.org_new_repos_discovery as Record<string, unknown> | undefined;
  const newRepos = (disc?.new_repos as string[]) ?? [];
  const stale = (disc?.stale_known_repos as string[]) ?? [];
  return [
    "## Executive summary",
    `- Org repo discovery: **${newRepos.length}** new, **${stale.length}** stale catalog entries.`,
    newRepos.length
      ? `- New: ${newRepos.slice(0, 6).join(", ")}${newRepos.length > 6 ? ", …" : ""}`
      : "- No new repos in briefing — mock pass only.",
    "",
    "## New repos (mock handoff plan)",
    ...newRepos.map((r) => `- **${r}** → ci_maintainer, agent_kit_maintainer, docs_maintainer`),
    "",
    "## Stale catalog (mock)",
    ...(stale.length ? stale.map((r) => `- ${r} — verify archived on GitHub`) : ["- _None._"]),
  ].join("\n");
}

function buildNumericsMockBody(agentId: string, briefing: Record<string, unknown> | null): string {
  const audit = briefing?.ecosystem_audit as Record<string, unknown> | undefined;
  return [
    "## Executive summary",
    `- **${agentId}** numerics / bench pass (mock).`,
    audit ? "- Benchmark signals loaded from `ecosystem_audit`." : "- _No ecosystem audit._",
    "",
    "## Findings (mock)",
    "- Compare tier-1 rows vs cpp reference",
    "- File issue if ratio > 1.2× policy",
  ].join("\n");
}

function buildUiUxTesterMockBody(agentId: string, briefing: Record<string, unknown> | null): string {
  const manifest = buildRemediationManifest(agentId as AgentId, briefing);
  const kind = agentId.includes("_ui_") ? "ui" : "ux";
  const auditKey = kind === "ui" ? "ui_audit" : "ux_audit";
  const audit = briefing?.[auditKey] as Record<string, unknown> | undefined;
  const failing = (audit?.summary as Record<string, number> | undefined)?.failing ?? manifest.issues.length;
  return [
    "## Executive summary",
    `- **${agentId}** ${kind.toUpperCase()} audit pass (mock).`,
    `- Failing targets in briefing: **${failing}**`,
    `- Remediation issues (mock): **${manifest.issues.length}**`,
    "",
    formatRemediationDeliverableSection(manifest),
    "",
    "## SOTA reference (mock)",
    kind === "ux" ? "- Ran 3+ web queries against ux-harness/sota/manifest.yaml (mock URLs logged)." : "- UI metrics from ui-audit.json artifacts.",
    "",
    "## Digest",
    `- benchmarks/docs/ecosystem/ux-digests/${new Date().toISOString().slice(0, 10)}-${agentId.split("_")[0]}-${kind}.md`,
  ].join("\n");
}

function buildGenericMockBody(
  definition: AgentDefinition,
  briefing: Record<string, unknown> | null,
  _userMessage: string,
): string {
  const recommended =
    (briefing?.recommended_agents as Array<{ agent: string; reason: string }>) ?? [];
  const lines = [
    "## Executive summary",
    `- Ran **${definition.name}** (\`${definition.id}\`) mock pass.`,
    `- Skills: ${definition.skills.join(", ") || "(none)"}`,
    "",
    "## Recommended agents (briefing)",
    ...recommended.map((r) => `- **${r.agent}**: ${r.reason}`),
    "",
    "## Mock actions",
    `1. Execute \`prompts/${definition.promptFile}\``,
    "2. Produce digest with issues/PRs and deferred items",
  ];
  return lines.join("\n");
}

function appendItemList(
  lines: string[],
  items: unknown,
  limit: number,
  label?: string,
): void {
  if (!Array.isArray(items) || !items.length) {
    lines.push(`- _No ${label ?? "items"}._`);
    return;
  }
  for (const row of items.slice(0, limit)) {
    if (typeof row === "string") lines.push(`- ${row}`);
    else if (row && typeof row === "object") {
      const o = row as Record<string, unknown>;
      const src = o.source ? `\`${o.source}\`: ` : "";
      lines.push(`- ${src}${o.item ?? JSON.stringify(o)}`);
    }
  }
  if (items.length > limit) lines.push(`- _…and ${items.length - limit} more_`);
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200);
}
