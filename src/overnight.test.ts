import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runAgent, shouldUseMock, agentsPackageRoot } from "./runner.js";
import { loadHistory, saveHistory, createCycle, recordRun, pruneHistory } from "./history.js";
import { decideAgents } from "./adaptive-scheduler.js";
import { generateDigest, writeDigest } from "./digest.js";
import { AGENT_REGISTRY } from "./agents/registry.js";

const root = agentsPackageRoot();

test("all registered agents run successfully in mock mode", async () => {
  for (const agentDef of AGENT_REGISTRY) {
    const result = await runAgent({
      agentId: agentDef.id,
      cwd: root,
      mock: true,
      dryRun: false,
    });
    assert.equal(result.backend, "mock", `${agentDef.id} should use mock backend`);
    assert.equal(result.status, "finished", `${agentDef.id} should finish successfully`);
    assert.ok(result.outputPath.endsWith(".md"), `${agentDef.id} should produce .md output`);
    assert.ok(result.outputText && result.outputText.length > 0, `${agentDef.id} should have output text`);
  }
});

test("full adaptive cycle completes end-to-end", async () => {
  const testHistoryDir = join(root, "data", "test-cycle");
  if (existsSync(testHistoryDir)) rmSync(testHistoryDir, { recursive: true });

  const history = loadHistory(join(root, "data", "test-cycle-nonexistent"));
  const cycle = createCycle(history);
  const schedule = decideAgents(history, { maxAgents: 5 });

  assert.ok(schedule.agents.length >= 3, "should schedule at least 3 agents");
  assert.ok(schedule.agents.includes("orchestrator"), "should include orchestrator");

  for (const agentId of schedule.agents) {
    const result = await runAgent({
      agentId,
      cwd: root,
      mock: true,
      dryRun: false,
    });
    recordRun(cycle, result);
  }

  cycle.completedAt = new Date().toISOString();
  cycle.nextPriorities = ["ecosystem_explorer"];

  assert.equal(cycle.results.length, schedule.agents.length);
  assert.ok(cycle.results.every((r) => r.status === "finished"), "all agents should finish");

  const digest = generateDigest({ root, cycle });
  assert.ok(digest.includes("Overnight Cycle Digest"));
  assert.ok(digest.includes("Results Summary"));
  assert.ok(digest.includes("orchestrator"));
});

test("scheduler rotates agents across cycles", async () => {
  const history = loadHistory(join(root, "data", "test-rotation-nonexistent"));

  const cycle1 = createCycle(history);
  for (const id of ["orchestrator", "ecosystem_explorer", "pr_review"] as const) {
    recordRun(cycle1, {
      agentId: id, backend: "mock", status: "finished",
      durationMs: 1, outputPath: "/tmp/x.md",
      outputText: "- **finding1**: test\n- **finding2**: test",
    });
  }
  cycle1.completedAt = new Date().toISOString();

  const schedule2 = decideAgents(history, { maxAgents: 5 });
  const ranInCycle1 = ["orchestrator", "ecosystem_explorer", "pr_review"];
  const newAgents = schedule2.agents.filter((a) => !ranInCycle1.includes(a));
  assert.ok(newAgents.length >= 2, `should pick new agents, got: ${schedule2.agents.join(", ")}`);
});

test("error recording and retry priority", async () => {
  const history = loadHistory(join(root, "data", "test-error-nonexistent"));
  const cycle = createCycle(history);

  recordRun(cycle, {
    agentId: "pr_review", backend: "mock", status: "error",
    durationMs: 100, outputPath: "", error: "test error",
  });
  recordRun(cycle, {
    agentId: "orchestrator", backend: "mock", status: "finished",
    durationMs: 50, outputPath: "/tmp/x.md",
  });
  cycle.completedAt = new Date().toISOString();

  const errored = cycle.results.filter((r) => r.status === "error");
  assert.equal(errored.length, 1);
  assert.equal(errored[0].agentId, "pr_review");

  const digest = generateDigest({ root, cycle });
  assert.ok(digest.includes("error"), "digest should mention errors");
});
