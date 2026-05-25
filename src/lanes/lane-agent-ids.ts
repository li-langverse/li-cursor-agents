import { AGENT_REGISTRY } from "../agents/registry.js";
import { loadResearchGoals, resolveGoalAgent } from "../research-goals/load-goals.js";
import type { AgentId } from "../types.js";

export const IMPLEMENT_LANE_AGENTS = new Set<AgentId>(["code_implementer", "package_architect"]);

export function researchLaneAgentIds(): Set<AgentId> {
  const ids = new Set<AgentId>();
  for (const g of loadResearchGoals()) {
    if (g.enabled === false) continue;
    ids.add(resolveGoalAgent(g));
  }
  return ids;
}

/** Leaf agents run by the async worker pool (lanes own research + implement). */
export function asyncWorkerAgentIds(): AgentId[] {
  const research = researchLaneAgentIds();
  const includeOrchestrator =
    process.env.LI_ASYNC_WORKER_ORCHESTRATOR === "1" ||
    process.env.LI_ASYNC_WORKER_ORCHESTRATOR === "true";
  return AGENT_REGISTRY.map((a) => a.id).filter(
    (id) =>
      (includeOrchestrator || id !== "orchestrator") &&
      !IMPLEMENT_LANE_AGENTS.has(id) &&
      !research.has(id),
  );
}
