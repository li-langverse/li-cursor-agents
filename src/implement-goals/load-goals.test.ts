import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import {
  loadImplementGoals,
  pickNextImplementGoal,
  pickNextImplementGoalForAgent,
  pickNextImplementWorkForAgent,
} from "./load-goals.js";
import { parseBacklogTodos, pickNextBacklogTodo } from "./backlog-io.js";

test("loadImplementGoals reads committed yaml", () => {
  const goals = loadImplementGoals();
  assert.ok(goals.length >= 4);
  const httpd = goals.find((g) => g.id === "httpd_parity");
  assert.ok(httpd);
  assert.equal(httpd?.agent, "code_implementer");
  assert.equal(httpd?.gates_script, "scripts/httpd-plan-gates.sh");
  const studio = goals.find((g) => g.id === "studio_ui_ux");
  assert.equal(studio?.lic_root, "lic-studio-ui");
});

test("pickNextImplementWorkForAgent returns null when repos missing", () => {
  const goals = loadImplementGoals();
  const picked = pickNextImplementWorkForAgent(
    "code_implementer",
    goals.map((g) => ({ ...g, repo_subpath: "__missing__", lic_root: "__missing__" })),
    {},
    {},
  );
  assert.equal(picked, null);
});

test("pickNextImplementGoal respects cadence", () => {
  const goals = loadImplementGoals();
  const now = Date.now();
  const picked = pickNextImplementGoal(
    goals,
    { httpd_parity: new Date(now).toISOString() },
    {},
    now,
  );
  assert.ok(picked);
  assert.notEqual(picked?.id, "httpd_parity");
});

test("pickNextImplementGoalForAgent scopes goals to one agent", () => {
  const goals = loadImplementGoals();
  const now = Date.now();
  const implementer = pickNextImplementGoalForAgent(
    "code_implementer",
    goals,
    { httpd_parity: new Date(now).toISOString(), sim_algorithms: new Date(now).toISOString() },
    {},
    now,
  );
  const ux = pickNextImplementGoalForAgent("gui_ux_tester", goals, {}, {}, now);
  assert.ok(implementer);
  assert.equal(implementer?.agent, "code_implementer");
  assert.equal(ux?.id, "studio_ui_ux");
});

test("pickNextBacklogTodo skips completed ids", () => {
  const todos = parseBacklogTodos(
    "todos:\n- id: a\n  content: one\n  status: pending\n- id: b\n  content: two\n  status: pending\n",
  );
  const next = pickNextBacklogTodo(todos, { completedIds: new Set(["a"]) });
  assert.equal(next?.id, "b");
});

test("parseBacklogTodos reads fixture markdown", async () => {
  const { readFileSync } = await import("node:fs");
  const path = join(agentsPackageRoot(), "fixtures", "implement-goals", "sample-backlog.md");
  const todos = parseBacklogTodos(readFileSync(path, "utf8"), "markdown_todos");
  assert.equal(todos.length, 2);
  assert.equal(todos[0]?.id, "todo-alpha");
});
