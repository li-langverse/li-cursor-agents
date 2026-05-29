import { resolveCursorApiKey } from "../env.js";
import { loadRecentRunSummaries } from "../control-plane/build-report.js";
import type { ControlPlaneState } from "../control-plane/types.js";
import type { AgentRunResult } from "../types.js";
import type { AgentId } from "../types.js";
import { canonicalAgentId } from "../agents/registry.js";
import type { ObserverState, SwarmFinding, SwarmHealthReport } from "./types.js";
import { buildRemediations } from "./remediate.js";
import { isSwarmActiveOnHost } from "../swarm/swarm-watchdog-core.js";
import {
  briefingPreflightFailed,
  briefingStaleMs,
  briefingWorkspaceDirty,
  classifyRunFailure,
  isBriefingStale,
} from "./classify-failure.js";
import { computeSwarmDegraded, degradedReasons } from "./degraded.js";
import type { RunFailureClass } from "./classify-failure.js";

const DEFAULT_RUN_WINDOW = 16;
const ERROR_STREAK_THRESHOLD = 2;

function isSdkError(run: AgentRunResult): boolean {
  return classifyRunFailure(run)?.class === "sdk_auth";
}

function tallyFailureClasses(runs: AgentRunResult[]): Partial<Record<RunFailureClass, number>> {
  const tally: Partial<Record<RunFailureClass, number>> = {};
  for (const run of runs) {
    const c = classifyRunFailure(run);
    if (!c) continue;
    tally[c.class] = (tally[c.class] ?? 0) + 1;
  }
  return tally;
}

function countErrors(runs: AgentRunResult[]): number {
  return runs.filter((r) => r.status === "error").length;
}

function errorStreakByAgent(runs: AgentRunResult[]): Map<AgentId, number> {
  const streak = new Map<AgentId, number>();
  for (const run of runs) {
    const id = canonicalAgentId(run.agentId);
    if (!id) continue;
    if (run.status === "error") {
      streak.set(id, (streak.get(id) ?? 0) + 1);
    } else if (run.status === "finished") {
      streak.set(id, 0);
    }
  }
  return streak;
}

function supervisorStale(state: ControlPlaneState): boolean {
  if (state.supervisor_status !== "running_agent" || !state.current_supervisor_agent) {
    return false;
  }
  const tickAt = state.last_tick_at ? Date.parse(state.last_tick_at) : 0;
  if (!tickAt) return false;
  const staleMs = Number(process.env.LI_OBSERVER_STALE_AGENT_MS ?? 45 * 60_000);
  return Date.now() - tickAt > staleMs;
}

function extractIncompleteAgents(briefing: unknown): AgentId[] {
  if (!briefing || typeof briefing !== "object") return [];
  const rows = (briefing as Record<string, unknown>).agent_incomplete_runs as
    | Array<{ agent_id: string }>
    | undefined;
  if (!rows?.length) return [];
  const out: AgentId[] = [];
  for (const r of rows) {
    const id = canonicalAgentId(r.agent_id);
    if (id) out.push(id);
  }
  return out;
}

function recommendedNotRecentlyRun(
  briefing: unknown,
  runs: AgentRunResult[],
): SwarmFinding | undefined {
  if (!briefing || typeof briefing !== "object") return undefined;
  const rec = (briefing as Record<string, unknown>).recommended_agents as
    | Array<{ agent: string; reason: string }>
    | undefined;
  if (!rec?.length || runs.length < 4) return undefined;
  const ran = new Set(
    runs.slice(0, 8).map((r) => canonicalAgentId(r.agentId)).filter(Boolean),
  );
  const missing = rec
    .map((r) => canonicalAgentId(r.agent))
    .filter((id): id is AgentId => Boolean(id) && !ran.has(id));
  if (missing.length === 0) return undefined;
  if (missing.length < Math.min(2, rec.length)) return undefined;
  return {
    kind: "goal_mismatch",
    severity: "medium",
    title: "Briefing priorities not reflected in recent runs",
    detail: `Top recommended agents not run recently: ${missing.slice(0, 4).join(", ")}`,
    auto_healable: true,
  };
}

