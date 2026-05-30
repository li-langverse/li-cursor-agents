import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunTrace } from "../agent-run-trace.js";
import type { AgentDefinition } from "../types.js";

export interface AgentRunCompletion {
  complete: boolean;
  premature: boolean;
  pr_urls: string[];
  deliverable_checked: boolean;
  skip_reason?: string;
  gaps: string[];
  evidence: string[];
}

const PR_URL_RE = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/gi;
const SKIP_RE =
  /\b(no changes|nothing to (?:do|merge)|skipped|dry-run|mock_finished|all rollout|no drift)\b/i;
const DELIVERABLE_SECTION_RE = /##\s*(?:Agent deliverable|Deliverable|Executive summary)/i;
const CHECKED_ITEM_RE = /-\s*\[x\]/gi;

/** Agents that must open a PR or document explicit skip when editing code. */
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

/** Numerics agents must cite tests/bench evidence in output or PR body. */
export const NUMERICS_EVIDENCE_AGENT_IDS = new Set(["numerics_researcher", "autoresearch", "bench_improver"]);

/** Research-lane agents must cite north_star_fit when describing handoffs. */
export const RESEARCH_HANDOFF_AGENT_IDS = new Set([
  "goal_researcher",
  "proof_gap_researcher",
  "stdlib_researcher",
  "numerics_researcher",
  "gap_explorer",
]);

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

export interface AuditRunCompletionInput {
  agentId: string;
  definition?: AgentDefinition | null;
  outputText: string;
  backend: string;
  mock?: boolean;
  rolloutPrUrls?: string[];
  trace?: AgentRunTrace;
}

const TRUSTED_LEAN_RE = /trusted\.lean/i;
const TRUSTED_APPROVED_RE = /trusted-change-approved|trusted_change_approved/i;

function traceEditsTrustedLean(trace?: AgentRunTrace): boolean {
  for (const edit of trace?.file_edits ?? []) {
    if (!TRUSTED_LEAN_RE.test(edit.path)) continue;
    const wrote =
      edit.tool === "edit" ||
      edit.tool === "write" ||
      (edit.lines_added ?? 0) > 0 ||
      (edit.lines_removed ?? 0) > 0;
    if (wrote) return true;
  }
  return false;
}

/** True when the run claims or performs a trusted.lean change without approval metadata. */
export function outputTouchesTrustedLean(text: string, trace?: AgentRunTrace): boolean {
  if (traceEditsTrustedLean(trace)) return true;
  if (!TRUSTED_LEAN_RE.test(text)) return false;
  if (TRUSTED_APPROVED_RE.test(text)) return false;
  return /\b(edit|modify|change|patch|commit|update|wrote|fixed)\b.*trusted\.lean/i.test(text);
}

function isSdkMatrixSmoke(): boolean {
  return Boolean(process.env.LI_SDK_MATRIX_MODE?.trim());
}

function passesSdkMatrixSmokeAudit(outputText: string): { ok: boolean; gaps: string[] } {
  const gaps: string[] = [];
  if (!/^OK-/m.test(outputText)) {
    gaps.push("SDK matrix smoke: reply must include a line starting with OK-");
  }
  if (outputText.length < 120) {
    gaps.push("SDK matrix smoke: output too short");
  }
  const checked =
    hasCheckedDeliverableItems(outputText) ||
    /-\s*\[x\]\s*SDK matrix smoke completed/i.test(outputText);
  if (!checked) {
    gaps.push("SDK matrix smoke: need ## Agent deliverable with - [x] SDK matrix smoke completed");
  }
  return { ok: gaps.length === 0, gaps };
}


/** Agents whose run is complete only when goal-completion-gate.js passes (not heuristics). */
export const GOAL_LOOP_GATE_AGENT_IDS = new Set(["world_studio_builder"]);

