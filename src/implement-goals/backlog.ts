import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ImplementGoal } from "./types.js";
import { resolveImplementGoalLicRoot } from "./lic-root.js";

export { parseBacklogTodos, loadBacklogTodos, pickNextBacklogTodo } from "./backlog-io.js";

export function markBacklogTodoDone(goal: ImplementGoal, todoId: string): boolean {
  const licRoot = resolveImplementGoalLicRoot(goal);
  if (!licRoot) return false;
  const path = join(licRoot, goal.backlog_path);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const pattern = new RegExp(
    `(- id:\\s*${todoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n\\s+content:[^\\n]*\\n\\s+status:)\\s*\\w+`,
    "m",
  );
  if (!pattern.test(text)) return false;
  const next = text.replace(pattern, "$1 completed");
  writeFileSync(path, next, "utf8");
  return true;
}
