import { loadCachedBriefing } from "../briefing/load-cached-briefing.js";
import {
  IMPLEMENT_LANE_AGENTS,
  asyncWorkerAgentIds,
  researchLaneAgentIds,
} from "../lanes/lane-agent-ids.js";
import { loadLaneState, saveLaneState } from "../lanes/lane-state.js";
import {
  loadResearchGoals,
  pickNextGoalForAgent,
  resolveGoalAgent,
  type ResearchGoal,
} from "../research-goals/load-goals.js";
import type { AgentId } from "../types.js";

function extractRecommended(briefing: unknown): Array<{ agent: string; reason: string }> {
  if (!briefing || typeof briefing !== "object") return [];
  const rec = (briefing as Record<string, unknown>).recommended_agents;
  if (!Array.isArray(rec)) return [];
  return rec.filter(
    (r): r is { agent: string; reason: string } =>
      r && typeof r === "object" && typeof r.agent === "string" && typeof r.reason === "string",
  );
}

function goalEligible(
  goal: ResearchGoal,
  goalLastRunAt: Record<string, string>,
  now: number,
): boolean {
  const cadenceH = goal.cadence_hours ?? 24;
  const last = goalLastRunAt[goal.id];
  if (!last) return true;
  return now - new Date(last).getTime() >= cadenceH * 3_600_000;
}

/** Worker-pool agent is a handoff target for an eligible research goal. */
export function eligibleGoalHandoffForAgent(agentId: AgentId): ResearchGoal | null {
  const goals = loadResearchGoals();
  const lane = loadLaneState();
  const now = Date.now();
  const candidates = goals
    .filter(
      (g) =>
        g.enabled !== false &&
        g.handoff_to?.includes(agentId) &&
        goalEligible(g, lane.goal_last_run_at ?? {}, now),
    )
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return candidates[0] ?? null;
}

/** Priority of the best eligible goal tied to this agent (direct assignment or handoff). */
export function goalPriorityForAgent(agentId: AgentId): number {
  const lane = loadLaneState();
  const direct = pickNextGoalForAgent(agentId, loadResearchGoals(), lane.goal_last_run_at ?? {});
  if (direct) return direct.priority ?? 0;
  const handoff = eligibleGoalHandoffForAgent(agentId);
  return handoff?.priority ?? 0;
}

/** Sort worker-pool agents so those with eligible swarm goals run earlier (lower startup stagger). */
export function sortWorkerAgentsByEligibleGoals(agentIds: AgentId[]): AgentId[] {
  const briefing = loadCachedBriefing();
  const recAgents = new Set(extractRecommended(briefing).map((r) => r.agent));
  return [...agentIds].sort((a, b) => {
    const pa = goalPriorityForAgent(a);
    const pb = goalPriorityForAgent(b);
    if (pb !== pa) return pb - pa;
    const ra = recAgents.has(a) ? 1 : 0;
    const rb = recAgents.has(b) ? 1 : 0;
    if (rb !== ra) return rb - ra;
    return a.localeCompare(b);
  });
}

/** Worker-pool agents that should sweep briefing/ecosystem even with an empty queue. */
export function defaultProactiveAgentIds(): AgentId[] {
  const env = process.env.LI_PROACTIVE_AGENTS?.trim();
  if (env) {
    return env.split(",").map((s) => s.trim()).filter(Boolean) as AgentId[];
  }
  return [
    "orchestrator",
    "implementation_gaps",
    "swarm_observer",
    "workspace_sweeper",
    "agent_kit_maintainer",
  ];
}

export function proactiveAgentCadenceMs(): number {
  const n = Number(process.env.LI_PROACTIVE_AGENT_CADENCE_MS ?? 600_000);
  return Number.isFinite(n) && n >= 60_000 ? n : 600_000;
}

/** When true, every async worker-pool leaf agent may run periodic ecosystem sweeps (not only the default five). */
export function proactiveAllPoolWorkersEnabled(): boolean {
  const v = process.env.LI_PROACTIVE_ALL_POOL_WORKERS;
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function isProactiveEligibleAgent(agentId: AgentId): boolean {
  if (researchLaneAgentIds().has(agentId)) return false;
  if (IMPLEMENT_LANE_AGENTS.has(agentId)) return false;
  if (defaultProactiveAgentIds().includes(agentId)) return true;
  if (eligibleGoalHandoffForAgent(agentId)) return true;
  return proactiveAllPoolWorkersEnabled() && asyncWorkerAgentIds().includes(agentId);
}

export function pickProactiveWorkForAgent(agentId: AgentId): {
  reason: string;
  source: "recommended" | "proactive" | "research_goal";
} | null {
  if (researchLaneAgentIds().has(agentId)) return null;
  if (IMPLEMENT_LANE_AGENTS.has(agentId)) return null;
  if (agentId === "swarm_observer" && process.env.LI_PROACTIVE_SWARM_OBSERVER === "0") {
    return null;
  }

  const lane = loadLaneState();
  const last = lane.proactive_last_run_at?.[agentId];
  if (last && Date.now() - new Date(last).getTime() < proactiveAgentCadenceMs()) {
    return null;
  }

  const briefing = loadCachedBriefing();
  const rec = extractRecommended(briefing).find((r) => r.agent === agentId);
  const handoffGoal = eligibleGoalHandoffForAgent(agentId);
  const directGoal = pickNextGoalForAgent(
    agentId,
    loadResearchGoals(),
    lane.goal_last_run_at ?? {},
  );
  const goal = directGoal ?? handoffGoal;

  if (!rec && !goal && !isProactiveEligibleAgent(agentId)) return null;

  if (goal) {
    const owner = resolveGoalAgent(goal);
    return {
      reason:
        owner === agentId
          ? `Swarm research goal ${goal.id} eligible (priority ${goal.priority ?? 0}) — ${goal.title}.`
          : `Swarm research goal ${goal.id} eligible (priority ${goal.priority ?? 0}) — handoff support for ${owner}.`,
      source: "research_goal",
    };
  }

  return {
    reason:
      rec?.reason ??
      `Proactive ecosystem sweep — refresh briefing signals and file follow-ups for ${agentId}.`,
    source: rec ? "recommended" : "proactive",
  };
}

export function recordProactiveAgentRun(agentId: AgentId): void {
  const lane = loadLaneState();
  lane.proactive_last_run_at = {
    ...(lane.proactive_last_run_at ?? {}),
    [agentId]: new Date().toISOString(),
  };
  saveLaneState(lane);
}
