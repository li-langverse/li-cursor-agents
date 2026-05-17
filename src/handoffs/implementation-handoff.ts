/** Enqueue code_implementer handoffs when research goals allow implementation. */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff, listHandoffs } from "./handoff-store.js";
import { loadResearchGoals, northStarFitForGoal } from "../research-goals/load-goals.js";
import type { AgentHandoff } from "./types.js";

export function goalScaffoldPath(goalId: string): string {
  return join(agentsPackageRoot(), "config", "goal-scaffolds", `${goalId}.md`);
}

export function loadGoalScaffold(goalId: string): string | undefined {
  const path = goalScaffoldPath(goalId);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8").trim();
}

export function goalAllowsImplementation(goalId: string): boolean {
  const goal = loadResearchGoals().find((g) => g.id === goalId);
  return goal?.allow_implementation === true;
}

export async function enqueueImplementationHandoff(options: {
  goalId: string;
  sessionId: string;
  fromAgent: string;
  placementHandoff?: AgentHandoff;
  briefingHash?: string;
  sourceRunId?: string;
}): Promise<AgentHandoff | null> {
  if (!goalAllowsImplementation(options.goalId)) return null;
  if (!loadGoalScaffold(options.goalId)) return null;

  const existing = await listHandoffs({
    status: ["pending", "claimed", "pending_placement"],
    toAgent: "code_implementer",
    limit: 30,
  });
  if (
    existing.some(
      (h) =>
        h.research_goal_id === options.goalId &&
        h.research_session_id === options.sessionId &&
        h.work?.kind === "goal_implementation",
    )
  ) {
    return null;
  }

  const scaffold = loadGoalScaffold(options.goalId);
  const goal = loadResearchGoals().find((g) => g.id === options.goalId);
  const placement = options.placementHandoff?.package_placement;

  return createHandoff({
    from_agent: options.fromAgent,
    to_agents: ["code_implementer"],
    status: "pending",
    research_goal_id: options.goalId,
    research_session_id: options.sessionId,
    north_star_fit:
      options.placementHandoff?.north_star_fit ??
      (goal ? northStarFitForGoal(goal) : `Implement goal ${options.goalId}`),
    package_placement: placement ?? null,
    briefing_hash: options.briefingHash,
    source_run_id: options.sourceRunId,
    work: {
      kind: "goal_implementation",
      implementation_from_research: true,
      summary: `Implement v1 scaffold for goal ${options.goalId}`,
      goal_scaffold_path: `config/goal-scaffolds/${options.goalId}.md`,
      scaffold_path: goalScaffoldPath(options.goalId),
      scaffold_excerpt: scaffold?.slice(0, 2000),
      proof_first: true,
    },
  });
}
