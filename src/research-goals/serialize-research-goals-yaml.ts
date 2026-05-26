import type { ResearchGoal } from "./load-goals.js";
import {
  DEFAULT_PUBLISH_REPO,
  DEFAULT_WHITEPAPER_ROOT,
} from "./researcher-factory.js";

function yamlList(items: string[]): string {
  return `[${items.join(", ")}]`;
}

function serializeGoal(goal: ResearchGoal, indent = "  "): string[] {
  const lines: string[] = [`${indent}- id: ${goal.id}`, `${indent}  title: ${goal.title}`];
  if (goal.vertical) lines.push(`${indent}  vertical: ${goal.vertical}`);
  lines.push(`${indent}  domains: ${yamlList(goal.domains)}`);
  if (goal.agent) lines.push(`${indent}  agent: ${goal.agent}`);
  if (goal.priority != null) lines.push(`${indent}  priority: ${goal.priority}`);
  if (goal.cadence_hours != null) lines.push(`${indent}  cadence_hours: ${goal.cadence_hours}`);
  lines.push(`${indent}  enabled: ${goal.enabled !== false}`);
  if (goal.uses_research_session != null)
    lines.push(`${indent}  uses_research_session: ${goal.uses_research_session}`);
  if (goal.allow_implementation != null)
    lines.push(`${indent}  allow_implementation: ${goal.allow_implementation}`);
  if (goal.publish_repo) lines.push(`${indent}  publish_repo: ${goal.publish_repo}`);
  if (goal.whitepaper_root) lines.push(`${indent}  whitepaper_root: ${goal.whitepaper_root}`);
  if (goal.handoff_to?.length) lines.push(`${indent}  handoff_to: ${yamlList(goal.handoff_to)}`);
  if (goal.ph_ids?.length) lines.push(`${indent}  ph_ids: ${yamlList(goal.ph_ids)}`);
  return lines;
}

export function serializeResearchGoalsYaml(goals: ResearchGoal[]): string {
  const header = [
    "# Goal-directed research missions — generated from researcher-factory.ts",
    "# Regenerate: npm run research-goals:sync",
    "# Whitepapers: publish_repo + whitepaper_root (defaults below) → ../research-findings",
    "defaults:",
    `  publish_repo: ${DEFAULT_PUBLISH_REPO}`,
    `  whitepaper_root: ${DEFAULT_WHITEPAPER_ROOT}`,
    "",
    "goals:",
  ];
  const body = goals.flatMap((g) => serializeGoal(g));
  return `${header.join("\n")}\n${body.join("\n")}\n`;
}
