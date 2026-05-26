import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanBacklogTodos } from "./plan-backlog-work.js";

test("parsePlanBacklogTodos reads markdown todos", () => {
  const md = `
todos:

- id: orch-r1-plan-debt-sync
  content: "Map plan_pending"
  status: pending
`;
  const todos = parsePlanBacklogTodos(md);
  assert.equal(todos.length, 1);
  assert.equal(todos[0]!.id, "orch-r1-plan-debt-sync");
  assert.equal(todos[0]!.status, "pending");
});
