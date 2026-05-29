import { isSdkSlotLockError, sdkSlotLikelyAvailable } from "../backends/sdk-session-lock.js";
import {
  buildPlanBacklogInstruction,
  pickNextPlanBacklogTodo,
} from "./plan-backlog-work.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";
import {
  eligibleGoals,
  loadResearchGoals,
  resolveGoalAgent,
} from "../research-goals/load-goals.js";
import {
  researchGoalDispatchBlocked,
  researchLaneInfraBlocked,
} from "./research-goal-circuit-breaker.js";
import { loadResearchSession } from "../research-sessions/session-store.js";
import {
  agentUsesResearchSession,
  buildGoalKickoffBlock,
  ensureSessionForGoal,
  findAnyInProgressSession,
} from "../research-sessions/session-lifecycle.js";
import { buildResearchSessionContinuationBlock } from "../research-sessions/session-store.js";
import {
  buildResearchGoalKickoffExtra,
  findResearchGoalById,
  resolveResearchFactoryContext,
  resolveResearchFactoryContextForSession,
  type ResearchFactoryContext,
} from "../research-goals/research-goal-context.js";
import { isHandoffRunInProgress } from "./handoff-run-coordinator.js";
import { loadLaneState, recordGoalRun, saveLaneState } from "./lane-state.js";
import type { AgentId } from "../types.js";
import type { ResearchGoal } from "../research-goals/load-goals.js";
import type { ResearchSession } from "../research-sessions/types.js";

export interface ResearchLaneTickResult {
  skipped: boolean;
  skip_reason?: string;
  agentId?: AgentId;
  goalId?: string;
  status?: string;
}

export type ResearchWorkTarget = {
  agentId: AgentId;
  goal?: ResearchGoal;
  session?: ResearchSession;
  extra: string;
  factoryContext?: ResearchFactoryContext;
};

function buildResearchWorkTarget(
  agentId: AgentId,
  goal: ResearchGoal | undefined,
  session: ResearchSession | undefined,
  extra: string,
  factoryContext?: ResearchFactoryContext,
): ResearchWorkTarget {
  return { agentId, goal, session, extra, factoryContext };
}

async function pickNextUnblockedGoalForAgent(
  agentId: AgentId,
  options?: { force?: boolean },
): Promise<ResearchGoal | null> {
  const state = loadLaneState();
  const candidates = eligibleGoals(
    loadResearchGoals().filter((g) => resolveGoalAgent(g) === agentId),
    state.goal_last_run_at,
    Date.now(),
  );
  for (const goal of candidates) {
    const block = await researchGoalDispatchBlocked(goal.id, options);
    if (!block.blocked) return goal;
  }
  return null;
}

