import type { AgentId } from "../types.js";

const RESEARCH_DELIVERABLE_AGENTS = new Set<AgentId>([
  "goal_researcher",
  "proof_gap_researcher",
  "stdlib_researcher",
]);

export function buildResearchDeliverableBlock(agentId: string): string {
  if (!RESEARCH_DELIVERABLE_AGENTS.has(agentId as AgentId)) return "";

  if (agentId === "stdlib_researcher") {
    return [
      "## Research deliverable",
      "",
      "Audit real sources (`lic/std/**`, `li-std-*`) with file:line evidence before claims.",
      "Markdown-only digests without reading targets do **not** complete a focus step.",
      "Hand off implementation — do not land product code unless the goal explicitly requires a minimal regression test.",
      "",
    ].join("\n");
  }

  return [
    "## Research deliverable",
    "",
    "Each focus step must **verify in-repo**, not markdown-only handoffs:",
    "- Read relevant `lic/`, `li-tests/`, and verification docs for the current focus target",
    "- When the hypothesis is falsifiable, add or extend tests under `li-tests/` (or package tests)",
    "- Run `lic check` or targeted tests when feasible; record command + outcome in session artifacts",
    "- Cite file:line evidence and repro steps in the digest",
    "",
  ].join("\n");
}
