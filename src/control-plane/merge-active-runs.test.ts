import assert from "node:assert/strict";
import test from "node:test";
import { mergeActiveRunsForDisplay } from "./merge-active-runs.js";

test("mergeActiveRunsForDisplay adds DB running rows missing from heartbeat", () => {
  const merged = mergeActiveRunsForDisplay(
    [],
    [
      {
        run_id: "security_auditor-1",
        agent_id: "security_auditor",
        started_at: "2026-05-25T12:00:00.000Z",
        status: "running",
      },
    ],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.run_id, "security_auditor-1");
  assert.equal(merged[0]!.status, "running");
});
