import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { runAgent, shouldUseMock } from "./runner.js";

test("shouldUseMock when CURSOR_MOCK=1", () => {
  const prev = process.env.CURSOR_MOCK;
  process.env.CURSOR_MOCK = "1";
  assert.equal(shouldUseMock(false), true);
  process.env.CURSOR_MOCK = prev;
});

test("mock agent run produces output file", async () => {
  const cwd = process.cwd();
  const result = await runAgent({
    agentId: "orchestrator",
    cwd,
    mock: true,
    dryRun: false,
  });
  assert.equal(result.backend, "mock");
  assert.equal(result.status, "finished");
  assert.ok(result.outputPath.endsWith(".md"));
});
