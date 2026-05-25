import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import type { ImplementGoalState } from "./types.js";

function statePath(goalId: string): string {
  return join(agentsPackageRoot(), "data", "implement-goals", `${goalId}.json`);
}

export function loadImplementGoalState(goalId: string): ImplementGoalState {
  try {
    const raw = readFileSync(statePath(goalId), "utf8");
    const parsed = JSON.parse(raw) as ImplementGoalState;
    return { ...parsed, completed_ids: parsed.completed_ids ?? [] };
  } catch {
    return { completed_ids: [] };
  }
}

export function saveImplementGoalState(goalId: string, state: ImplementGoalState): void {
  const dir = join(agentsPackageRoot(), "data", "implement-goals");
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(goalId), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function recordTodoGateResult(
  goalId: string,
  todoId: string,
  gatePass: boolean,
  agentStatus?: string,
): ImplementGoalState {
  const prev = loadImplementGoalState(goalId);
  const completed = new Set(prev.completed_ids);
  if (gatePass) completed.add(todoId);
  const next: ImplementGoalState = {
    ...prev,
    completed_ids: [...completed],
    last_todo_id: todoId,
    last_gate_pass: gatePass,
    last_gate_at: new Date().toISOString(),
    last_agent_status: agentStatus,
  };
  saveImplementGoalState(goalId, next);
  return next;
}
