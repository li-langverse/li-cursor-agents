import { loadRecentRunSummaries } from "./build-report.js";
import { dbEnabled } from "../db/client.js";
import { loadLatestReportHybrid, persistLiveInterventions } from "../db/persist.js";
import {
  isBriefingNewerThanReport,
  liveBriefingHash,
  loadFreshBriefing,
  recomputeLiveInterventions,
} from "./live-interventions.js";
import { readJson } from "./read-json.js";
import { reportPath } from "./paths.js";
import { loadState } from "./state.js";
import { parseHeapPlanFromBriefing, parseOrgRoadmapFromBriefing } from "../heap/plan.js";
import type { ControlPlaneReport } from "./types.js";

/**
 * Recompute interventions and queue from current agent-briefing.json (and persist to DB).
 * Stored supervisor snapshots can list merged PRs until briefing is refreshed.
 */
export async function buildLiveReportAsync(stored: ControlPlaneReport | null): Promise<ControlPlaneReport | null> {
  if (!stored) return null;

  const fresh = loadFreshBriefing(stored);
  if (!fresh) return stored;

  const { briefing, path, briefingGeneratedAt } = fresh;
  const interventions = recomputeLiveInterventions(briefing);
  const briefingHash = liveBriefingHash(briefing);

  const recommended = Array.isArray(briefing.recommended_agents)
    ? (briefing.recommended_agents as Array<{ agent: string; reason: string }>)
    : stored.recommended_agents;

  const liveAt = new Date().toISOString();
  const stale =
    isBriefingNewerThanReport(briefingGeneratedAt, stored.generated_at) ||
    briefingHash !== stored.briefing_hash;

  const report: ControlPlaneReport = {
    ...stored,
    live_at: liveAt,
    briefing_hash: briefingHash,
    briefing_source: path ?? "embedded",
    briefing_generated_at: briefingGeneratedAt,
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
    stale_warning: stale
      ? `Interventions refreshed from briefing ${briefingGeneratedAt} (supervisor report was ${stored.generated_at})`
      : undefined,
  };

  await persistLiveInterventions({
    interventions,
    briefingHash,
    briefingGeneratedAt,
    generatedAt: liveAt,
  });

  return report;
}

/** Sync wrapper — prefer buildLiveReportAsync when DB or refresh is needed. */
export function buildLiveReport(stored: ControlPlaneReport | null): ControlPlaneReport | null {
  if (!stored) return null;
  const fresh = loadFreshBriefing(stored);
  if (!fresh) return stored;
  const interventions = recomputeLiveInterventions(fresh.briefing);
  return {
    ...stored,
    live_at: new Date().toISOString(),
    briefing_hash: liveBriefingHash(fresh.briefing),
    briefing_source: fresh.path ?? "embedded",
    briefing_generated_at: fresh.briefingGeneratedAt,
    interventions,
    preflight: {
      ...stored.preflight,
      briefing_path: fresh.path ?? stored.preflight.briefing_path,
      briefing: fresh.briefing,
    },
  };
}

export async function loadLiveReportAsync(): Promise<ControlPlaneReport | null> {
  let stored: ControlPlaneReport | null = null;
  if (dbEnabled()) {
    try {
      stored = await loadLatestReportHybrid();
    } catch {
      stored = null;
    }
  }
  if (!stored) {
    stored = readJson(reportPath()) as ControlPlaneReport | null;
  }
  return buildLiveReportAsync(stored);
}

export function loadLiveReport(): ControlPlaneReport | null {
  const stored = readJson(reportPath()) as ControlPlaneReport | null;
  return buildLiveReport(stored);
}

export async function loadLiveInterventionsPayload(): Promise<{
  generated_at: string;
  briefing_generated_at: string;
  briefing_hash: string;
  interventions: ControlPlaneReport["interventions"];
  stale_warning?: string;
}> {
  const report = await loadLiveReportAsync();
  if (!report) {
    return {
      generated_at: new Date().toISOString(),
      briefing_generated_at: "",
      briefing_hash: "",
      interventions: [],
    };
  }
  return {
    generated_at: report.live_at ?? report.generated_at,
    briefing_generated_at: report.briefing_generated_at ?? "",
    briefing_hash: report.briefing_hash,
    interventions: report.interventions,
    stale_warning: report.stale_warning,
  };
}
