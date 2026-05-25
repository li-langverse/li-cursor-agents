import { join } from "node:path";
import type { BacklogTodo, ImplementGoal } from "./types.js";
import { buildImplementGoalMarkdown } from "./backlog-io.js";
import { resolveImplementGoalLicRoot } from "./lic-root.js";

export { buildImplementGoalMarkdown } from "./backlog-io.js";

export function resolveImplementGoalGatesPath(goal: ImplementGoal): string {
  const root = resolveImplementGoalLicRoot(goal);
  return root ? join(root, goal.gates_script) : goal.gates_script;
}

export function buildImplementGoalInstruction(goal: ImplementGoal, todo: BacklogTodo): string {
  return buildImplementGoalMarkdown(goal, todo, resolveImplementGoalGatesPath(goal));
}
