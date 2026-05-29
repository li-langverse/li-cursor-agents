import { claimNextHandoff, listHandoffs, updateHandoff } from "../handoffs/handoff-store.js";
import {
  handoffNeedsArchitect,
  handoffReadyForImplement,
  validateNorthStarFit,
} from "../handoffs/placement-validator.js";
import { buildPendingHandoffsBlock } from "../handoffs/prompt-blocks.js";
import { buildGoalScaffoldBlock } from "../handoffs/goal-scaffold-prompt.js";
import {
  buildGoalPrBody,
  buildGoalPrTitle,
  buildGoalWorkflowExtra,
  resolveGoalImplementationRepo,
} from "../handoffs/goal-workflow.js";
import {
  buildImplementGoalInstruction,
  loadImplementGoals,
  markBacklogTodoDone,
  pickNextImplementWork,
  recordTodoGateResult,
  runImplementGoalGates,
} from "../implement-goals/load-goals.js";
import type { BacklogTodo, ImplementGoal } from "../implement-goals/types.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { isHandoffRunInProgress } from "./handoff-run-coordinator.js";
import { loadLaneState, recordImplementGoalRun, saveLaneState } from "./lane-state.js";
import type { AgentHandoff } from "../handoffs/types.js";
import type { AgentId } from "../types.js";

export interface ImplementLaneTickResult {
  skipped: boolean;
  skip_reason?: string;
  agentId?: AgentId;
  handoff_id?: string;
  implement_goal_id?: string;
  backlog_todo_id?: string;
  gate_pass?: boolean;
  status?: string;
}

export type ImplementLaneTarget =
  | { kind: "handoff"; agentId: AgentId; handoff: AgentHandoff }
  | { kind: "implement_goal"; agentId: AgentId; goal: ImplementGoal; todo: BacklogTodo };

function handoffInstruction(h: AgentHandoff): string {
  const scaffold = buildGoalScaffoldBlock(h);
  const workflow = buildGoalWorkflowExtra(h);
  return [
    "## Implement handoff",
    "",
    `handoff_id: \`${h.handoff_id}\``,
    `research_goal_id: ${h.research_goal_id ?? "—"}`,
    `north_star_fit: ${h.north_star_fit ?? "(missing)"}`,
    "",
    buildPendingHandoffsBlock("code_implementer", [h]),
    "",
    workflow,
    scaffold,
    "```json",
    JSON.stringify(h.work, null, 2),
    "```",
  ].join("\n");
}

export async function pickHandoffImplementTarget(): Promise<{
  agentId: AgentId;
  handoff: AgentHandoff;
} | null> {
  const placement = await listHandoffs({
    status: "pending_placement",
    toAgent: "package_architect",
    limit: 1,
  });
  if (placement[0] && handoffNeedsArchitect(placement[0])) {
    return { agentId: "package_architect", handoff: placement[0] };
  }

  const claimed = await claimNextHandoff("code_implementer");
  if (claimed && handoffReadyForImplement(claimed)) {
    return { agentId: "code_implementer", handoff: claimed };
  }
  if (claimed && validateNorthStarFit(claimed.north_star_fit)) {
    await updateHandoff(claimed.handoff_id, { status: "failed" });
    return null;
  }

  const pending = await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 5 });
  const ready = pending.find((h) => handoffReadyForImplement(h));
  if (ready) {
    await updateHandoff(ready.handoff_id, { status: "claimed", claimed_at: new Date().toISOString() });
    return { agentId: "code_implementer", handoff: ready };
  }

  return null;
}

/** Handoff queue first; then goal-directed implement goals (all configured agents). */
export async function pickImplementLaneTarget(): Promise<ImplementLaneTarget | null> {
  const handoff = await pickHandoffImplementTarget();
  if (handoff) return { kind: "handoff", ...handoff };

  const state = loadLaneState();
  const picked = pickNextImplementWork(
    loadImplementGoals(),
    state.implement_goal_last_run_at ?? {},
    state.implement_goal_last_gate_pass ?? {},
  );
  if (!picked) return null;
  return {
    kind: "implement_goal",
    agentId: picked.agentId,
    goal: picked.goal,
    todo: picked.todo,
  };
}

