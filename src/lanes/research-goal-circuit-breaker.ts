import { isStaleReconcileError } from "../db/reconcile-error-categories.js";
import { dbEnabled } from "../db/client.js";
import { isAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { listRunsMerged } from "../control-plane/runs-catalog.js";

export interface ResearchGoalRunSample {
  status: string;
  error?: string | null;
}

export interface ResearchDispatchBlock {
  blocked: boolean;
  reason?: string;
}

export function researchGoalReconcileStreakThreshold(): number {
  const n = Number(process.env.LI_RESEARCH_GOAL_RECONCILE_STREAK ?? 3);
  return Number.isFinite(n) && n >= 1 ? Math.min(20, Math.floor(n)) : 3;
}

/** When true (default with Supabase store), research lane waits for a live async swarm. */
export function researchRequiresAsyncSwarm(): boolean {
  const raw = process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM?.trim();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return dbEnabled();
}

export function consecutiveStaleReconcileStreak(
  runs: readonly ResearchGoalRunSample[],
): number {
  let streak = 0;
  for (const run of runs) {
    if (run.status !== "error" || !isStaleReconcileError(run.error)) break;
    streak++;
  }
  return streak;
}

export function researchGoalCircuitOpen(
  goalId: string,
  recentRuns: readonly ResearchGoalRunSample[],
  options?: { force?: boolean },
): ResearchDispatchBlock {
  if (options?.force) return { blocked: false };

  const threshold = researchGoalReconcileStreakThreshold();
  const streak = consecutiveStaleReconcileStreak(recentRuns);
  if (streak >= threshold) {
    return {
      blocked: true,
      reason: `goal ${goalId}: ${streak} consecutive reconcile errors (threshold ${threshold})`,
    };
  }
  return { blocked: false };
}

export function researchLaneInfraBlocked(options?: { force?: boolean }): ResearchDispatchBlock {
  if (options?.force) return { blocked: false };
  if (!researchRequiresAsyncSwarm()) return { blocked: false };
  if (isAsyncSwarmRunning()) return { blocked: false };
  return {
    blocked: true,
    reason: "async_swarm_running is false — start li-agents-async-swarm before research dispatch",
  };
}

export async function recentRunsForResearchGoal(
  goalId: string,
  limit = 12,
): Promise<ResearchGoalRunSample[]> {
  const merged = await listRunsMerged(Math.max(limit * 4, 80));
  return merged
    .filter((e) => e.run_input?.research_goal_id === goalId)
    .slice(0, limit)
    .map((e) => ({ status: e.status, error: e.error ?? null }));
}

export async function researchGoalDispatchBlocked(
  goalId: string,
  options?: { force?: boolean },
): Promise<ResearchDispatchBlock> {
  const infra = researchLaneInfraBlocked(options);
  if (infra.blocked) return infra;
  const recent = await recentRunsForResearchGoal(goalId);
  return researchGoalCircuitOpen(goalId, recent, options);
}
