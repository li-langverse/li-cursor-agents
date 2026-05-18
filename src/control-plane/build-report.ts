import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentRunResult, PreflightBundle } from "../types.js";
import { runsDir } from "./paths.js";
import type { HeapPlan, OrgRoadmapContext } from "../heap/plan.js";
import type { CoordinatorId } from "../heap/coordinators.js";
import type { ControlPlaneReport, ControlPlaneState, HumanIntervention } from "./types.js";
import { agentLog } from "../agent-log.js";
import { persistReport } from "../db/persist.js";
import { dbEnabled, useSupabaseStore } from "../db/client.js";
import { isMockRun } from "./run-history.js";
import { listRunsGlobal } from "../db/runs.js";

export function writeReport(report: ControlPlaneReport, interventions: HumanIntervention[]): void {
  void persistReport(report, interventions).catch((err) => {
    agentLog("control-plane", "ERROR", `persist report failed: ${err}`);
  });
}

export async function loadRecentRunSummariesAsync(limit = 12): Promise<AgentRunResult[]> {
  if (useSupabaseStore()) {
    if (!dbEnabled()) return [];
    const rows = await listRunsGlobal(limit);
    return rows
      .filter((r) => r.backend !== "mock")
      .map(
        (r): AgentRunResult => ({
          agentId: r.agent_id as AgentRunResult["agentId"],
          backend: (r.backend as AgentRunResult["backend"]) ?? "cursor-sdk",
          status: r.status as AgentRunResult["status"],
          durationMs: r.duration_ms ?? 0,
          outputPath: r.output_path ?? "",
          outputText: r.output_md ?? undefined,
          error: r.error ?? undefined,
          completion: r.completion ?? undefined,
        }),
      );
  }
  return loadRecentRunSummaries(limit);
}

export function loadRecentRunSummaries(limit = 12): AgentRunResult[] {
  const dir = runsDir();
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
      .slice(0, limit)
      .map((x) => x.f);
  } catch {
    return [];
  }
  const out: AgentRunResult[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as AgentRunResult;
      if (raw.agentId && !isMockRun(raw)) out.push(raw);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export function assembleReport(params: {
  briefingHash: string;
  preflight: PreflightBundle;
  recommended: Array<{ agent: string; reason: string }>;
  orgRoadmap?: OrgRoadmapContext;
  heapPlan?: HeapPlan;
  activeCoordinator?: CoordinatorId;
  interventions: HumanIntervention[];
  state: ControlPlaneState;
  tasksExecuted: number;
  tasksSkippedCooldown: number;
  recentRuns: AgentRunResult[];
}): ControlPlaneReport {
  return {
    generated_at: new Date().toISOString(),
    briefing_hash: params.briefingHash,
    preflight: params.preflight,
    recommended_agents: params.recommended,
    org_roadmap: params.orgRoadmap,
    heap_plan: params.heapPlan,
    active_coordinator: params.activeCoordinator,
    interventions: params.interventions,
    recent_runs: params.recentRuns,
    supervisor: {
      status: params.state.supervisor_status,
      runs_total: params.state.runs_total,
      last_tick_at: params.state.last_tick_at,
      tasks_executed_this_tick: params.tasksExecuted,
      tasks_skipped_cooldown: params.tasksSkippedCooldown,
    },
  };
}
