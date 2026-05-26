import assert from "node:assert/strict";
import test from "node:test";
import {
  computeInSdkCount,
  countRegisteredRunningRuns,
  countRunningActiveRuns,
} from "./active-run-metrics.js";

test("countRunningActiveRuns ignores finished rows", () => {
  assert.equal(
    countRunningActiveRuns([
      { run_id: "a", agent_id: "orchestrator", pid: 1, started_at: "", status: "finished" },
      { run_id: "b", agent_id: "code_implementer", pid: 2, started_at: "", status: "running" },
    ]),
    1,
  );
});

test("computeInSdkCount uses slot files and in-process depth capped by sdk_max", () => {
  assert.equal(computeInSdkCount(3, 2, 5), 3);
  assert.equal(computeInSdkCount(0, 4, 5), 4);
  assert.equal(computeInSdkCount(8, 8, 5), 5);
  assert.equal(computeInSdkCount(0, 0, 5), 0);
});

test("countRegisteredRunningRuns counts heartbeat running tracks only", () => {
  assert.equal(
    countRegisteredRunningRuns([
      { run_id: "a", agent_id: "orchestrator", pid: 1, started_at: "", status: "running" },
      { run_id: "b", agent_id: "gap_explorer", pid: 2, started_at: "", status: "finished" },
    ]),
    1,
  );
});
