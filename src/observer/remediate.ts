import { taskFingerprint } from "../heap/task-queue.js";
import { canonicalAgentId } from "../agents/registry.js";
import type { ControlPlaneState, QueuedAgentTask } from "../control-plane/types.js";
import type { AgentRunResult } from "../types.js";
import type { AgentId } from "../types.js";
import { restartAsyncSwarmUnit } from "../swarm/swarm-restart.js";
import {
  briefingHandoffsBacklogged,
  briefingPreflightFailed,
  briefingWorkspaceDirty,
  classifyRunFailure,
} from "./classify-failure.js";
import type { ObserverState, RemediationAction, SwarmFinding } from "./types.js";

const HEALER_AGENTS: Record<string, AgentId> = {
  ci_red: "bug_fixer",
  workspace_dirty: "workspace_sweeper",
  implementation_gap: "implementation_gaps",
};

function extractRecommended(briefing: unknown): Array<{ agent: string; reason: string }> {
  if (!briefing || typeof briefing !== "object") return [];
  const rec = (briefing as Record<string, unknown>).recommended_agents;
  return Array.isArray(rec) ? (rec as Array<{ agent: string; reason: string }>) : [];
}

function briefingHasRedBench(briefing: unknown): boolean {
  if (!briefing || typeof briefing !== "object") return false;
  const audit = (briefing as Record<string, unknown>).ecosystem_audit as
    | Record<string, unknown>
    | undefined;
  const bench = audit?.benchmarks as Record<string, unknown> | undefined;
  const red = bench?.red;
  return Array.isArray(red) && red.length > 0;
}

function envAutoStartSwarm(): boolean {
  return (
    process.env.LI_AUTO_START_ASYNC_SWARM === "1" ||
    process.env.LI_AUTO_START_ASYNC_SWARM === "true"
  );
}

export function buildRemediations(params: {
  findings: SwarmFinding[];
  briefing: unknown;
  state: ControlPlaneState;
  observerState: ObserverState;
  runs: AgentRunResult[];
  needsMetaObserver: boolean;
  asyncSwarmActive?: boolean;
  planLoopsHealthy?: boolean;
}): RemediationAction[] {
  const out: RemediationAction[] = [];
  const stopped = new Set(params.state.stopped_agents ?? []);
  const maxRetries = Number(process.env.LI_OBSERVER_MAX_RETRIES_PER_AGENT ?? 3);

  const pushUnique = (action: RemediationAction) => {
    if (action.agentId && stopped.has(action.agentId)) return;
    if (
      action.agentId &&
      out.some((a) => a.agentId === action.agentId && a.kind === action.kind)
    ) {
      return;
    }
    if (out.some((a) => a.kind === action.kind && !a.agentId && !action.agentId)) return;
    out.push(action);
  };

  if (params.asyncSwarmActive === false && envAutoStartSwarm()) {
    pushUnique({
      kind: "restart_async_swarm",
      reason: "observer:async swarm not running (auto-start enabled)",
    });
  }

  if (params.planLoopsHealthy === false) {
    pushUnique({
      kind: "schedule_meta_observer",
      agentId: "swarm_observer",
      reason: "observer:li-*-plan-loop unit unhealthy",
    });
  }

  for (const f of params.findings) {
    if (!f.auto_healable || !f.agentId) continue;
    if (f.kind === "agent_error_streak" || f.kind === "agent_incomplete") {
      const count = params.observerState.retry_counts[f.agentId] ?? 0;
      if (count >= maxRetries) continue;
      pushUnique({
        kind: "retry_agent",
        agentId: f.agentId,
        reason: `observer:auto-retry (${f.kind})`,
        fingerprintSuffix: `:retry:${count + 1}`,
      });
    }
  }

  if (briefingHasRedBench(params.briefing)) {
    const rec = extractRecommended(params.briefing);
    const numericsAlreadyQueued = rec.some((r) => {
      const id = canonicalAgentId(r.agent);
      return id === "numerics_researcher" || id === "bench_improver" || id === "autoresearch";
    });
    if (!numericsAlreadyQueued) {
      pushUnique({
        kind: "dispatch_healer",
        agentId: HEALER_AGENTS.ci_red,
        reason: "observer:red benchmarks in briefing",
      });
    }
  }

  if (briefingWorkspaceDirty(params.briefing)) {
    pushUnique({
      kind: "dispatch_healer",
      agentId: HEALER_AGENTS.workspace_dirty,
      reason: "observer:workspace_dirty_sweep in briefing",
    });
  } else if (
    params.runs.filter((r) => classifyRunFailure(r)?.class === "repo_dirty").length >= 2
  ) {
    pushUnique({
      kind: "dispatch_healer",
      agentId: HEALER_AGENTS.workspace_dirty,
      reason: "observer:repeated repo_dirty run failures",
    });
  }

  if (briefingPreflightFailed(params.briefing)) {
    pushUnique({
      kind: "schedule_meta_observer",
      agentId: "swarm_observer",
      reason: "observer:preflight script failure in briefing",
    });
  }

  if (briefingHandoffsBacklogged(params.briefing)) {
    pushUnique({
      kind: "schedule_meta_observer",
      agentId: "swarm_observer",
      reason: "observer:handoff backlog in briefing",
    });
  }

  const gaps = (params.briefing as Record<string, unknown> | null)?.agent_deliverable_gaps as
    | Record<string, number>
    | undefined;
  if (gaps && ((gaps.incomplete_runs ?? 0) > 0 || (gaps.plan_open_items ?? 0) > 0)) {
    pushUnique({
      kind: "dispatch_healer",
      agentId: HEALER_AGENTS.implementation_gap,
      reason: "observer:agent_deliverable_gaps in briefing",
    });
  }

  const goalMismatch = params.findings.find((f) => f.kind === "goal_mismatch");
  if (goalMismatch) {
    const rec = extractRecommended(params.briefing);
    const top = rec[0];
    const id = top ? canonicalAgentId(top.agent) : undefined;
    if (id) {
      pushUnique({
        kind: "retry_agent",
        agentId: id,
        reason: `observer:goal-align ${top.reason.slice(0, 120)}`,
        fingerprintSuffix: ":goal-align",
      });
    }
  }

  if (params.needsMetaObserver) {
    pushUnique({
      kind: "schedule_meta_observer",
      agentId: "swarm_observer",
      reason: "observer:swarm degraded — meta audit",
    });
  }

  return out.slice(0, Number(process.env.LI_OBSERVER_MAX_REMEDIATIONS_PER_TICK ?? 2));
}

