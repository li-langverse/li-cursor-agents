import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { resolveBenchmarksRoot, runPreflight } from "../preflight.js";
import {
  loadResearchGoals,
  pickNextGoal,
  resolveGoalAgent,
} from "../research-goals/load-goals.js";
import {
  agentUsesResearchSession,
  buildGoalKickoffBlock,
  ensureSessionForGoal,
  findAnyInProgressSession,
} from "../research-sessions/session-lifecycle.js";
import { buildResearchSessionContinuationBlock } from "../research-sessions/session-store.js";
import { northStarFitForGoal } from "../research-goals/load-goals.js";
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

export async function pickResearchLaneTarget(): Promise<{
  agentId: AgentId;
  goal?: ResearchGoal;
  session?: ResearchSession;
  extra: string;
} | null> {
  const resumed = await findAnyInProgressSession();
  if (resumed) {
    return {
      agentId: resumed.agent_id as AgentId,
      session: resumed,
      extra: buildResearchSessionContinuationBlock(resumed),
    };
  }

  const state = loadLaneState();
  const goal = pickNextGoal(loadResearchGoals(), state.goal_last_run_at);
  if (!goal) return null;

  const agentId = resolveGoalAgent(goal);
  if (!goal.uses_research_session && !agentUsesResearchSession(agentId)) {
    return {
      agentId,
      goal,
      extra: [
        "## Research goal (this run)",
        "",
        `- **Goal id:** \`${goal.id}\``,
        `- **Title:** ${goal.title}`,
        `- **north_star_fit:** ${northStarFitForGoal(goal)}`,
        "",
      ].join("\n"),
    };
  }

  const session = await ensureSessionForGoal(agentId, goal);
  return {
    agentId,
    goal,
    session,
    extra: [buildGoalKickoffBlock(goal, session), buildResearchSessionContinuationBlock(session)].join(
      "\n",
    ),
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
