import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRunErrors } from "./run-errors-summary.js";

test("summarizeRunErrors groups by category and agent with example run ids", () => {
  const summary = summarizeRunErrors([
    {
      run_id: "a-1",
      agent_id: "gap_explorer",
      started_at: "2026-05-25T10:00:00.000Z",
      finished_at: "2026-05-25T10:05:00.000Z",
      status: "error",
      error: "stale_running_reconciled",
    },
    {
      run_id: "a-2",
      agent_id: "gap_explorer",
      started_at: "2026-05-25T10:10:00.000Z",
      finished_at: "2026-05-25T10:15:00.000Z",
      status: "error",
      error: "stale_running_reconciled",
    },
    {
      run_id: "b-1",
      agent_id: "security_auditor",
      started_at: "2026-05-25T11:00:00.000Z",
      finished_at: "2026-05-25T11:05:00.000Z",
      status: "error",
      error: "stale_running_reconciled",
    },
    {
      run_id: "c-1",
      agent_id: "gap_explorer",
      started_at: "2026-05-25T12:00:00.000Z",
      finished_at: "2026-05-25T12:01:00.000Z",
      status: "error",
      error: "sdk-session.lock: timeout waiting",
    },
  ]);

  assert.equal(summary.total_errors, 4);
  assert.equal(summary.stale_reconcile_count, 3);
  assert.equal(summary.real_error_count, 1);
  assert.equal(summary.unique_categories, 2);

  const stale = summary.categories.find((c) => c.category === "stale_running_reconciled");
  assert.ok(stale);
  assert.equal(stale!.count, 3);
  assert.equal(stale!.by_agent.length, 2);
  const gap = stale!.by_agent.find((a) => a.agent_id === "gap_explorer");
  assert.ok(gap);
  assert.equal(gap!.count, 2);
  assert.deepEqual(gap!.example_run_ids, ["a-1", "a-2"]);
});