export async function implementLaneTick(options?: {
  mock?: boolean;
  dryRun?: boolean;
  benchmarksRoot?: string;
  /** Run-all (handoff): execute even when lane toggle is off. */
  force?: boolean;
}): Promise<ImplementLaneTickResult> {
  const laneState = loadLaneState();
  if (!options?.force && !laneState.implement_lane_enabled) {
    return { skipped: true, skip_reason: "implement lane disabled" };
  }
  if (!options?.force && isHandoffRunInProgress()) {
    return { skipped: true, skip_reason: "handoff run-all in progress" };
  }

  const target = await pickImplementLaneTarget();
  if (!target) {
    return { skipped: true, skip_reason: "no claimable handoff or implement goal" };
  }

  const benchmarksRoot = resolveBenchmarksRoot(options?.benchmarksRoot);
  const packageRoot = agentsPackageRoot();
  const mock = options?.mock ?? shouldUseMock(false);

  if (target.kind === "implement_goal") {
    const { goal, todo } = target;
    const result = await runAgent({
      agentId: target.agentId,
      cwd: benchmarksRoot ?? packageRoot,
      benchmarksRoot,
      mock: Boolean(mock),
      dryRun: Boolean(options?.dryRun),
      workflowRepo: goal.workflow_repo,
      extraInstruction: buildImplementGoalInstruction(goal, todo),
    });

    let gatePass = false;
    const terminal =
      result.status === "finished" || result.status === "error" || result.status === "cancelled";
    if (terminal && !options?.dryRun) {
      if (result.status === "finished") {
        const gates = runImplementGoalGates(goal);
        gatePass = gates.ok;
        recordTodoGateResult(goal.id, todo.id, gatePass, result.status);
        if (gatePass) markBacklogTodoDone(goal, todo.id);
      } else {
        recordTodoGateResult(goal.id, todo.id, false, result.status);
      }
      recordImplementGoalRun(loadLaneState(), goal.id, gatePass);
    } else if (result.status === "finished") {
      gatePass = true;
    }

    const next = loadLaneState();
    next.last_implement_tick_at = new Date().toISOString();
    saveLaneState(next);

    return {
      skipped: false,
      agentId: target.agentId,
      implement_goal_id: goal.id,
      backlog_todo_id: todo.id,
      gate_pass: gatePass,
      status: result.status,
    };
  }

  const workflowRepo = resolveGoalImplementationRepo(target.handoff);
  const prevPrTitle = process.env.LI_REPO_WORKFLOW_PR_TITLE;
  const prevPrBody = process.env.LI_REPO_WORKFLOW_PR_BODY;
  if (workflowRepo) {
    process.env.LI_REPO_WORKFLOW_PR_TITLE = buildGoalPrTitle(target.handoff);
    process.env.LI_REPO_WORKFLOW_PR_BODY = buildGoalPrBody(target.handoff);
  }
  let result;
  try {
    result = await runAgent({
      agentId: target.agentId,
      cwd: benchmarksRoot ?? packageRoot,
      benchmarksRoot,
      mock: Boolean(mock),
      dryRun: Boolean(options?.dryRun),
      workflowRepo,
      extraInstruction: handoffInstruction(target.handoff),
    });
  } finally {
    if (workflowRepo) {
      if (prevPrTitle === undefined) delete process.env.LI_REPO_WORKFLOW_PR_TITLE;
      else process.env.LI_REPO_WORKFLOW_PR_TITLE = prevPrTitle;
      if (prevPrBody === undefined) delete process.env.LI_REPO_WORKFLOW_PR_BODY;
      else process.env.LI_REPO_WORKFLOW_PR_BODY = prevPrBody;
    }
  }

  if (result.status === "finished" && target.agentId === "code_implementer") {
    await updateHandoff(target.handoff.handoff_id, {
      status: "done",
      completed_at: new Date().toISOString(),
    });
  }

  const next = loadLaneState();
  next.last_implement_tick_at = new Date().toISOString();
  saveLaneState(next);

  return {
    skipped: false,
    agentId: target.agentId,
    handoff_id: target.handoff.handoff_id,
    status: result.status,
  };
}

export function implementLaneIntervalMs(): number {
  const n = Number(process.env.LI_IMPLEMENT_LANE_INTERVAL_MS ?? 120_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 120_000;
}

export async function runImplementLaneLoop(options?: {
  mock?: boolean;
  once?: boolean;
}): Promise<void> {
  const once = options?.once ?? process.env.LI_IMPLEMENT_LANE_ONCE === "1";
  do {
    const tick = await implementLaneTick({ mock: options?.mock });
    if (tick.skipped) {
      // eslint-disable-next-line no-console
      console.error(`implement-lane: ${tick.skip_reason}`);
    } else {
      const goalPart = tick.implement_goal_id
        ? ` goal=${tick.implement_goal_id} todo=${tick.backlog_todo_id} gate=${tick.gate_pass}`
        : ` handoff=${tick.handoff_id?.slice(0, 8)}`;
      // eslint-disable-next-line no-console
      console.error(
        `implement-lane: agent=${tick.agentId}${goalPart} status=${tick.status}`,
      );
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, implementLaneIntervalMs()));
  } while (true);
}
