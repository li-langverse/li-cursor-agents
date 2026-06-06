import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { agentsPackageRoot } from "../runner.js";
import { parseBacklogTodos } from "./backlog-io.js";

test("parseBacklogTodos reads fixture markdown", () => {
  const path = join(agentsPackageRoot(), "fixtures", "implement-goals", "sample-backlog.md");
  const todos = parseBacklogTodos(readFileSync(path, "utf8"), "markdown_todos");
  assert.equal(todos.length, 2);
  assert.equal(todos[0]?.id, "todo-alpha");
});

test("parseBacklogTodos normalizes CRLF markdown", () => {
  const crlf = "- id: a\r\n  content: \"one\"\r\n  status: pending\r\n";
  const todos = parseBacklogTodos(crlf, "markdown_todos");
  assert.equal(todos.length, 1);
  assert.equal(todos[0]?.id, "a");
});
