import assert from "node:assert/strict";
import test from "node:test";
import { computeInSdkCount, countRunningActiveRuns } from "./active-run-metrics.js";

test("countRunningActiveRuns ignores finished rows", () => {
  assert.equal(
    countRunningActiveRuns([
      { run_id: "a", agent_id: "orchestrator", pid: 1, started_at: "", status: "finished" },
      { run_id: "b", agent_id: "code_implementer", pid: 2, started_at: "", status: "running" },
    ]),
    1,
  );
});

test("computeInSdkCount uses max of running runs and sdk_sessions_active", () => {
  assert.equal(
    computeInSdkCount(
      [{ run_id: "a", agent_id: "orchestrator", pid: 1, started_at: "", status: "running" }],
      2,
    ),
    2,
  );
  assert.equal(computeInSdkCount([], 0), 0);
});