export async function applyInfrastructureRemediations(
  actions: RemediationAction[],
): Promise<{ restarted: boolean; message: string }> {
  const restart = actions.find((a) => a.kind === "restart_async_swarm");
  if (!restart) return { restarted: false, message: "none" };
  const r = await restartAsyncSwarmUnit(restart.reason);
  return { restarted: r.ok, message: r.message };
}

export function remediationsToTasks(
  actions: RemediationAction[],
  _briefingHash: string,
): QueuedAgentTask[] {
  return actions
    .filter((a) => a.kind !== "restart_async_swarm" && a.agentId)
    .map((a) => {
      const base = taskFingerprint(a.agentId!, a.reason);
      const fp = a.fingerprintSuffix ? `${base}${a.fingerprintSuffix}` : base;
      return {
        fingerprint: fp,
        agentId: a.agentId!,
        reason: a.reason,
        source: "retry" as const,
        coordinator: undefined,
      };
    });
}

export function recordRemediationOutcome(
  observerState: ObserverState,
  task: QueuedAgentTask,
  status: string,
): void {
  if (task.source !== "retry") return;
  const id = task.agentId;
  if (status === "error") {
    observerState.retry_counts[id] = (observerState.retry_counts[id] ?? 0) + 1;
  } else if (status === "finished") {
    observerState.retry_counts[id] = 0;
  }
}

/** Retries/meta ahead of briefing work; healers fill remaining slots only. */
export function mergeRemediationTasks(
  existing: QueuedAgentTask[],
  remediations: QueuedAgentTask[],
  maxTotal: number,
): QueuedAgentTask[] {
  const seen = new Set(existing.map((t) => t.agentId));
  const urgent = remediations.filter(
    (t) => !seen.has(t.agentId) && !t.reason.startsWith("observer:red"),
  );
  const healers = remediations.filter(
    (t) => !seen.has(t.agentId) && t.reason.startsWith("observer:red"),
  );
  for (const t of urgent) seen.add(t.agentId);
  const merged = [...urgent, ...existing];
  for (const t of healers) {
    if (merged.length >= maxTotal) break;
    if (seen.has(t.agentId)) continue;
    merged.push(t);
    seen.add(t.agentId);
  }
  return merged.slice(0, maxTotal);
}
