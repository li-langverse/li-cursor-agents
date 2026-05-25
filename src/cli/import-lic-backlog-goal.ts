#!/usr/bin/env node
/**
 * Emit goal markdown for run-agent from a lic backlog todo.
 *
 * Usage:
 *   npm run build
 *   node dist/cli/import-lic-backlog-goal.js --goal-id sim_algorithms [--todo-id sim-p1-num-dot-axpy] [--out goal.md]
 */
import { writeFileSync } from "node:fs";
import {
  buildImplementGoalMarkdown,
  loadImplementGoals,
} from "../implement-goals/load-goals.js";
import { loadBacklogTodos, pickNextBacklogTodo } from "../implement-goals/backlog-io.js";
import { loadImplementGoalState } from "../implement-goals/goal-state.js";
import { join } from "node:path";
import { resolveImplementGoalLicRoot } from "../implement-goals/lic-root.js";

function main(): void {
  const argv = process.argv.slice(2);
  let goalId = "";
  let todoId = "";
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--goal-id") goalId = argv[++i] ?? "";
    else if (a === "--todo-id") todoId = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
  }
  if (!goalId) {
    console.error("import-lic-backlog-goal: --goal-id required");
    process.exit(1);
  }

  const goal = loadImplementGoals().find((g) => g.id === goalId);
  if (!goal) {
    console.error(`unknown implement goal: ${goalId}`);
    process.exit(1);
  }

  const state = loadImplementGoalState(goalId);
  const todos = loadBacklogTodos(goal);
  const todo = pickNextBacklogTodo(todos, {
    todoId: todoId || undefined,
    completedIds: new Set(state.completed_ids),
  });
  if (!todo) {
    console.error(`no open todo for goal ${goalId}`);
    process.exit(1);
  }

  const root = resolveImplementGoalLicRoot(goal);
  const gatesPath = root ? join(root, goal.gates_script) : goal.gates_script;
  const md = buildImplementGoalMarkdown(goal, todo, gatesPath);
  if (out) {
    writeFileSync(out, md, "utf8");
    console.error(`wrote ${out}`);
  } else {
    process.stdout.write(md);
  }
}

main();