/** Work for one research agent only (used by parallel per-agent workers). */
export async function pickResearchWorkForAgent(
  agentId: AgentId,
  options?: { force?: boolean },
): Promise<ResearchWorkTarget | null> {
  const infra = researchLaneInfraBlocked(options);
  if (infra.blocked) return null;

  if (agentUsesResearchSession(agentId)) {
    const session = await loadResearchSession(agentId);
    if (session?.status === "in_progress") {
      if (session.goal_id) {
        const block = await researchGoalDispatchBlocked(session.goal_id, options);
        if (block.blocked) return null;
      }
      const goal = session.goal_id ? findResearchGoalById(session.goal_id) : undefined;
      const factoryContext = resolveResearchFactoryContextForSession(session);
      const extra = goal
        ? [
            buildResearchGoalKickoffExtra(goal, session),
            buildResearchSessionContinuationBlock(session, factoryContext?.publish_subdir),
          ].join("\n")
        : buildResearchSessionContinuationBlock(session, factoryContext?.publish_subdir);
      return buildResearchWorkTarget(agentId, goal, session, extra, factoryContext);
    }
  }

  const planTodo = pickNextPlanBacklogTodo(agentId);
  if (planTodo) {
    const planGoal = loadResearchGoals().find((g) => resolveGoalAgent(g) === agentId);
    const extra = buildPlanBacklogInstruction(agentId, planTodo);
    return buildResearchWorkTarget(
      agentId,
      planGoal,
      undefined,
      planGoal ? [buildResearchGoalKickoffExtra(planGoal), extra].join("\n") : extra,
      planGoal ? resolveResearchFactoryContext(planGoal) : undefined,
    );
  }

  const goal = await pickNextUnblockedGoalForAgent(agentId, options);
  if (!goal) return null;

  if (!goal.uses_research_session && !agentUsesResearchSession(agentId)) {
    return buildResearchWorkTarget(
      agentId,
      goal,
      undefined,
      buildResearchGoalKickoffExtra(goal),
      resolveResearchFactoryContext(goal),
    );
  }

  const session = await ensureSessionForGoal(agentId, goal);
  const factoryContext = resolveResearchFactoryContext(goal);
  return buildResearchWorkTarget(
    agentId,
    goal,
    session,
    [
      buildGoalKickoffBlock(goal, session),
      buildResearchSessionContinuationBlock(session, factoryContext.publish_subdir),
    ].join("\n"),
    factoryContext,
  );
}

export async function pickResearchLaneTarget(options?: { force?: boolean }): Promise<ResearchWorkTarget | null> {
  const infra = researchLaneInfraBlocked(options);
  if (infra.blocked) return null;

  const resumed = await findAnyInProgressSession();
  if (resumed) {
    if (resumed.goal_id) {
      const block = await researchGoalDispatchBlocked(resumed.goal_id, options);
      if (block.blocked) return null;
    }
    const agentId = resumed.agent_id as AgentId;
    const goal = resumed.goal_id ? findResearchGoalById(resumed.goal_id) : undefined;
    const factoryContext = resolveResearchFactoryContextForSession(resumed);
    const extra = goal
      ? [
          buildResearchGoalKickoffExtra(goal, resumed),
          buildResearchSessionContinuationBlock(resumed, factoryContext?.publish_subdir),
        ].join("\n")
      : buildResearchSessionContinuationBlock(resumed, factoryContext?.publish_subdir);
    return buildResearchWorkTarget(agentId, goal, resumed, extra, factoryContext);
  }

  const state = loadLaneState();
  for (const goal of eligibleGoals(loadResearchGoals(), state.goal_last_run_at, Date.now())) {
    const block = await researchGoalDispatchBlocked(goal.id, options);
    if (block.blocked) continue;
    const agentId = resolveGoalAgent(goal);
    return pickResearchWorkForAgent(agentId, options);
  }
  return null;
}

export interface ResearchAgentCycleResult {
  skipped: boolean;
  skip_reason?: string;
  agentId: AgentId;
  goalId?: string;
  status?: string;
}

