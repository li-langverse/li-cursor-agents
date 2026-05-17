import { listHandoffs } from "../handoffs/handoff-store.js";
import { loadResearchGoals } from "../research-goals/load-goals.js";
import { loadLaneState } from "../lanes/lane-state.js";
import { findAnyInProgressSession } from "../research-sessions/session-lifecycle.js";
import { buildImplementationQueue } from "../preflight/implementation-queue.js";

export interface SwarmScorecard {
  pending_handoffs: number;
  pending_placement: number;
  ready_to_implement: number;
  by_domain: Record<string, number>;
  active_research_session: string | null;
  research_lane_enabled: boolean;
  implement_lane_enabled: boolean;
  last_research_tick_at?: string;
  last_implement_tick_at?: string;
}

export interface ResearchGoalStatusRow {
  goal_id: string;
  title: string;
  agent: string;
  priority: number;
  last_run_at?: string;
  eligible: boolean;
}

export async function buildSwarmScorecard(): Promise<SwarmScorecard> {
  const lane = loadLaneState();
  const handoffs = await listHandoffs({ limit: 200 });
  const by_domain: Record<string, number> = {};
  let pending_placement = 0;
  let ready_to_implement = 0;

  for (const h of handoffs) {
    if (h.status === "pending_placement") pending_placement += 1;
    if (h.status === "pending" || h.status === "claimed") ready_to_implement += 1;
    for (const d of h.domains ?? []) {
      by_domain[d] = (by_domain[d] ?? 0) + 1;
    }
  }

  const session = await findAnyInProgressSession();

  return {
    pending_handoffs: handoffs.filter((h) => h.status !== "done" && h.status !== "failed").length,
    pending_placement,
    ready_to_implement,
    by_domain,
    active_research_session: session
      ? `${session.agent_id}:${session.goal_id ?? "—"} (cycle ${session.cycle})`
      : null,
    research_lane_enabled: lane.research_lane_enabled,
    implement_lane_enabled: lane.implement_lane_enabled,
    last_research_tick_at: lane.last_research_tick_at,
    last_implement_tick_at: lane.last_implement_tick_at,
  };
}

export function buildResearchGoalsStatus(): ResearchGoalStatusRow[] {
  const goals = loadResearchGoals();
  const lane = loadLaneState();
  const now = Date.now();
  return goals.map((g) => {
    const last = lane.goal_last_run_at[g.id];
    const cadenceH = g.cadence_hours ?? 24;
    const eligible =
      !last || now - new Date(last).getTime() >= cadenceH * 3_600_000;
    return {
      goal_id: g.id,
      title: g.title,
      agent: g.agent ?? "goal_researcher",
      priority: g.priority ?? 0,
      last_run_at: last,
      eligible,
    };
  });
}

export function buildProvabilityScorecard(briefing: unknown): Record<string, unknown> {
  const b = briefing && typeof briefing === "object" ? (briefing as Record<string, unknown>) : {};
  const plan = b.plan_completion_audit as Record<string, unknown> | undefined;
  const findings = Array.isArray(plan?.findings) ? plan!.findings.length : 0;
  return {
    open_plan_findings: findings,
    last_digest_hint: "lic/docs/verification/research-digests/",
    provability_goal_priority: 9,
    trigger_goal_id: "provability_holes",
  };
}

/** Merge scorecards into briefing object (mutates copy). */
export async function enrichBriefingWithScorecards(
  briefing: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const base = briefing ? { ...briefing } : {};
  if (!base.implementation_queue) {
    base.implementation_queue = buildImplementationQueue(base);
  }
  base.swarm_scorecard = await buildSwarmScorecard();
  base.research_goals_status = buildResearchGoalsStatus();
  if (!base.provability_scorecard) {
    base.provability_scorecard = buildProvabilityScorecard(base);
  }
  return base;
}
