import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import type { AgentId } from "../types.js";

export interface ResearchGoal {
  id: string;
  title: string;
  /** User-facing vertical slug (numerics, physics, md, …). See docs/ecosystem/research-verticals.md */
  vertical?: string;
  domains: string[];
  agent?: AgentId;
  priority?: number;
  cadence_hours?: number;
  enabled?: boolean;
  uses_research_session?: boolean;
  allow_implementation?: boolean;
  handoff_to?: string[];
  ph_ids?: string[];
  needs_web?: boolean;
  /** GitHub repo name under li-langverse (e.g. research-findings). */
  publish_repo?: string;
  /** Repo-relative path to whitepapers root. */
  whitepaper_root?: string;
}

export interface ResearchGoalsFile {
  goals: ResearchGoal[];
}

export function loadResearchGoals(): ResearchGoal[] {
  const path =
    process.env.LI_RESEARCH_GOALS_PATH?.trim() ||
    join(agentsPackageRoot(), "config", "research-goals.yaml");
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const goals: ResearchGoal[] = [];
  let current: Partial<ResearchGoal> | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- id:")) {
      if (current?.id) goals.push(current as ResearchGoal);
      current = { id: trimmed.slice("- id:".length).trim(), domains: [], enabled: true };
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith("title:")) current.title = trimmed.slice(6).trim();
    else if (trimmed.startsWith("vertical:")) current.vertical = trimmed.slice(9).trim();
    else if (trimmed.startsWith("agent:")) current.agent = trimmed.slice(6).trim() as AgentId;
    else if (trimmed.startsWith("priority:")) current.priority = Number(trimmed.slice(9).trim());
    else if (trimmed.startsWith("cadence_hours:")) current.cadence_hours = Number(trimmed.slice(14).trim());
    else if (trimmed.startsWith("enabled:")) current.enabled = trimmed.includes("true");
    else if (trimmed.startsWith("uses_research_session:"))
      current.uses_research_session = trimmed.includes("true");
    else if (trimmed.startsWith("allow_implementation:"))
      current.allow_implementation = trimmed.includes("true");
    else if (trimmed.startsWith("domains:")) {
      const m = trimmed.match(/\[(.*)\]/);
      current.domains = m
        ? m[1]!.split(",").map((s) => s.trim().replace(/['"]/g, ""))
        : [];
    } else if (trimmed.startsWith("handoff_to:")) {
      const m = trimmed.match(/\[(.*)\]/);
      current.handoff_to = m
        ? m[1]!.split(",").map((s) => s.trim().replace(/['"]/g, ""))
        : [];
    } else if (trimmed.startsWith("ph_ids:")) {
      const m = trimmed.match(/\[(.*)\]/);
      current.ph_ids = m ? m[1]!.split(",").map((s) => s.trim().replace(/['"]/g, "")) : [];
    } else if (trimmed.startsWith("publish_repo:"))
      current.publish_repo = trimmed.slice(13).trim();
    else if (trimmed.startsWith("whitepaper_root:"))
      current.whitepaper_root = trimmed.slice(16).trim();
  }
  if (current?.id) goals.push(current as ResearchGoal);
  return goals.filter((g) => g.enabled !== false);
}

export function resolveGoalAgent(goal: ResearchGoal): AgentId {
  if (goal.agent) return goal.agent;
  return "goal_researcher";
}

function eligibleGoals(
  goals: ResearchGoal[],
  goalLastRunAt: Record<string, string>,
  now: number,
): ResearchGoal[] {
  return goals
    .filter((g) => {
      const cadenceH = g.cadence_hours ?? 24;
      const last = goalLastRunAt[g.id];
      if (!last) return true;
      return now - new Date(last).getTime() >= cadenceH * 3_600_000;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function pickNextGoal(
  goals: ResearchGoal[],
  goalLastRunAt: Record<string, string>,
  now = Date.now(),
): ResearchGoal | null {
  return eligibleGoals(goals, goalLastRunAt, now)[0] ?? null;
}

/** Next goal for a specific research agent (parallel workers — no global lane mutex). */
export function pickNextGoalForAgent(
  agentId: AgentId,
  goals: ResearchGoal[],
  goalLastRunAt: Record<string, string>,
  now = Date.now(),
): ResearchGoal | null {
  return (
    eligibleGoals(
      goals.filter((g) => resolveGoalAgent(g) === agentId),
      goalLastRunAt,
      now,
    )[0] ?? null
  );
}

export function northStarFitForGoal(goal: ResearchGoal): string {
  const domains = goal.domains.join(", ");
  const ph = goal.ph_ids?.length ? `; PH: ${goal.ph_ids.join(", ")}` : "";
  return `${goal.title} — domains: ${domains}${ph}`;
}
