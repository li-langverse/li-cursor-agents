import assert from "node:assert/strict";
import test from "node:test";
import { dedupeRunCatalogForDisplay, summarizeRunErrors } from "./run-errors-summary.js";

test("summarizeRunErrors groups by error message", () => {
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
      error: "sdk-session.lock: timeout",
    },
  ]);
  assert.equal(summary.total_errors, 3);
  assert.equal(summary.unique_categories, 2);
  assert.equal(summary.categories[0]!.error_key, "stale_running_reconciled");
  assert.equal(summary.categories[0]!.count, 2);
});

test("dedupeRunCatalogForDisplay keeps one stale_running_reconciled per agent", () => {
  const deduped = dedupeRunCatalogForDisplay([
    {
      run_id: "old",
      agent_id: "gap_explorer",
      status: "error",
      error: "stale_running_reconciled",
      started_at: "2026-05-25T10:00:00.000Z",
    },
    {
      run_id: "new",
      agent_id: "gap_explorer",
      status: "error",
      error: "stale_running_reconciled",
      started_at: "2026-05-25T12:00:00.000Z",
    },
    {
      run_id: "other",
      agent_id: "security_auditor",
      status: "finished",
      started_at: "2026-05-25T11:00:00.000Z",
    },
  ]);
  assert.equal(deduped.length, 2);
  assert.ok(deduped.some((r) => r.run_id === "new"));
  assert.ok(deduped.some((r) => r.run_id === "other"));
});
