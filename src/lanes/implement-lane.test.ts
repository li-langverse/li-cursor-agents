import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as handoffStore from "../handoffs/handoff-store.js";
import { pickHandoffImplementTarget, pickImplementLaneTarget } from "./implement-lane.js";

test("pickHandoffImplementTarget returns null when queue empty", async () => {
  const list = mock.method(handoffStore, "listHandoffs", async () => []);
  const claim = mock.method(handoffStore, "claimNextHandoff", async () => null);
  try {
    const target = await pickHandoffImplementTarget();
    assert.equal(target, null);
    assert.equal(list.mock.callCount(), 2);
    assert.equal(claim.mock.callCount(), 1);
  } finally {
    list.mock.restore();
    claim.mock.restore();
  }
});

test("pickImplementLaneTarget falls back to implement goal when no handoff", async () => {
  const list = mock.method(handoffStore, "listHandoffs", async () => []);
  const claim = mock.method(handoffStore, "claimNextHandoff", async () => null);

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
  writeFileSync(
    join(lic, "scripts", "noop-gates.sh"),
    "#!/usr/bin/env bash\nexit 0\n",
    "utf8",
  );

  const prevGoals = process.env.LI_IMPLEMENT_GOALS_PATH;
  const prevLangverse = process.env.LI_LANGVERSE_ROOT;
  const prevLic = process.env.LIC_ROOT;
  process.env.LI_LANGVERSE_ROOT = root;
  process.env.LIC_ROOT = lic;
  process.env.LI_IMPLEMENT_GOALS_PATH = join(
    root,
    "implement-goals-test.yaml",
  );
  writeFileSync(
    process.env.LI_IMPLEMENT_GOALS_PATH,
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

  try {
    const target = await pickImplementLaneTarget();
    assert.ok(target);
    assert.equal(target!.kind, "implement_goal");
    if (target!.kind === "implement_goal") {
      assert.equal(target.agentId, "code_implementer");
      assert.equal(target.goal.id, "swarm_test");
      assert.equal(target.todo.id, "swarm-test-todo");
    }
  } finally {
    list.mock.restore();
    claim.mock.restore();
    if (prevGoals === undefined) delete process.env.LI_IMPLEMENT_GOALS_PATH;
    else process.env.LI_IMPLEMENT_GOALS_PATH = prevGoals;
    if (prevLangverse === undefined) delete process.env.LI_LANGVERSE_ROOT;
    else process.env.LI_LANGVERSE_ROOT = prevLangverse;
    if (prevLic === undefined) delete process.env.LIC_ROOT;
    else process.env.LIC_ROOT = prevLic;
  }
});
