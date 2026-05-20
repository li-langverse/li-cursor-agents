import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentDefinition } from "../types.js";
import type { CompletionMode } from "../types.js";
import type { RunAuditContext } from "./run-audit-context.js";
import { resolveRunAuditContext } from "./run-audit-context.js";

export interface AgentRunCompletion {
  complete: boolean;
  premature: boolean;
  pr_urls: string[];
  deliverable_checked: boolean;
  skip_reason?: string;
  completion_mode?: CompletionMode;
  notes?: string[];
  gaps: string[];
  evidence: string[];
}

const PR_URL_RE = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/gi;
const SKIP_RE =
  /\b(no changes|nothing to (?:do|merge)|skipped|dry-run|mock_finished|all rollout|no drift|digest.only|verify run|read.only)\b/i;
const DELIVERABLE_SECTION_RE = /##\s*(?:Agent deliverable|Deliverable|Executive summary)/i;
const CHECKED_ITEM_RE = /-\s*\[x\]/gi;
const SUBSTANTIVE_MIN = 280;

/** Agents that must open a PR or document explicit skip when editing code (production). */
export const REPO_WORKFLOW_AGENT_IDS = new Set([
  "workspace_sweeper",
  "agent_kit_maintainer",
  "ci_maintainer",
  "docs_maintainer",
  "pr_branch_opener",
  "code_implementer",
  "bug_fixer",
  "security_auditor",
  "bench_improver",
  "autoresearch",
]);

export const NUMERICS_EVIDENCE_AGENT_IDS = new Set(["numerics_researcher", "autoresearch", "bench_improver"]);

const BENCH_EVIDENCE_RE =
  /(?:li-tests\/|benchmarks\/|docs\/numerics\/|bench(?:mark)?[_\s-]?(?:id|row)|manifest\.toml|threshold_ratio|pure_li|horner_|tier[- ]?\d)/i;
const DASHBOARD_BENCH_RE = /li-langverse\.github\.io\/benchmarks/i;

export function extractPrUrls(text: string): string[] {
  const found = text.match(PR_URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).,]+$/, "")))];
}

export function hasDeliverableSection(text: string): boolean {
  return DELIVERABLE_SECTION_RE.test(text);
}