export function auditRunCompletion(input: AuditRunCompletionInput): AgentRunCompletion {
  const { agentId, definition, outputText, backend, mock, rolloutPrUrls, trace } = input;
  const gaps: string[] = [];
  const evidence: string[] = [];
  const pr_urls = [...new Set([...extractPrUrls(outputText), ...(rolloutPrUrls ?? [])])];

  const gateOnly =
    process.env.LI_GOAL_LOOP_GATE_ONLY === "1" ||
    GOAL_LOOP_GATE_AGENT_IDS.has(agentId);
  if (gateOnly && !mock && backend !== "mock") {
    if (pr_urls.length > 0) evidence.push(`pr_urls:${pr_urls.length}`);
    return {
      complete: false,
      premature: false,
      pr_urls,
      deliverable_checked: hasCheckedDeliverableItems(outputText),
      gaps: [],
      evidence: ["goal_loop_completion_gate_authority", ...evidence],
    };
  }
  if (isSdkMatrixSmoke()) {
    const smoke = passesSdkMatrixSmokeAudit(outputText);
    if (smoke.ok) {
      evidence.push("sdk_matrix_smoke");
      if (NUMERICS_EVIDENCE_AGENT_IDS.has(agentId) && hasNumericsTestEvidence(outputText)) {
        evidence.push("numerics_bench_or_test_evidence_in_output");
      }
    }
    return {
      complete: smoke.ok,
      premature: !smoke.ok,
      pr_urls,
      deliverable_checked: hasCheckedDeliverableItems(outputText),
      gaps: smoke.gaps,
      evidence,
    };
  }

  if (mock || backend === "mock") {
    if (REPO_WORKFLOW_AGENT_IDS.has(agentId) && pr_urls.length === 0 && !SKIP_RE.test(outputText)) {
      gaps.push("mock: no PR URL (expected in production)");
    }
    if (NUMERICS_EVIDENCE_AGENT_IDS.has(agentId) && !hasNumericsTestEvidence(outputText)) {
      gaps.push("mock: no numerics bench evidence (expected in production)");
    }
    return {
      complete: true,
      premature: false,
      pr_urls,
      deliverable_checked: hasDeliverableSection(outputText),
      gaps,
      evidence: ["mock_backend"],
    };
  }

  const needsRepoWorkflow = definition?.repoWorkflow || REPO_WORKFLOW_AGENT_IDS.has(agentId);
  const needsNumericsEvidence = NUMERICS_EVIDENCE_AGENT_IDS.has(agentId);

  if (outputText.length < 120 && !pr_urls.length) {
    gaps.push("output too short — SDK may have ended prematurely");
  }

  if (needsRepoWorkflow) {
    if (pr_urls.length > 0) {
      evidence.push(`pr_urls:${pr_urls.length}`);
    } else if (SKIP_RE.test(outputText)) {
      evidence.push("explicit_skip_in_output");
    } else {
      gaps.push("repo-workflow agent finished without PR URL or skip reason");
    }
  }

  if (needsNumericsEvidence) {
    if (hasNumericsTestEvidence(outputText)) {
      evidence.push("numerics_bench_or_test_evidence_in_output");
    } else if (pr_urls.length === 0) {
      gaps.push(
        "numerics/autoresearch run lacks bench/test evidence (need li-tests/, benchmarks/, docs/numerics/, or dashboard link)",
      );
    } else {
      gaps.push("numerics PR claimed but no test/bench evidence in agent output — verify PR files in review");
    }
  }

  if (
    (agentId === "code_implementer" || agentId === "package_architect") &&
    outputTouchesTrustedLean(outputText, trace) &&
    !TRUSTED_APPROVED_RE.test(outputText)
  ) {
    gaps.push("trusted.lean touched without trusted-change-approved in deliverable");
  }

  if (
    RESEARCH_HANDOFF_AGENT_IDS.has(agentId) &&
    /\bhandoff\b/i.test(outputText) &&
    !/north_star_fit/i.test(outputText)
  ) {
    gaps.push("research output mentions handoff but omits north_star_fit (domain + PH/pillar)");
  }

  if (hasDeliverableSection(outputText)) {
    evidence.push("deliverable_section_present");
    if (!hasCheckedDeliverableItems(outputText)) {
      gaps.push("Agent deliverable section has no checked [x] items");
    }
  } else if (
    needsRepoWorkflow &&
    pr_urls.length > 0 &&
    !hasDeliverableSection(outputText) &&
    !(rolloutPrUrls?.length)
  ) {
    gaps.push("PR opened but PR body may lack ## Agent deliverable checklist");
  }

  const premature = gaps.length > 0;
  return {
    complete: !premature,
    premature,
    pr_urls,
    deliverable_checked: hasCheckedDeliverableItems(outputText),
    gaps,
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
      if (completion?.premature) {
        out.push({
          agent_id: String(raw.agentId ?? f.replace(/-\d+\.json$/, "")),
          run_id: f.replace(/\.json$/, ""),
          completion,
        });
      }
    } catch {
      /* skip */
    }
  }
  return out;
}
