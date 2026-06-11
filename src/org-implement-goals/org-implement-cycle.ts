import { resolveCursorApiKey, resolveCursorEnvFileHint } from "../env.js";
import { updateHandoff } from "../handoffs/handoff-store.js";
import {
  buildGoalPrBody,
  buildGoalPrTitle,
  resolveGoalImplementationRepo,
} from "../handoffs/goal-workflow.js";
import { buildGoalScaffoldBlock } from "../handoffs/goal-scaffold-prompt.js";
import { buildPendingHandoffsBlock } from "../handoffs/prompt-blocks.js";
import type { AgentHandoff } from "../handoffs/types.js";
import {
  buildImplementGoalInstruction,
  loadImplementGoals,
  markBacklogTodoDone,
  recordTodoGateResult,
  runImplementGoalGates,
} from "../implement-goals/load-goals.js";
import { loadLaneState, recordImplementGoalRun, saveLaneState } from "../lanes/lane-state.js";
import { resolveBenchmarksRoot } from "../preflight.js";
import { agentsPackageRoot, runAgent, shouldUseMock } from "../runner.js";
import { workerConsole } from "../worker/worker-console.js";
import type { AgentId } from "../types.js";
import { parseImplementRef } from "./org-implement-supervisor-config.js";
import { readActiveState } from "./org-implement-coordination.js";

export interface OrgImplementCycleOptions {
  implementRef: string;
  workerId: string;
  mock?: boolean;
  dryRun?: boolean;
}

export interface OrgImplementCycleResult {
  ok: boolean;
  status: "completed" | "failed";
  agentId: AgentId;
  kind: "handoff" | "implement_goal";
  handoffId?: string;
  goalId?: string;
  todoId?: string;
  gatePass?: boolean;
  stub: boolean;
  error?: string;
  agentStatus?: string;
  durationMs?: number;
  outputTail?: string;
}

function outputTail(text: string | undefined, max = 1500): string | undefined {
  if (!text?.trim()) return undefined;
  return text.trim().slice(-max);
}

function handoffInstruction(h: AgentHandoff): string {
  const scaffold = buildGoalScaffoldBlock(h);
  return [
    "## Implement handoff",
    "",
    `handoff_id: \`${h.handoff_id}\``,
    `research_goal_id: ${h.research_goal_id ?? "—"}`,
    `north_star_fit: ${h.north_star_fit ?? "(missing)"}`,
    "",
    buildPendingHandoffsBlock("code_implementer", [h]),
    "",
    scaffold,
    "```json",
    JSON.stringify(h.work, null, 2),
    "```",
  ].join("\n");
}

