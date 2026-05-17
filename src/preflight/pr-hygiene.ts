/** Instructions from pr-branch-hygiene.json + merge_plan for PR hygiene agents. */

export interface BranchNeedingPr {
  repo: string;
  branch: string;
  base?: string;
  ahead_by?: number;
  reason?: string;
  suggested_title?: string;
}

export interface PrCloseRecommendation {
  repo: string;
  number: number;
  url?: string;
  reason?: string;
  action?: string;
  safe_now?: boolean;
  source?: string;
  suggested_action?: string;
}

export interface PrBranchHygieneReport {
  generated_at?: string;
  summary?: {
    branches_needing_pr?: number;
    prs_recommended_close?: number;
    prs_safe_close_now?: number;
  };
  branches_needing_pr?: BranchNeedingPr[];
  prs_recommended_close?: PrCloseRecommendation[];
}

export function prHygieneFromBriefing(briefing: unknown): PrBranchHygieneReport | null {
  if (!briefing || typeof briefing !== "object") return null;
  const raw = (briefing as Record<string, unknown>).pr_branch_hygiene;
  if (!raw || typeof raw !== "object") return null;
  return raw as PrBranchHygieneReport;
}

export function buildPrBranchOpenerInstruction(hygiene: PrBranchHygieneReport | null): string {
  const branches = hygiene?.branches_needing_pr ?? [];
  if (branches.length === 0) {
    return [
      "## Branch hygiene",
      "",
      "No branches need a new PR (`pr-branch-hygiene.json` empty).",
      "Re-run `python3 scripts/pr-branch-hygiene.py` if you expect orphan branches.",
    ].join("\n");
  }
  const lines = [
    "## Branches without open PR",
    "",
    `Found **${branches.length}** branch(es). Open at most **6** PRs this run.`,
    "",
    "| Repo | Branch | Base | Ahead |",
    "|------|--------|------|------:|",
  ];
  for (const b of branches.slice(0, 12)) {
    lines.push(
      `| ${b.repo} | \`${b.branch}\` | ${b.base ?? "main"} | ${b.ahead_by ?? "?"} |`,
    );
  }
  if (branches.length > 12) lines.push(`| … | +${branches.length - 12} more | | |`);
  lines.push(
    "",
    "Use `gh pr create --repo li-langverse/<repo> --head <branch> --base <base>` after `gh pr view --head` confirms none exists.",
    "PR body must include `<!-- li-agent -->` and `## Agent deliverable` checklist.",
  );
  return lines.join("\n");
}

export function buildPrAlignmentCloseInstruction(
  hygiene: PrBranchHygieneReport | null,
  mergePlan: Record<string, unknown> | null,
): string {
  const closes = hygiene?.prs_recommended_close ?? [];
  const safe = closes.filter((c) => c.safe_now);
  const lines = [
    "## Outdated / superseded PRs (close hygiene)",
    "",
    "Close PRs that are **no longer needed** after alignment review (max **5** closes per run).",
    "",
  ];

  if (safe.length > 0) {
    lines.push("### Safe to close now (preflight)", "");
    for (const c of safe.slice(0, 8)) {
      lines.push(
        `- **${c.repo}#${c.number}** ${c.url ?? ""} — ${c.reason ?? c.source ?? "redundant"}`,
      );
    }
    lines.push(
      "",
      "```bash",
      '# Example (comment first unless merge_plan says immediate close)',
      "gh pr close <N> --repo li-langverse/<repo> --comment 'Superseded per merge queue / branch hygiene agent.'",
      "```",
      "",
    );
  }

  const deferred = closes.filter((c) => !c.safe_now);
  if (deferred.length > 0) {
    lines.push("### Close only after dependency merges", "");
    for (const c of deferred.slice(0, 6)) {
      lines.push(
        `- **${c.repo}#${c.number}** — ${c.suggested_action ?? c.reason ?? "see merge_plan"}`,
      );
    }
    lines.push("");
  }

  const redundant = (mergePlan?.redundant as Array<{ suggested_action?: string }> | undefined) ?? [];
  if (redundant.length > 0 && closes.length === 0) {
    lines.push("### merge_plan.redundant", "");
    for (const r of redundant.slice(0, 6)) {
      lines.push(`- ${r.suggested_action ?? JSON.stringify(r)}`);
    }
    lines.push("");
  }

  if (closes.length === 0 && redundant.length === 0) {
    lines.push("_No preflight close rows — still scan open PRs for duplicates, abandoned drafts, and superseded stacks._");
  }

  lines.push(
    "**Never close:** PR in `merge_sequence`, `merge-approved` without human request, or `roadmap` without explicit supersede.",
    "**Always:** `gh pr comment` with reason before `gh pr close` unless duplicate bot PR.",
  );
  return lines.join("\n");
}
