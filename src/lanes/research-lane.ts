import { isSdkSlotLockError } from "../backends/sdk-session-lock.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";
import {
  loadResearchGoals,
  pickNextGoal,
  pickNextGoalForAgent,
  resolveGoalAgent,
} from "../research-goals/load-goals.js";
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

/** Work for one research agent only (used by parallel per-agent workers). */
export async function pickResearchWorkForAgent(
  agentId: AgentId,
): Promise<ResearchWorkTarget | null> {
  if (agentUsesResearchSession(agentId)) {
    const session = await loadResearchSession(agentId);
    if (session?.status === "in_progress") {
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

  const state = loadLaneState();
  const goal = pickNextGoalForAgent(agentId, loadResearchGoals(), state.goal_last_run_at);
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

export async function pickResearchLaneTarget(): Promise<ResearchWorkTarget | null> {
  const resumed = await findAnyInProgressSession();
  if (resumed) {
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
  const goal = pickNextGoal(loadResearchGoals(), state.goal_last_run_at);
  if (!goal) return null;

  const agentId = resolveGoalAgent(goal);
  return pickResearchWorkForAgent(agentId);
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
  options?: { mock?: boolean; dryRun?: boolean; benchmarksRoot?: string },
): Promise<ResearchAgentCycleResult> {
  const laneState = loadLaneState();
  if (!laneState.research_lane_enabled) {
    return { skipped: true, skip_reason: "research lane disabled", agentId };
  }
  if (isHandoffRunInProgress()) {
    return { skipped: true, skip_reason: "handoff run-all in progress", agentId };
  }

  const target = await pickResearchWorkForAgent(agentId);
  if (!target) {
    return { skipped: true, skip_reason: "no eligible goal or session for agent", agentId };
  }

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

  const next = loadLaneState();
  next.last_research_tick_at = new Date().toISOString();
  saveLaneState(next);

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

  const target = await pickResearchLaneTarget();
  if (!target) {
    return { skipped: true, skip_reason: "no eligible research goal or session" };
  }

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

  const next = loadLaneState();
  next.last_research_tick_at = new Date().toISOString();
  saveLaneState(next);

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
