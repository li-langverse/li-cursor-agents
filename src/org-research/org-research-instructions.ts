import type { ResearchGoal } from "../research-goals/load-goals.js";

export const ORG_NOVEL_RESEARCH_GOAL_ID = "org_novel_research";

export const NOVEL_RESEARCH_DIMENSIONS = [
  "sota-papers",
  "competitor-gaps",
  "org-packages",
] as const;

const DIMENSION_FOCUS: Record<string, string> = {
  "sota-papers": [
    "Scan **recent research** (papers, preprints, benchmarks, OSS releases from the last 12–18 months).",
    "For each finding: what could improve Li numerics, sim, ML, or tooling?",
    "Ask: can we **reproduce**, **beat**, or **integrate** the method? Cite URLs/DOIs.",
  ].join("\n"),
  "competitor-gaps": [
    "Scan **competitor and product gaps** across HPC, simulation, AI tooling, and dev platforms.",
    "Map gaps to li-langverse repos — missing features, partial verticals, plan debt.",
    "Prefer evidence from competitive verticals, Reddit/HN, release notes, and org issue search.",
  ].join("\n"),
  "org-packages": [
    "Audit **whole org**: all li-langverse packages/repos for missing modules, weak APIs, and cross-repo holes.",
    "Propose new packages or monorepo splits when a gap is structural.",
    "Cross-check swarm-gap-registry and open issues before duplicating work.",
  ].join("\n"),
};

export function isOrgNovelResearchGoal(goal: ResearchGoal): boolean {
  return goal.id === ORG_NOVEL_RESEARCH_GOAL_ID;
}

export function buildNovelResearchDimensionBlock(dimension: string, workerId: string): string {
  const focus =
    DIMENSION_FOCUS[dimension] ??
    `Focus on dimension \`${dimension}\`: org-wide gap discovery with evidence.`;
  return [
    "## Novel org research dimension",
    "",
    `- **Dimension:** \`${dimension}\``,
    `- **Worker:** \`${workerId}\``,
    "",
    focus,
    "",
    "### Required outputs",
    "",
    "1. Whitepaper section under this goal's publish path (findings + citations).",
    "2. Swarm-gap-registry rows for durable gaps (`lic/data/swarm-gap-registry/registry.yaml`).",
    "3. **GitHub issues** via MCP `create_github_issue` (labels: `plan-needed`, `novel-research`, `ecosystem-gap`) — up to **5** per run when actionable.",
    "4. **New repos** only via MCP `create_github_repo` when a gap needs an isolated package (li-langverse org, private default).",
    "5. End with planner handoff note: issues route to **issue_planner** via `plan-needed`; research handoff fires when scaffold is missing.",
    "",
    "Use MCP server `li-org-github` — do not rely on shell `gh` alone.",
  ].join("\n");
}

export function buildResearchDimensionTail(
  goal: ResearchGoal,
  dimension: string,
  workerId: string,
): string {
  if (isOrgNovelResearchGoal(goal)) {
    return buildNovelResearchDimensionBlock(dimension, workerId);
  }
  return [
    "## Org research supervisor dimension",
    "",
    `- **Dimension:** \`${dimension}\``,
    `- **Worker:** \`${workerId}\``,
    "",
    `Focus this research run on the **${dimension}** dimension: audit, benchmark, or document findings`,
    "relevant to that lens for the goal above. Publish under the goal's whitepaper path when done.",
    "",
    "Read `docs/ecosystem/research-verticals.md` for vertical context.",
  ].join("\n");
}
