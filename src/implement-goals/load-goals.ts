import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import type { AgentId } from "../types.js";
import type { BacklogTodo, ImplementBacklogFormat, ImplementGoal } from "./types.js";
import { loadImplementGoalState } from "./goal-state.js";
import { implementGoalRepoExists } from "./lic-root.js";
import { loadBacklogTodos, pickNextBacklogTodo } from "./backlog-io.js";

export type { ImplementGoal, ImplementBacklogFormat, BacklogTodo, ImplementGoalState } from "./types.js";
export { buildImplementGoalInstruction, buildImplementGoalMarkdown } from "./build-goal.js";
export { markBacklogTodoDone } from "./backlog.js";
export { runImplementGoalGates } from "./gates.js";
export type { GateRunResult } from "./gates.js";
export { loadImplementGoalState, recordTodoGateResult, saveImplementGoalState } from "./goal-state.js";
export { loadBacklogTodos, pickNextBacklogTodo, parseBacklogTodos } from "./backlog-io.js";
export {
  resolveGoalLicRoot,
  resolveImplementGoalLicRoot,
  resolveLangverseRoot,
  resolveImplementGoalGatesPath,
  resolveImplementGoalBacklogPath,
  implementGoalRepoExists,
} from "./lic-root.js";

export function loadImplementGoals(): ImplementGoal[] {
  const path =
    process.env.LI_IMPLEMENT_GOALS_PATH?.trim() ||
    join(agentsPackageRoot(), "config", "implement-goals.yaml");
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const goals: ImplementGoal[] = [];
  let current: Partial<ImplementGoal> | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- id:")) {
      if (current?.id) goals.push(current as ImplementGoal);
      current = { id: trimmed.slice("- id:".length).trim(), enabled: true };
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith("title:")) current.title = trimmed.slice(6).trim();
    else if (trimmed.startsWith("agent:")) current.agent = trimmed.slice(6).trim() as AgentId;
    else if (trimmed.startsWith("workflow_repo:"))
      current.workflow_repo = trimmed.slice(14).trim();
    else if (trimmed.startsWith("lic_root:")) current.lic_root = trimmed.slice(9).trim();
    else if (trimmed.startsWith("repo_subpath:"))
      current.repo_subpath = trimmed.slice(13).trim();
    else if (trimmed.startsWith("backlog_path:")) current.backlog_path = trimmed.slice(13).trim();
    else if (trimmed.startsWith("backlog_format:"))
      current.backlog_format = trimmed.slice(15).trim() as ImplementBacklogFormat;
    else if (trimmed.startsWith("gates_script:")) current.gates_script = trimmed.slice(13).trim();
    else if (trimmed.startsWith("branch:")) current.branch = trimmed.slice(7).trim();
    else if (trimmed.startsWith("priority:")) current.priority = Number(trimmed.slice(9).trim());
    else if (trimmed.startsWith("cadence_hours:"))
      current.cadence_hours = Number(trimmed.slice(14).trim());
    else if (trimmed.startsWith("gate_fail_retry_minutes:"))
      current.gate_fail_retry_minutes = Number(trimmed.slice(25).trim());
    else if (trimmed.startsWith("enabled:")) current.enabled = trimmed.includes("true");
  }
  if (current?.id) goals.push(current as ImplementGoal);
  return goals.filter(
    (g) =>
      g.enabled !== false &&
      g.agent &&
      g.workflow_repo &&
      g.backlog_path &&
      g.gates_script &&
      g.branch,
  );
}

function eligibleImplementGoals(
  goals: ImplementGoal[],
  goalLastRunAt: Record<string, string>,
  goalLastGatePass: Record<string, boolean>,
  now: number,
): ImplementGoal[] {
  return goals
    .filter((g) => {
      const cadenceH = g.cadence_hours ?? 24;
      const last = goalLastRunAt[g.id];
      if (!last) return true;
      const elapsed = now - new Date(last).getTime();
      if (elapsed >= cadenceH * 3_600_000) return true;
      if (goalLastGatePass[g.id] === false) {
        const retryMin = g.gate_fail_retry_minutes ?? 30;
        return elapsed >= retryMin * 60_000;
      }
      return false;
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function pickNextImplementGoal(
  goals: ImplementGoal[],
  goalLastRunAt: Record<string, string>,
  goalLastGatePass: Record<string, boolean> = {},
  now = Date.now(),
): ImplementGoal | null {
  return eligibleImplementGoals(goals, goalLastRunAt, goalLastGatePass, now)[0] ?? null;
}

/** Next implement goal for a specific agent (parallel workers — research-style cadence). */
export function pickNextImplementGoalForAgent(
  agentId: AgentId,
  goals: ImplementGoal[],
  goalLastRunAt: Record<string, string>,
  goalLastGatePass: Record<string, boolean> = {},
  now = Date.now(),
): ImplementGoal | null {
  return (
    eligibleImplementGoals(
      goals.filter((g) => g.agent === agentId),
      goalLastRunAt,
      goalLastGatePass,
      now,
    )[0] ?? null
  );
}

export function northStarFitForImplementGoal(goal: ImplementGoal): string {
  const root = goal.lic_root ?? goal.repo_subpath ?? "lic";
  return `${goal.title} — backlog ${goal.backlog_path} (${root}) on ${goal.branch}`;
}

/** Goal + backlog todo when handoff queue is empty (implement lane). */
export function pickNextImplementWorkForAgent(
  agentId: AgentId,
  goals: ImplementGoal[],
  goalLastRunAt: Record<string, string>,
  goalLastGatePass: Record<string, boolean> = {},
  now = Date.now(),
): { goal: ImplementGoal; todo: BacklogTodo } | null {
  for (const goal of eligibleImplementGoals(
    goals.filter((g) => g.agent === agentId),
    goalLastRunAt,
    goalLastGatePass,
    now,
  )) {
    if (!implementGoalRepoExists(goal)) continue;
    const state = loadImplementGoalState(goal.id);
    const todos = loadBacklogTodos(goal);
    const todo = pickNextBacklogTodo(todos, {
      completedIds: new Set(state.completed_ids),
    });
    if (todo) return { goal, todo };
  }
  return null;
}