/** Run one implement-goals lane unit (handoff or goal backlog todo). */
export async function runOrgImplementCycle(
  options: OrgImplementCycleOptions,
): Promise<OrgImplementCycleResult> {
  const parsed = parseImplementRef(options.implementRef);
  if (!parsed) {
    return {
      ok: false,
      status: "failed",
      agentId: "code_implementer",
      kind: "handoff",
      stub: false,
      error: `invalid implement ref: ${options.implementRef}`,
    };
  }

  const state = readActiveState();
  const entry = state.implement[options.implementRef];
  if (!entry || entry.workerId !== options.workerId) {
    return {
      ok: false,
      status: "failed",
      agentId: entry?.agentId ?? "code_implementer",
      kind: entry?.kind ?? (parsed.kind === "handoff" ? "handoff" : "implement_goal"),
      stub: false,
      error: `not claimed by worker ${options.workerId}`,
    };
  }

  const mock = options.mock ?? shouldUseMock(false);
  const dryRun = Boolean(options.dryRun);
  const benchmarksRoot = resolveBenchmarksRoot();
  const packageRoot = agentsPackageRoot();
  const started = Date.now();

  if (!resolveCursorApiKey() && !mock) {
    return {
      ok: false,
      status: "failed",
      agentId: entry.agentId,
      kind: entry.kind,
      stub: true,
      error: `missing CURSOR_API_KEY (${resolveCursorEnvFileHint()})`,
    };
  }

  if (parsed.kind === "handoff") {
    const { listHandoffs } = await import("../handoffs/handoff-store.js");
    const rows = await listHandoffs({ status: ["claimed", "pending"], limit: 50 });
    const handoff = rows.find((h) => h.handoff_id === parsed.handoffId);
    if (!handoff) {
      return {
        ok: false,
        status: "failed",
        agentId: entry.agentId,
        kind: "handoff",
        handoffId: parsed.handoffId,
        stub: false,
        error: "handoff not found",
      };
    }

    const workflowRepo = resolveGoalImplementationRepo(handoff);
    const prevPrTitle = process.env.LI_REPO_WORKFLOW_PR_TITLE;
    const prevPrBody = process.env.LI_REPO_WORKFLOW_PR_BODY;
    if (workflowRepo) {
      process.env.LI_REPO_WORKFLOW_PR_TITLE = buildGoalPrTitle(handoff);
      process.env.LI_REPO_WORKFLOW_PR_BODY = buildGoalPrBody(handoff);
    }

    let result;
    try {
      result = await runAgent({
        agentId: entry.agentId,
        cwd: benchmarksRoot ?? packageRoot,
        benchmarksRoot,
        mock,
        dryRun,
        workflowRepo,
        extraInstruction: handoffInstruction(handoff),
      });
    } finally {
      if (workflowRepo) {
        if (prevPrTitle === undefined) delete process.env.LI_REPO_WORKFLOW_PR_TITLE;
        else process.env.LI_REPO_WORKFLOW_PR_TITLE = prevPrTitle;
        if (prevPrBody === undefined) delete process.env.LI_REPO_WORKFLOW_PR_BODY;
        else process.env.LI_REPO_WORKFLOW_PR_BODY = prevPrBody;
      }
    }

    if (result.status === "finished" && entry.agentId === "code_implementer" && !dryRun) {
      await updateHandoff(parsed.handoffId, {
        status: "done",
        completed_at: new Date().toISOString(),
      });
    }

    const ok = result.status === "finished";
    return {
      ok,
      status: ok ? "completed" : "failed",
      agentId: entry.agentId,
      kind: "handoff",
      handoffId: parsed.handoffId,
      stub: false,
      agentStatus: result.status,
      durationMs: Date.now() - started,
      outputTail: outputTail(result.outputText ?? result.error),
      error: ok ? undefined : result.error ?? `agent status ${result.status}`,
    };
  }

  const goal = loadImplementGoals().find((g) => g.id === parsed.goalId);
  if (!goal) {
    return {
      ok: false,
      status: "failed",
      agentId: entry.agentId,
      kind: "implement_goal",
      goalId: parsed.goalId,
      todoId: parsed.todoId,
      stub: false,
      error: `goal not found: ${parsed.goalId}`,
    };
  }

  const todos = (await import("../implement-goals/backlog-io.js")).loadBacklogTodos(goal);
  const todo = todos.find((t) => t.id === parsed.todoId);
  if (!todo) {
    return {
      ok: false,
      status: "failed",
      agentId: entry.agentId,
      kind: "implement_goal",
      goalId: parsed.goalId,
      todoId: parsed.todoId,
      stub: false,
      error: `todo not found: ${parsed.todoId}`,
    };
  }

  const result = await runAgent({
    agentId: entry.agentId,
    cwd: benchmarksRoot ?? packageRoot,
    benchmarksRoot,
    mock,
    dryRun,
    workflowRepo: goal.workflow_repo,
    extraInstruction: buildImplementGoalInstruction(goal, todo),
  });

  let gatePass = false;
  if (result.status === "finished" && !dryRun) {
    const gates = runImplementGoalGates(goal);
    gatePass = gates.ok;
    recordTodoGateResult(goal.id, todo.id, gatePass, result.status);
    if (gatePass) markBacklogTodoDone(goal, todo.id);
    recordImplementGoalRun(loadLaneState(), goal.id, gatePass);
    const next = loadLaneState();
    next.last_implement_tick_at = new Date().toISOString();
    saveLaneState(next);
  } else if (result.status === "finished") {
    gatePass = true;
  }

  const ok = result.status === "finished" && gatePass;
  workerConsole(
    "org-implement-goals-worker",
    ok ? "info" : "warn",
    `goal=${goal.id} todo=${todo.id} gate=${gatePass} status=${result.status}`,
  );

  return {
    ok,
    status: ok ? "completed" : "failed",
    agentId: entry.agentId,
    kind: "implement_goal",
    goalId: goal.id,
    todoId: todo.id,
    gatePass,
    stub: false,
    agentStatus: result.status,
    durationMs: Date.now() - started,
    outputTail: outputTail(result.outputText ?? result.error),
    error: ok ? undefined : result.error ?? `agent status ${result.status}`,
  };
}
