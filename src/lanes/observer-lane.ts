/** Programmatic observer ticks for async-swarm (retries, healers, meta audit) without supervisor loop. */

import { loadCachedBriefing } from "../briefing/load-cached-briefing.js";
import { loadRecentRunSummariesAsync } from "../control-plane/build-report.js";
import { loadState, saveState } from "../control-plane/state.js";
import { spawnAgentRun } from "../control-plane/runtime.js";
import { runSwarmGapIngestTick } from "../observer/gap-registry-ingest.js";
import { applyInfrastructureRemediations } from "../observer/remediate.js";
import { loadObserverState, saveObserverState } from "../observer/state.js";
import { scanSwarmHealth } from "../observer/swarm-health.js";
import type { SwarmHealthReport } from "../observer/types.js";
import type { AgentId } from "../types.js";

export function isProgrammaticObserverEnabled(): boolean {
  const v = process.env.LI_OBSERVER_DISABLE?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "off" || v === "yes") return false;
  return true;
}

export interface ObserverLaneTickResult {
  ok: boolean;
  skip_reason?: string;
  health?: SwarmHealthReport;
  spawned?: string[];
  infra_restart?: boolean;
}

function maxSpawnsPerTick(): number {
  const n = Number(process.env.LI_OBSERVER_LANE_MAX_SPAWNS ?? 2);
  return Number.isFinite(n) && n >= 0 ? Math.min(8, n) : 2;
}

/** Scan health, apply infra fixes, spawn up to N remediation agents. */
export async function observerLaneTick(): Promise<ObserverLaneTickResult> {
  if (!isProgrammaticObserverEnabled()) {
    return { ok: false, skip_reason: "observer disabled (LI_OBSERVER_DISABLE)" };
  }

  const state = loadState();
  const observerState = loadObserverState(state);
  const briefing = loadCachedBriefing() ?? {};

  const ingest = runSwarmGapIngestTick();
  if (!ingest.ok) {
    // eslint-disable-next-line no-console
    console.warn(`observer-lane: swarm-gap-ingest failed: ${ingest.detail}`);
  }

  let recentRuns: Awaited<ReturnType<typeof loadRecentRunSummariesAsync>> = [];
  let storeUnreachable = false;
  try {
    recentRuns = await loadRecentRunSummariesAsync(16);
  } catch (err) {
    storeUnreachable = true;
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`observer-lane: recent runs unavailable: ${msg}`);
  }

  const swarmHealth = scanSwarmHealth({
    state,
    briefing,
    observerState,
    recentRuns,
  });

  const extraRemediations = [...swarmHealth.remediations];
  if (storeUnreachable) {
    extraRemediations.unshift({
      kind: "reconcile_stale_runs",
      reason: "observer: Supabase run history unavailable — reconcile stale rows",
    });
  }

  const infra = await applyInfrastructureRemediations(extraRemediations);

  const spawned: string[] = [];
  const limit = maxSpawnsPerTick();
  for (const action of swarmHealth.remediations) {
    if (spawned.length >= limit) break;
    if (!action.agentId) continue;
    if (action.kind === "retry_agent" || action.kind === "dispatch_healer" || action.kind === "schedule_meta_observer") {
      const agentId = action.agentId as AgentId;
      const r = spawnAgentRun(agentId, action.reason);
      if (r.ok) spawned.push(agentId);
    }
  }

  state.swarm_health = swarmHealth;
  saveObserverState(state, observerState);
  saveState(state);

  return {
    ok: true,
    health: swarmHealth,
    spawned,
    infra_restart: infra.restarted,
  };
}

export function observerLaneIntervalMs(): number {
  const n = Number(process.env.LI_OBSERVER_LANE_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 120_000;
}
