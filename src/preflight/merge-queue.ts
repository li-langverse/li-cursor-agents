/** Extract merge-queue plan from agent-briefing JSON for pr_merger. */

export interface MergeQueueRow {
  rank: number;
  repo: string;
  number: number;
  url: string;
  title: string;
  merge_approved?: boolean;
  gate_ready?: boolean;
  auto_merge_ok?: boolean;
  blocked_reason?: string;
  order_reason?: string;
}

export interface RepoMergePlan {
  repo: string;
  base: string;
  open_prs: number;
  local_merge_order: string[];
  safe_merge_order: string[];
  safe_next?: string | null;
  conflicting_with_main?: Array<{
    number: number;
    url: string;
    title: string;
    action: string;
  }>;
  pair_risks?: Array<{
    merge_first: string;
    then_rebase_and_merge: string;
    file_overlap: number;
    reason: string;
  }>;
  progress_rule?: string;
}

export interface MergeQueuePlan {
  generated_at?: string;
  vision_order?: string;
  ordering_rules?: string[];
  next_merge?: MergeQueueRow | null;
  merge_first?: MergeQueueRow | null;
  merge_sequence?: MergeQueueRow[];
  merge_order?: MergeQueueRow[];
  stacks?: Array<{ merge_first: string; then: string; reason: string }>;
  redundant?: Array<{ pr_a: string; pr_b: string; suggested_action: string }>;
  pair_risks?: Array<{
    merge_first: string;
    then_rebase_and_merge: string;
    file_overlap: number;
    reason: string;
    resolution?: string;
  }>;
  repo_merge_plans?: RepoMergePlan[];
  warnings?: string[];
}

export function mergePlanFromBriefing(briefing: unknown): MergeQueuePlan | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const plan = (briefing as Record<string, unknown>).merge_plan;
  if (!plan || typeof plan !== "object") return undefined;
  return plan as MergeQueuePlan;
}

export function buildPrMergerInstruction(plan: MergeQueuePlan | undefined): string {
  if (!plan) {
    return [
      "No `merge_plan` in briefing — run first:",
      "```bash",
      "cd benchmarks && python3 scripts/pr-merge-queue-plan.py",
      "```",
      "Then merge **only** `next_merge` if gate-ready and merge-approved.",
    ].join("\n");
  }

  const lines = [
    "## Merge queue (derived order — mandatory)",
    "",
    `Vision: ${plan.vision_order ?? "see merge_plan"}`,
    "",
  ];

  if (plan.ordering_rules?.length) {
    lines.push("**Ordering rules:**");
    for (const r of plan.ordering_rules) lines.push(`- ${r}`);
    lines.push("");
  }

  const next = plan.next_merge ?? plan.merge_first;
  if (next) {
    lines.push(
      `**Merge this PR only (rank ${next.rank}):** ${next.repo}#${next.number} — ${next.url}`,
    );
    if (next.order_reason) lines.push(`- Reason: ${next.order_reason}`);
    lines.push("");
  } else {
    lines.push("**No PR is ready to merge** (`merge_sequence` empty). Do not merge anything this run.");
    lines.push("");
  }

  const seq = plan.merge_sequence ?? [];
  if (seq.length > 1) {
    lines.push("**Full merge_sequence (after current merge, re-plan before next):**");
    for (const row of seq.slice(0, 8)) {
      lines.push(`- ${row.rank}. ${row.repo}#${row.number} — ${row.order_reason ?? row.title}`);
    }
    lines.push("");
  }

  if (plan.stacks?.length) {
    lines.push("**Stacks (parent before child):**");
    for (const s of plan.stacks.slice(0, 6)) {
      lines.push(`- ${s.merge_first} → ${s.then}: ${s.reason}`);
    }
    lines.push("");
  }

  if (plan.redundant?.length) {
    lines.push("**Redundant / superseding PRs (do not merge both):**");
    for (const r of plan.redundant.slice(0, 5)) {
      lines.push(`- ${r.pr_a} vs ${r.pr_b}: ${r.suggested_action}`);
    }
    lines.push("");
  }

  if (plan.repo_merge_plans?.length) {
    lines.push("## Per-repo merge plans (conflicts + order)");
    for (const rp of plan.repo_merge_plans.slice(0, 6)) {
      lines.push(`### ${rp.repo} (base \`${rp.base}\`)`);
      if (rp.progress_rule) lines.push(`- ${rp.progress_rule}`);
      if (rp.safe_merge_order?.length) {
        lines.push(`- Safe order: ${rp.safe_merge_order.join(" → ")}`);
      }
      for (const c of rp.conflicting_with_main ?? []) {
        lines.push(`- **CONFLICTING** #${c.number}: ${c.action}`);
      }
      for (const risk of rp.pair_risks ?? []) {
        lines.push(
          `- Overlap ${(risk.file_overlap * 100).toFixed(0)}%: merge **${risk.merge_first}** first, then rebase **${risk.then_rebase_and_merge}**`,
        );
      }
      lines.push("");
    }
  }

  if (plan.pair_risks?.length && !plan.repo_merge_plans?.length) {
    lines.push("**Cross-PR overlap (same repo — preserve both sides):**");
    for (const r of plan.pair_risks.slice(0, 6)) {
      lines.push(`- ${r.reason}`);
    }
    lines.push("");
  }

  lines.push(
    "## Conflict / progress rules (mandatory)",
    "- **Never** merge a PR with `mergeable: CONFLICTING` — integrate `origin/main` first.",
    "- **Never** drop commits from main or from an open PR when resolving conflicts.",
    "- After merging one PR in a repo, **re-plan**; other PRs must absorb updated main before merge.",
    "- Stacked PRs: parent merges first; child rebases if main moved.",
    "- Skill: `resolve-merge-conflicts` · doc: `benchmarks/docs/ecosystem/merge-conflict-resolution.md`",
    "",
  );

  if (plan.warnings?.length) {
    lines.push("**Warnings:**");
    for (const w of plan.warnings.slice(0, 10)) lines.push(`- ${w}`);
  }

  return lines.join("\n");
}
