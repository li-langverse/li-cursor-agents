import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { listActiveRuns } from "./control-plane/runtime.js";
import { runAgent, shouldUseMock } from "./runner.js";

test("shouldUseMock when CURSOR_MOCK=1", () => {
  const prev = process.env.CURSOR_MOCK;
  process.env.CURSOR_MOCK = "1";
  assert.equal(shouldUseMock(false), true);
  process.env.CURSOR_MOCK = prev;
});

test("shouldUseMock is false by default outside CI", () => {
  const prevMock = process.env.CURSOR_MOCK;
  const prevCi = process.env.CI;
  delete process.env.CURSOR_MOCK;
  delete process.env.CI;
  assert.equal(shouldUseMock(false), false);
  if (prevMock === undefined) delete process.env.CURSOR_MOCK;
  else process.env.CURSOR_MOCK = prevMock;
  if (prevCi === undefined) delete process.env.CI;
  else process.env.CI = prevCi;
});

test("runAgent registers active run during mock execution", async () => {
  const prevDelay = process.env.LI_MOCK_RUN_DELAY_MS;
  process.env.LI_MOCK_RUN_DELAY_MS = "200";
  const cwd = process.cwd();
  const benchmarksRoot = process.env.BENCHMARKS_ROOT;
  let sawRunning = false;
  const runPromise = runAgent({
    agentId: "orchestrator",
    cwd,
    benchmarksRoot,
    mock: true,
    dryRun: false,
  });
  for (let i = 0; i < 20; i++) {
    if (listActiveRuns().some((r) => r.status === "running")) {
      sawRunning = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  await runPromise;
  if (prevDelay === undefined) delete process.env.LI_MOCK_RUN_DELAY_MS;
  else process.env.LI_MOCK_RUN_DELAY_MS = prevDelay;
  assert.ok(sawRunning, "runAgent should appear in active runs while executing");
});

test("mock agent run produces output file", async () => {
  const cwd = process.cwd();
  const benchmarksRoot = process.env.BENCHMARKS_ROOT;
  const result = await runAgent({
    agentId: "orchestrator",
    cwd,
    benchmarksRoot,
    mock: true,
    dryRun: false,
  });
  assert.equal(result.backend, "mock");
  assert.equal(result.status, "finished");
  assert.ok(result.outputPath.endsWith(".md"));
});
