import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashBriefing } from "./briefing-hash.js";
import { loadRecentRunSummaries } from "./build-report.js";
import { dbEnabled } from "../db/client.js";
import { scanInterventions, defaultCoordPath } from "./interventions.js";
import { readJson } from "./read-json.js";
import { reportPath } from "./paths.js";
import { loadState } from "./state.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import { parseHeapPlanFromBriefing, parseOrgRoadmapFromBriefing } from "../heap/plan.js";
import type { ControlPlaneReport } from "./types.js";

function briefingPathOnDisk(stored: ControlPlaneReport | null): string | undefined {
  const fromStored = stored?.preflight?.briefing_path;
  if (fromStored && existsSync(fromStored)) return fromStored;
  const root = resolveBenchmarksRoot();
  if (!root) return undefined;
  const path = join(root, "data", "latest", "agent-briefing.json");
  return existsSync(path) ? path : undefined;
}

function loadBriefing(path: string): Record<string, unknown> | null {
  const raw = readJson(path);
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

/**
 * Recompute interventions and queue from current agent-briefing.json on disk.
 * The stored latest-report.json is a supervisor snapshot and can show closed PRs until refreshed.
 */
export function buildLiveReport(stored: ControlPlaneReport | null): ControlPlaneReport | null {
  if (!stored) return null;

  const path = briefingPathOnDisk(stored);
  const briefing = path ? loadBriefing(path) : (stored.preflight?.briefing as Record<string, unknown> | undefined);
  if (!briefing) return stored;

  const state = loadState();
  const interventions = scanInterventions(briefing, {
    coordPath: defaultCoordPath(),
    pendingWebAgents: [],
  });

  const recommended = Array.isArray(briefing.recommended_agents)
    ? (briefing.recommended_agents as Array<{ agent: string; reason: string }>)
    : stored.recommended_agents;

  return {
    ...stored,
    generated_at: stored.generated_at,
    live_at: new Date().toISOString(),
    briefing_hash: hashBriefing(briefing),
    briefing_source: path ?? "embedded",
    briefing_generated_at: String(briefing.generated_at ?? ""),
    preflight: {
      ...stored.preflight,
      briefing_path: path ?? stored.preflight.briefing_path,
      briefing,
    },
    recommended_agents: recommended,
    org_roadmap: parseOrgRoadmapFromBriefing(briefing) ?? stored.org_roadmap,
    heap_plan: parseHeapPlanFromBriefing(briefing) ?? stored.heap_plan,
    interventions,
    agent_deliverable_gaps: briefing.agent_deliverable_gaps as ControlPlaneReport["agent_deliverable_gaps"],
    agent_incomplete_runs: briefing.agent_incomplete_runs as ControlPlaneReport["agent_incomplete_runs"],
    agent_pr_deliverable_failures:
      briefing.agent_pr_deliverable_failures as ControlPlaneReport["agent_pr_deliverable_failures"],
    recent_runs: dbEnabled()
      ? stored.recent_runs
      : (() => {
          const runs = loadRecentRunSummaries(12);
          return runs.length ? runs : stored.recent_runs;
        })(),
    supervisor: stored.supervisor,
    stale_warning:
      path && stored.generated_at
        ? undefined
        : "Run agent-briefing.py or click Refresh briefing in dashboard",
  };
}

export function loadLiveReport(): ControlPlaneReport | null {
  const stored = readJson(reportPath()) as ControlPlaneReport | null;
  return buildLiveReport(stored);
}
