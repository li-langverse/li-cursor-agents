import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { resolveBenchmarksRoot } from "../preflight.js";
export interface SwarmBriefingSnapshot {
  source: string;
  generated_at?: string;
  swarm_enriched_at?: string;
  swarm_scorecard?: Record<string, unknown>;
  research_goals_status?: unknown[];
  handoff_audit?: Record<string, unknown>;
  provability_scorecard?: Record<string, unknown>;
}

function pickSwarmFields(briefing: Record<string, unknown>, source: string): SwarmBriefingSnapshot {
  return {
    source,
    generated_at: briefing.generated_at as string | undefined,
    swarm_enriched_at: briefing.swarm_enriched_at as string | undefined,
    swarm_scorecard: briefing.swarm_scorecard as Record<string, unknown> | undefined,
    research_goals_status: briefing.research_goals_status as unknown[] | undefined,
    handoff_audit: briefing.handoff_audit as Record<string, unknown> | undefined,
    provability_scorecard: briefing.provability_scorecard as Record<string, unknown> | undefined,
  };
}

/** Load swarm keys from benchmarks briefing, agents mirror, or embedded report briefing. */
export function loadSwarmBriefingSnapshot(
  embeddedBriefing?: Record<string, unknown> | null,
): SwarmBriefingSnapshot | null {
  const bench = resolveBenchmarksRoot();
  if (bench) {
    const path = join(bench, "data", "latest", "agent-briefing.json");
    if (existsSync(path)) {
      const briefing = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      return pickSwarmFields(briefing, path);
    }
  }

  const agentsPath = join(agentsPackageRoot(), "data", "latest", "agent-briefing.json");
  if (existsSync(agentsPath)) {
    const briefing = JSON.parse(readFileSync(agentsPath, "utf8")) as Record<string, unknown>;
    return pickSwarmFields(briefing, agentsPath);
  }

  if (embeddedBriefing && typeof embeddedBriefing === "object") {
    return pickSwarmFields(embeddedBriefing, "embedded");
  }

  return null;
}
