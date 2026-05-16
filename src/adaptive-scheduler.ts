import type { AgentId } from "./types.js";
import type { RunHistory, CycleRecord } from "./history.js";
import { getRecentCycles } from "./history.js";
import { AGENT_REGISTRY } from "./agents/registry.js";

export interface ScheduleDecision {
  agents: AgentId[];
  reasoning: string[];
}

interface AgentScore {
  id: AgentId;
  score: number;
  reason: string;
}

export function decideAgents(
  history: RunHistory,
  options: { maxAgents?: number; forceInclude?: AgentId[] } = {},
): ScheduleDecision {
  const maxAgents = options.maxAgents ?? 5;
  const reasoning: string[] = [];

  const recentCycles = getRecentCycles(history, 3);
  if (recentCycles.length === 0) {
    reasoning.push("No prior history — running default starter set");
    return {
      agents: ["orchestrator", "ecosystem_explorer", "pr_alignment", "plan_completion"],
      reasoning,
    };
  }

  const scores = scoreAgents(recentCycles, reasoning);

  if (options.forceInclude) {
    for (const id of options.forceInclude) {
      const existing = scores.find((s) => s.id === id);
      if (existing) {
        existing.score += 100;
        existing.reason += " (forced)";
      } else {
        scores.push({ id, score: 100, reason: "forced include" });
      }
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const selected = scores.slice(0, maxAgents).map((s) => s.id);

  if (!selected.includes("orchestrator")) {
    selected.unshift("orchestrator");
    if (selected.length > maxAgents) selected.pop();
    reasoning.push("Always include orchestrator as coordination agent");
  }

  reasoning.push(
    `Selected ${selected.length} agents: ${selected.join(", ")} (from scores: ${scores.slice(0, maxAgents).map((s) => `${s.id}=${s.score}`).join(", ")})`,
  );

  return { agents: selected, reasoning };
}

function scoreAgents(recentCycles: CycleRecord[], reasoning: string[]): AgentScore[] {
  const allAgentIds = AGENT_REGISTRY.map((a) => a.id);
  const scores: AgentScore[] = [];

  for (const agentId of allAgentIds) {
    let score = 50;
    let reason = "base";

    const recentRuns = recentCycles
      .flatMap((c) => c.results)
      .filter((r) => r.agentId === agentId);

    if (recentRuns.length === 0) {
      score += 30;
      reason = "not run recently (+30)";
    } else {
      const lastRun = recentRuns[recentRuns.length - 1];

      if (lastRun.status === "error") {
        score += 35;
        reason = "last run errored — retry (+35)";
      } else if (lastRun.status === "finished") {
        const findings = lastRun.findings ?? [];
        if (findings.length > 3) {
          score += 25;
          reason = `productive last run (${findings.length} findings, +25)`;
        } else {
          score -= 10;
          reason = `few findings last run (${findings.length}, -10)`;
        }
      }

      const timeSinceLastRun = Date.now() - new Date(lastRun.timestamp).getTime();
      const hoursSince = timeSinceLastRun / (1000 * 60 * 60);
      if (hoursSince > 48) {
        score += 15;
        reason += ` + stale (${Math.floor(hoursSince)}h, +15)`;
      }
    }

    const lastCycle = recentCycles[recentCycles.length - 1];
    if (lastCycle?.nextPriorities?.includes(agentId)) {
      score += 35;
      reason += " + recommended by last cycle (+35)";
    }

    scores.push({ id: agentId as AgentId, score, reason });
  }

  reasoning.push(
    `Scored ${scores.length} agents based on ${recentCycles.length} recent cycles`,
  );

  return scores;
}
