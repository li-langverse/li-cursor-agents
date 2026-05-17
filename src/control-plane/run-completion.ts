import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
  "agent_kit_maintainer",
  "ci_maintainer",
  "docs_maintainer",
  "bench_improver",
  "autoresearch",
  "implementation_gaps",
]);

/** Numerics agents must cite tests/bench evidence in output or PR body. */
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

export interface AuditRunCompletionInput {
  agentId: string;
  definition?: AgentDefinition | null;
  outputText: string;
  backend: string;
  mock?: boolean;
  rolloutPrUrls?: string[];
}

export function auditRunCompletion(input: AuditRunCompletionInput): AgentRunCompletion {
  const { agentId, definition, outputText, backend, mock, rolloutPrUrls } = input;
  const gaps: string[] = [];
  const evidence: string[] = [];
  const pr_urls = [...new Set([...extractPrUrls(outputText), ...(rolloutPrUrls ?? [])])];

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
