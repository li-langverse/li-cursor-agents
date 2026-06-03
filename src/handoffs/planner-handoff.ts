/** Enqueue issue_planner handoffs when research completes without an implementation scaffold. */

import { createHandoff, listHandoffs } from "./handoff-store.js";
import { loadResearchGoals, northStarFitForGoal } from "../research-goals/load-goals.js";
import { goalAllowsImplementation, loadGoalScaffold } from "./implementation-handoff.js";
import type { AgentHandoff } from "./types.js";

export async function enqueueResearchPlanningHandoff(options: {
  goalId: string;
  sessionId: string;
  fromAgent: string;
  briefingHash?: string;
  sourceRunId?: string;
}): Promise<AgentHandoff | null> {
  const goal = loadResearchGoals().find((g) => g.id === options.goalId);
  if (!goal?.enabled) return null;

  const wantsPlanner =
    goalAllowsImplementation(options.goalId) ||
    (goal.handoff_to ?? []).includes("issue_planner");
  if (!wantsPlanner) return null;
  if (loadGoalScaffold(options.goalId)) return null;

  const existing = await listHandoffs({
    status: ["pending", "claimed", "pending_placement"],
    toAgent: "issue_planner",
    limit: 30,
  });
  if (
    existing.some(
      (h) =>
        h.research_goal_id === options.goalId &&
        h.research_session_id === options.sessionId &&
        h.work?.kind === "research_implementation_plan",
    )
  ) {
    return null;
  }

  return createHandoff({
    from_agent: options.fromAgent,
    to_agents: ["issue_planner"],
    status: "pending",
    research_goal_id: options.goalId,
    research_session_id: options.sessionId,
    north_star_fit: northStarFitForGoal(goal),
    domains: goal.domains,
    briefing_hash: options.briefingHash,
    source_run_id: options.sourceRunId,
    work: {
      kind: "research_implementation_plan",
      summary: `Draft implementation plan + scaffold for research goal ${options.goalId}`,
      goal_scaffold_path: `config/goal-scaffolds/${options.goalId}.md`,
    },
  });
}
