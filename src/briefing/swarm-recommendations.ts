/** Merge lane/handoff signals into briefing.recommended_agents for supervisor + heap. */

export function isSwarmRecommendationsEnabled(): boolean {
  return process.env.LI_SWARM_MERGE_RECOMMENDATIONS !== "0";
}

export interface BriefingRecommendation {
  agent: string;
  reason: string;
  source?: string;
}

function existingAgents(rec: unknown): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(rec)) return set;
  for (const row of rec) {
    if (row && typeof row === "object" && typeof (row as Record<string, unknown>).agent === "string") {
      set.add(String((row as Record<string, unknown>).agent));
    }
  }
  return set;
}

export function swarmRecommendationsFromBriefing(
  briefing: Record<string, unknown>,
): BriefingRecommendation[] {
  const out: BriefingRecommendation[] = [];
  const score = briefing.swarm_scorecard as Record<string, unknown> | undefined;
  const audit = briefing.handoff_audit as Record<string, unknown> | undefined;

  const pendingPlacement = Number(score?.pending_placement ?? 0);
  const readyImplement = Number(score?.ready_to_implement ?? 0);
  const missingNorth = Array.isArray(audit?.missing_north_star_fit)
    ? audit!.missing_north_star_fit.length
    : 0;

  if (pendingPlacement > 0) {
    out.push({
      agent: "package_architect",
      reason: `swarm: ${pendingPlacement} handoff(s) pending_placement`,
      source: "swarm_scorecard",
    });
  }
  if (readyImplement > 0) {
    out.push({
      agent: "code_implementer",
      reason: `swarm: ${readyImplement} handoff(s) ready to implement`,
      source: "swarm_scorecard",
    });
  }
  if (missingNorth > 0) {
    out.push({
      agent: "package_architect",
      reason: `swarm: ${missingNorth} handoff(s) missing north_star_fit — fix or fail before implement`,
      source: "handoff_audit",
    });
  }

  const goals = briefing.research_goals_status;
  if (Array.isArray(goals)) {
    const eligible = goals.filter(
      (g) => g && typeof g === "object" && (g as Record<string, unknown>).eligible === true,
    );
    if (eligible.length > 0) {
      const top = eligible.sort(
        (a, b) =>
          Number((b as Record<string, unknown>).priority ?? 0) -
          Number((a as Record<string, unknown>).priority ?? 0),
      )[0] as Record<string, unknown>;
      const agent = String(top.agent ?? "goal_researcher");
      out.push({
        agent,
        reason: `swarm: research goal ${top.goal_id} eligible (priority ${top.priority})`,
        source: "research_goals_status",
      });
    }
  }

  return out;
}

/** Prepend swarm recommendations without duplicating agent ids. */
export function mergeSwarmRecommendations(
  briefing: Record<string, unknown>,
): Record<string, unknown> {
  if (!isSwarmRecommendationsEnabled()) return briefing;
  const merged = { ...briefing };
  const have = existingAgents(merged.recommended_agents);
  const swarm = swarmRecommendationsFromBriefing(merged).filter((r) => !have.has(r.agent));
  const prior = Array.isArray(merged.recommended_agents) ? [...merged.recommended_agents] : [];
  merged.recommended_agents = [...swarm, ...prior];
  merged.swarm_recommendations_merged_at = new Date().toISOString();
  return merged;
}