export function scanSwarmHealth(params: {
  state: ControlPlaneState;
  briefing: unknown;
  observerState: ObserverState;
  recentRuns?: AgentRunResult[];
}): SwarmHealthReport {
  const runs = params.recentRuns ?? loadRecentRunSummaries(DEFAULT_RUN_WINDOW);
  const findings: SwarmFinding[] = [];
  const errorRate = runs.length > 0 ? countErrors(runs) / runs.length : 0;

  if (!resolveCursorApiKey() && runs.some((r) => r.backend === "cursor-sdk")) {
    findings.push({
      kind: "sdk_unavailable",
      severity: "critical",
      title: "Cursor SDK key missing",
      detail: "Recent runs used cursor-sdk but CURSOR_API_KEY is unset.",
      auto_healable: false,
    });
  }

  if (runs.some(isSdkError)) {
    findings.push({
      kind: "sdk_unavailable",
      severity: "high",
      title: "Recent SDK authentication failures",
      detail: "One or more runs failed with API key / auth errors.",
      auto_healable: false,
    });
  }

  if (supervisorStale(params.state)) {
    findings.push({
      kind: "supervisor_stale",
      severity: "high",
      agentId: params.state.current_supervisor_agent,
      title: `Supervisor appears stuck on ${params.state.current_supervisor_agent}`,
      detail: `No tick progress since ${params.state.last_tick_at ?? "unknown"}.`,
      auto_healable: false,
    });
  }

  const streaks = errorStreakByAgent(runs);
  for (const [agentId, n] of streaks) {
    if (n < ERROR_STREAK_THRESHOLD) continue;
    const budget = params.observerState.retry_counts[agentId] ?? 0;
    const maxRetries = Number(process.env.LI_OBSERVER_MAX_RETRIES_PER_AGENT ?? 3);
    findings.push({
      kind: budget >= maxRetries ? "retry_budget_exhausted" : "agent_error_streak",
      severity: budget >= maxRetries ? "high" : "medium",
      agentId,
      title: `${agentId} failed ${n} recent run(s) in a row`,
      detail:
        budget >= maxRetries
          ? `Auto-retry budget exhausted (${budget}/${maxRetries}).`
          : "Observer will schedule auto-retry if not on stop list.",
      auto_healable: budget < maxRetries,
    });
  }

  for (const agentId of extractIncompleteAgents(params.briefing)) {
    findings.push({
      kind: "agent_incomplete",
      severity: "high",
      agentId,
      title: `${agentId} ended with incomplete deliverable`,
      detail: "Briefing lists agent_incomplete_runs for this agent.",
      auto_healable: true,
    });
  }

  const goalFinding = recommendedNotRecentlyRun(params.briefing, runs);
  if (goalFinding) findings.push(goalFinding);

  if (isBriefingStale(params.briefing)) {
    const ageH = Math.round((briefingStaleMs(params.briefing) ?? 0) / 3_600_000);
    findings.push({
      kind: "briefing_stale",
      severity: "medium",
      title: "Briefing snapshot is stale",
      detail: `generated_at is ~${ageH}h old — refresh preflight or run maintenance lane.`,
      auto_healable: true,
    });
  }

  if (briefingPreflightFailed(params.briefing)) {
    findings.push({
      kind: "preflight_failed",
      severity: "high",
      title: "Preflight script(s) failed in latest briefing",
      detail: "One or more preflight_runs exited non-zero; observer will schedule meta audit.",
      auto_healable: true,
    });
  }

  const audit = (params.briefing as Record<string, unknown> | null)?.handoff_audit as
    | Record<string, unknown>
    | undefined;
  const openHandoffs = audit?.open_handoffs;
  const handoffThreshold = Number(process.env.LI_OBSERVER_HANDOFF_BACKLOG_THRESHOLD ?? 4);
  if (typeof openHandoffs === "number" && openHandoffs >= handoffThreshold) {
    findings.push({
      kind: "handoffs_backlog",
      severity: "medium",
      title: `${openHandoffs} open handoff(s) in backlog`,
      detail: `Threshold ${handoffThreshold}; placement or implement lane may be stuck.`,
      auto_healable: true,
    });
  }

  const failureTally = tallyFailureClasses(runs);
  const dominant = Object.entries(failureTally).sort((a, b) => b[1] - a[1])[0];
  if (dominant && dominant[1] >= 2) {
    const [klass, n] = dominant;
    findings.push({
      kind: "run_failure_pattern",
      severity: klass === "sdk_auth" ? "critical" : "medium",
      title: `Repeated ${klass} failures (${n} recent runs)`,
      detail: "Classified from run stderr; see failure_classes on health report.",
      auto_healable: klass !== "sdk_auth",
    });
    if (klass === "repo_dirty" && !briefingWorkspaceDirty(params.briefing)) {
      findings.push({
        kind: "run_failure_pattern",
        severity: "medium",
        title: "Run errors suggest dirty workspace",
        detail: "workspace_dirty_sweep not set in briefing — dispatch sweeper.",
        auto_healable: true,
      });
    }
  }

  const distinctFailedAgents = new Set(
    runs.filter((r) => r.status === "error").map((r) => canonicalAgentId(r.agentId)),
  );
  const needsMetaObserver =
    errorRate >= 0.5 ||
    distinctFailedAgents.size >= 3 ||
    findings.some((f) => f.kind === "retry_budget_exhausted");

  const remediations = buildRemediations({
    findings,
    briefing: params.briefing,
    state: params.state,
    observerState: params.observerState,
    runs,
    needsMetaObserver,
    asyncSwarmActive: isSwarmActiveOnHost(),
  });

  const healthy =
    findings.length === 0 ||
    findings.every((f) => f.severity === "low" || (f.auto_healable && remediations.length > 0));

  const report: SwarmHealthReport = {
    scanned_at: new Date().toISOString(),
    healthy,
    findings,
    remediations,
    runs_sampled: runs.length,
    error_rate: errorRate,
    needs_meta_observer: needsMetaObserver,
    failure_classes: Object.keys(failureTally).length > 0 ? failureTally : undefined,
  };
  report.swarm_degraded = computeSwarmDegraded(report);
  report.degraded_reasons = degradedReasons(report);
  return report;
}
