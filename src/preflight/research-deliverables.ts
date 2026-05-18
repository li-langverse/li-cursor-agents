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
    "- State a **testable hypothesis** for the step; wrong ideas are expected — record **falsified** with evidence",
    "- When falsifiable, add or extend tests under `li-tests/` (or package tests); run `lic check` or targeted tests",
    "- Record outcomes as: `HYPOTHESIS: verified — …` or `HYPOTHESIS: falsified — … | evidence: file:line or test cmd`",
    "- You may **return to a falsified hypothesis** later if new code/tests change the picture (mark retest in session)",
    "- Cite file:line evidence and repro steps in the digest",
    "",
  ].join("\n");
}