export function hasCheckedDeliverableItems(text: string): boolean {
  if (!hasDeliverableSection(text)) return false;
  const section = text.split(/##\s*Agent deliverable/i)[1] ?? "";
  return (section.match(CHECKED_ITEM_RE) ?? []).length >= 1;
}

export function hasNumericsTestEvidence(text: string): boolean {
  return BENCH_EVIDENCE_RE.test(text) || DASHBOARD_BENCH_RE.test(text);
}

function isSubstantiveDigest(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length >= SUBSTANTIVE_MIN && hasDeliverableSection(text);
}

export interface AuditRunCompletionInput {
  agentId: string;
  definition?: AgentDefinition | null;
  outputText: string;
  backend: string;
  mock?: boolean;
  rolloutPrUrls?: string[];
  auditContext?: RunAuditContext;
}

export function auditRunCompletion(input: AuditRunCompletionInput): AgentRunCompletion {
  const ctx = input.auditContext ?? resolveRunAuditContext();
  const { agentId, definition, outputText, backend, mock, rolloutPrUrls } = input;
  const hardGaps: string[] = [];
  const notes: string[] = [];
  const evidence: string[] = [];
  const pr_urls = [...new Set([...extractPrUrls(outputText), ...(rolloutPrUrls ?? [])])];

  evidence.push(`completion_mode:${ctx.mode}`);

  if (mock || backend === "mock") {
    if (REPO_WORKFLOW_AGENT_IDS.has(agentId) && pr_urls.length === 0 && !SKIP_RE.test(outputText)) {
      notes.push("mock: no PR URL (expected in production)");
    }
    if (NUMERICS_EVIDENCE_AGENT_IDS.has(agentId) && !hasNumericsTestEvidence(outputText)) {
      notes.push("mock: no numerics bench evidence (expected in production)");
    }
    return {
      complete: true,
      premature: false,
      pr_urls,
      deliverable_checked: hasDeliverableSection(outputText),
      completion_mode: ctx.mode,
      notes,
      gaps: [],
      evidence: [...evidence, "mock_backend"],
    };
  }

  if (ctx.postHookPushFailed) {
    hardGaps.push(
      `post-hook push failed: ${ctx.postHookError ?? "see Repo workflow push section"}`,
    );
    evidence.push("post_hook_push_failed");
  }

  const needsRepoWorkflow = definition?.repoWorkflow || REPO_WORKFLOW_AGENT_IDS.has(agentId);
  const needsNumericsEvidence = NUMERICS_EVIDENCE_AGENT_IDS.has(agentId);
  const digestOk = ctx.mode === "verify" || ctx.mode === "digest_only";
  const waivePrRequirement = digestOk || ctx.skipPush;

  if (outputText.length < 120 && !pr_urls.length) {
    hardGaps.push("output too short — SDK may have ended before producing a digest");
  }

  if (needsRepoWorkflow) {
    if (pr_urls.length > 0) {
      evidence.push(`pr_urls:${pr_urls.length}`);
    } else if (SKIP_RE.test(outputText)) {
      evidence.push("explicit_skip_in_output");
    } else if (waivePrRequirement && isSubstantiveDigest(outputText)) {
      evidence.push("digest_only_no_pr_expected");
      notes.push(
        digestOk
          ? "verify/digest mode: substantive digest without PR is expected"
          : "skip-push: committed locally or read-only verify; PR not required",
      );
    } else if (waivePrRequirement) {
      notes.push("digest-only run: PR waived but output may lack deliverable structure");
    } else {
      hardGaps.push("repo-workflow agent finished without PR URL or documented skip reason");
    }
  }

  if (needsNumericsEvidence) {
    if (hasNumericsTestEvidence(outputText)) {
      evidence.push("numerics_bench_or_test_evidence_in_output");
    } else if (digestOk && isSubstantiveDigest(outputText)) {
      notes.push("verify mode: numerics digest without bench paths (follow-up in production)");
      evidence.push("verify_numerics_digest");
    } else if (pr_urls.length === 0) {
      hardGaps.push(
        "numerics/autoresearch run lacks bench/test evidence (need li-tests/, benchmarks/, docs/numerics/, or dashboard link)",
      );
    } else {
      notes.push("numerics PR claimed — verify bench evidence in PR during human review");
    }
  }

  if (hasDeliverableSection(outputText)) {
    evidence.push("deliverable_section_present");
    if (!hasCheckedDeliverableItems(outputText) && !digestOk) {
      notes.push("Agent deliverable section has no checked [x] items (informational)");
    }
  } else if (
    needsRepoWorkflow &&
    pr_urls.length > 0 &&
    !hasDeliverableSection(outputText) &&
    !(rolloutPrUrls?.length)
  ) {
    notes.push("PR opened but output may lack ## Deliverable checklist (check PR body)");
  }

  const premature = hardGaps.length > 0;
  return {
    complete: !premature,
    premature,
    pr_urls,
    deliverable_checked: hasCheckedDeliverableItems(outputText),
    completion_mode: ctx.mode,
    notes: notes.length ? notes : undefined,
    gaps: hardGaps,
    evidence,
  };
}

export function readRunOutputText(mdPath: string): string {
  if (!existsSync(mdPath)) return "";
  try {
    return readFileSync(mdPath, "utf8");
  } catch {
    return "";
  }
}

export function scanIncompleteRunsFromDisk(
  runsDir: string,
  limit = 20,
): Array<{ agent_id: string; run_id: string; completion: AgentRunCompletion }> {
  if (!existsSync(runsDir)) return [];

  const jsonFiles = readdirSync(runsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, m: statSync(join(runsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, limit);

  const out: Array<{ agent_id: string; run_id: string; completion: AgentRunCompletion }> = [];
  for (const { f } of jsonFiles) {
    try {
      const raw = JSON.parse(readFileSync(join(runsDir, f), "utf8")) as Record<string, unknown>;
      const completion = raw.completion as AgentRunCompletion | undefined;
      if (!completion?.premature) continue;
      if (completion.completion_mode === "verify" || completion.completion_mode === "digest_only") {
        continue;
      }
      out.push({
        agent_id: String(raw.agentId ?? f.replace(/-\d+\.json$/, "")),
        run_id: f.replace(/\.json$/, ""),
        completion,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}
