import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { pickNextImplementWorkForAgent, loadImplementGoals } from "../implement-goals/load-goals.js";

test("pickNextImplementWorkForAgent returns goal and todo from temp backlog", () => {
  const root = mkdtempSync(join(tmpdir(), "implement-lane-"));
  const lic = join(root, "lic");
  const backlogDir = join(lic, "docs", "ecosystem");
  mkdirSync(backlogDir, { recursive: true });
  mkdirSync(join(lic, "scripts"), { recursive: true });
  writeFileSync(
    join(backlogDir, "swarm-test-backlog.md"),
    [
      "todos:",
      "- id: swarm-test-todo",
      '  content: "unit test slice"',
      "  status: pending",
      "",
      "---",
    ].join("\n"),
    "utf8",
  );
  const gates = join(lic, "scripts", "noop-gates.sh");
  writeFileSync(gates, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  chmodSync(gates, 0o755);

  const goalsPath = join(root, "implement-goals-test.yaml");
  writeFileSync(
    goalsPath,
    [
      "goals:",
      "  - id: swarm_test",
      "    title: Swarm test goal",
      "    agent: code_implementer",
      "    workflow_repo: lic",
      "    backlog_path: docs/ecosystem/swarm-test-backlog.md",
      "    backlog_format: markdown_todos",
      "    gates_script: scripts/noop-gates.sh",
      "    branch: cursor/swarm-test",
      "    priority: 99",
      "    cadence_hours: 0",
      "    enabled: true",
    ].join("\n"),
    "utf8",
  );

  const prevGoals = process.env.LI_IMPLEMENT_GOALS_PATH;
  const prevLangverse = process.env.LI_LANGVERSE_ROOT;
  const prevLic = process.env.LIC_ROOT;
  process.env.LI_IMPLEMENT_GOALS_PATH = goalsPath;
  process.env.LI_LANGVERSE_ROOT = root;
  process.env.LIC_ROOT = lic;

  try {
    const goals = loadImplementGoals();
    const picked = pickNextImplementWorkForAgent("code_implementer", goals, {}, {});
    assert.ok(picked);
    assert.equal(picked!.goal.id, "swarm_test");
    assert.equal(picked!.todo.id, "swarm-test-todo");
  } finally {
    if (prevGoals === undefined) delete process.env.LI_IMPLEMENT_GOALS_PATH;
    else process.env.LI_IMPLEMENT_GOALS_PATH = prevGoals;
    if (prevLangverse === undefined) delete process.env.LI_LANGVERSE_ROOT;
    else process.env.LI_LANGVERSE_ROOT = prevLangverse;
    if (prevLic === undefined) delete process.env.LIC_ROOT;
    else process.env.LIC_ROOT = prevLic;
  }
});
