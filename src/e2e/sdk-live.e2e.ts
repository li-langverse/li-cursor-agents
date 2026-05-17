/**
 * Live Cursor SDK E2E — requires API key. Not run in default CI.
 *
 *   cp .env.example .env   # set CURSOR_API_KEY
 *   npm run test:e2e:sdk
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDotEnv, resolveCursorApiKey } from "../env.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";

const RUN_SDK = process.env.LI_E2E_SDK === "1" || process.env.LI_E2E_SDK === "true";
const key = (() => {
  loadDotEnv();
  return resolveCursorApiKey();
})();

test("live SDK: single agent run completes", { skip: !RUN_SDK || !key }, async () => {
  const result = await runAgent({
    agentId: "orchestrator",
    cwd: agentsPackageRoot(),
    mock: false,
    dryRun: false,
    extraInstruction:
      "Reply with a one-line executive summary only. Do not open PRs or merge.",
  });
  assert.equal(result.backend, "cursor-sdk");
  assert.equal(result.status, "finished");
  assert.ok(result.outputText && result.outputText.length > 10);
});

test("live SDK: supervisor handoff with real backend", { skip: !RUN_SDK || !key }, async () => {
  const { setupE2eEnv, defaultTickOpts, readReport } = await import("./helpers.js");
  const { supervisorTick } = await import("../supervisor/loop.js");
  const env = setupE2eEnv("v1");
  try {
    const tick = await supervisorTick({
      ...defaultTickOpts(env.benchmarksRoot),
      mock: false,
      maxTasksPerTick: 1,
    });
    assert.equal(tick.tasksExecuted, 1);
    const report = readReport(env.controlPlaneDir);
    const runs = report.recent_runs as Array<{ backend: string }>;
    assert.equal(runs[0]?.backend, "cursor-sdk");
  } finally {
    env.restoreEnv();
  }
});
