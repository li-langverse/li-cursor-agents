import type { MergeQueuePlan, MergeQueueRow } from "../preflight/merge-queue.js";

export interface AutoMergeEvaluation {
  allowed: boolean;
  dryRunOnly: boolean;
  blockedReasons: string[];
}

const GOVERNANCE_REPOS = new Set(["roadmap"]);
const GOVERNANCE_TITLE_RE =
  /\b(governance|roadmap|agent-kit sync|release.?notes|docs\/ecosystem|language-evolution)\b/i;
const TRUSTED_LEAN_RE = /trusted\.lean/i;
const TRUSTED_BLOCKED_RE = /trusted/i;

export function isAutoMergeEnabled(): boolean {
  return process.env.LI_AUTO_MERGE === "1";
}

export function isTrustedMergeApproved(): boolean {
  return process.env.LI_TRUSTED_MERGE_APPROVED === "1";
}

export function isGovernanceMergeRow(row: MergeQueueRow): boolean {
  const repo = row.repo?.toLowerCase() ?? "";
  if (GOVERNANCE_REPOS.has(repo) || repo.includes("roadmap")) return true;
  if (GOVERNANCE_TITLE_RE.test(row.title ?? "")) return true;
  return false;
}

function prFilesFromBriefing(row: MergeQueueRow, briefing?: unknown): string[] {
  const direct = [...(row.files ?? []), ...(row.changed_files ?? [])];
  if (!briefing || typeof briefing !== "object") return direct;
  const b = briefing as Record<string, unknown>;
  const program = b.pr_program as Record<string, unknown> | undefined;
  const open = program?.all_open;
  if (!Array.isArray(open)) return direct;
  const match = open.find(
    (p) =>
      p &&
      typeof p === "object" &&
      String((p as Record<string, unknown>).repo) === row.repo &&
      Number((p as Record<string, unknown>).number) === row.number,
  ) as Record<string, unknown> | undefined;
  if (!match) return direct;
  const fromPr = [
    ...(Array.isArray(match.files) ? (match.files as string[]) : []),
    ...(Array.isArray(match.changed_files) ? (match.changed_files as string[]) : []),
  ];
  return [...direct, ...fromPr];
}

export function nextMergeTouchesTrustedLean(row: MergeQueueRow, briefing?: unknown): boolean {
  if (TRUSTED_BLOCKED_RE.test(row.blocked_reason ?? "")) return true;
  const files = prFilesFromBriefing(row, briefing);
  return files.some((f) => TRUSTED_LEAN_RE.test(f));
}

export function evaluateNextMerge(
  plan: MergeQueuePlan | undefined,
  briefing?: unknown,
): AutoMergeEvaluation {
  const blockedReasons: string[] = [];
  const next = plan?.next_merge ?? plan?.merge_first ?? null;

  if (!next) {
    blockedReasons.push("no next_merge or merge_first in merge_plan");
    return { allowed: false, dryRunOnly: true, blockedReasons };
  }

  if (next.blocked_reason?.trim()) {
    blockedReasons.push(next.blocked_reason.trim());
  }

  if (next.merge_approved !== undefined && !next.merge_approved) {
    blockedReasons.push("merge_approved is false");
  }
  if (next.gate_ready !== undefined && !next.gate_ready) {
    blockedReasons.push("gate_ready is false");
  }
  if (next.auto_merge_ok !== undefined && !next.auto_merge_ok) {
    blockedReasons.push("auto_merge_ok is false");
  }

  if (isGovernanceMergeRow(next)) {
    blockedReasons.push("governance/roadmap PR — human merge required");
  }

  if (nextMergeTouchesTrustedLean(next, briefing) && !isTrustedMergeApproved()) {
    blockedReasons.push(
      "trusted.lean in merge candidate — set LI_TRUSTED_MERGE_APPROVED=1 after human approval",
    );
  }

  const allowed = blockedReasons.length === 0;
  const dryRunOnly = !isAutoMergeEnabled() || !allowed;
  return { allowed, dryRunOnly, blockedReasons };
}

export function buildAutoMergeInstruction(
  plan: MergeQueuePlan | undefined,
  evaluation: AutoMergeEvaluation,
): string {
  const next = plan?.next_merge ?? plan?.merge_first;
  const lines = [
    "## Auto-merge gate (mandatory)",
    "",
    `LI_AUTO_MERGE=${isAutoMergeEnabled() ? "1" : "0 (dry-run only)"}`,
    `Evaluation: ${evaluation.allowed ? "allowed" : "blocked"} · dry_run_only=${evaluation.dryRunOnly}`,
    "",
    "1. **Always** run `pr-auto-merge.py --dry-run` for the candidate PR and include the report in your digest.",
  ];

  if (evaluation.blockedReasons.length) {
    lines.push("", "**Blocked reasons:**");
    for (const r of evaluation.blockedReasons) lines.push(`- ${r}`);
  }

  if (next) {
    lines.push("", `**Candidate:** ${next.repo}#${next.number} — ${next.url}`);
  }

  lines.push("");
  if (isAutoMergeEnabled() && evaluation.allowed) {
    lines.push(
      "2. After dry-run passes, you may run **real** `pr-auto-merge.py` (no `--dry-run`) for this PR only.",
      "3. Stop after one merge; re-plan before the next PR.",
    );
  } else {
    lines.push(
      "2. **Do not** run real merge — stop after dry-run report.",
      evaluation.allowed
        ? "   (Enable `LI_AUTO_MERGE=1` on the supervisor host for real merges.)"
        : "   Fix blockers or wait for human merge approval.",
    );
  }

  return lines.join("\n");
}