/** One research-agent cycle (parallel pool) — same runAgent path as lane tick. */
export async function researchAgentWorkerCycle(
  agentId: AgentId,
  options?: {
    mock?: boolean;
    dryRun?: boolean;
    benchmarksRoot?: string;
    force?: boolean;
  },
): Promise<ResearchAgentCycleResult> {
  const laneState = loadLaneState();
  if (!options?.force && !laneState.research_lane_enabled) {
    return { skipped: true, skip_reason: "research lane disabled", agentId };
  }
  if (!options?.force && isHandoffRunInProgress()) {
    return { skipped: true, skip_reason: "handoff run-all in progress", agentId };
  }
  const infra = researchLaneInfraBlocked({ force: options?.force });
  if (infra.blocked) {
    return { skipped: true, skip_reason: infra.reason ?? "research infra blocked", agentId };
  }
  if (!sdkSlotLikelyAvailable()) {
    return {
      skipped: true,
      skip_reason: "sdk session slots busy (waiting for slot)",
      agentId,
    };
  }

  const target = await pickResearchWorkForAgent(agentId, { force: options?.force });
  if (!target) {
    return { skipped: true, skip_reason: "no eligible goal or session for agent", agentId };
  }

  const tickState = loadLaneState();
  tickState.last_research_tick_at = new Date().toISOString();
  saveLaneState(tickState);

  const benchmarksRoot = resolveBenchmarksRoot(options?.benchmarksRoot);
  const packageRoot = agentsPackageRoot();
  const mock = options?.mock ?? shouldUseMock(false);
  let result;
  try {
    result = await runAgent({
      agentId: target.agentId,
      cwd: benchmarksRoot ?? packageRoot,
      benchmarksRoot,
      mock: Boolean(mock),
      dryRun: Boolean(options?.dryRun),
      extraInstruction: target.extra,
      researchContext: target.factoryContext,
    });
  } catch (err) {
    if (isSdkSlotLockError(err)) throw err;
    return {
      skipped: false,
      agentId: target.agentId,
      goalId: target.goal?.id ?? target.session?.goal_id,
      status: "error",
      skip_reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (target.goal?.id) {
    recordGoalRun(loadLaneState(), target.goal.id);
  }

  return {
    skipped: false,
    agentId: target.agentId,
    goalId: target.goal?.id ?? target.session?.goal_id,
    status: result.status,
  };
}

export async function researchLaneTick(options?: {
  mock?: boolean;
  dryRun?: boolean;
  benchmarksRoot?: string;
  /** Run-all (handoff): execute even when lane toggle is off. */
  force?: boolean;
}): Promise<ResearchLaneTickResult> {
  const laneState = loadLaneState();
  if (!options?.force && !laneState.research_lane_enabled) {
    return { skipped: true, skip_reason: "research lane disabled" };
  }
  if (!options?.force && isHandoffRunInProgress()) {
    return { skipped: true, skip_reason: "handoff run-all in progress" };
  }

  const infra = researchLaneInfraBlocked({ force: options?.force });
  if (infra.blocked) {
    return { skipped: true, skip_reason: infra.reason ?? "research infra blocked" };
  }

  const target = await pickResearchLaneTarget({ force: options?.force });
  if (!target) {
    return { skipped: true, skip_reason: "no eligible research goal or session" };
  }

  const tickState = loadLaneState();
  tickState.last_research_tick_at = new Date().toISOString();
  saveLaneState(tickState);

  const benchmarksRoot = resolveBenchmarksRoot(options?.benchmarksRoot);
  const packageRoot = agentsPackageRoot();
  const mock = options?.mock ?? shouldUseMock(false);
  const result = await runAgent({
    agentId: target.agentId,
    cwd: benchmarksRoot ?? packageRoot,
    benchmarksRoot,
    mock: Boolean(mock),
    dryRun: Boolean(options?.dryRun),
    extraInstruction: target.extra,
    researchContext: target.factoryContext,
  });

  if (target.goal?.id) {
    recordGoalRun(loadLaneState(), target.goal.id);
  }

  return {
    skipped: false,
    agentId: target.agentId,
    goalId: target.goal?.id ?? target.session?.goal_id,
    status: result.status,
  };
}

export function researchLaneIntervalMs(): number {
  const n = Number(process.env.LI_RESEARCH_LANE_INTERVAL_MS ?? 90_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 90_000;
}

export async function runResearchLaneLoop(options?: {
  mock?: boolean;
  once?: boolean;
}): Promise<void> {
  const once = options?.once ?? process.env.LI_RESEARCH_LANE_ONCE === "1";
  do {
    const tick = await researchLaneTick({ mock: options?.mock });
    if (tick.skipped) {
      // eslint-disable-next-line no-console
      console.error(`research-lane: ${tick.skip_reason}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(
        `research-lane: agent=${tick.agentId} goal=${tick.goalId ?? "—"} status=${tick.status}`,
      );
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, researchLaneIntervalMs()));
  } while (true);
}
