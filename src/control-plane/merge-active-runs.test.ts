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

test("mergeActiveRunsForDisplay overlays DB trace onto heartbeat row", () => {
  const merged = mergeActiveRunsForDisplay(
    [
      {
        run_id: "gap_explorer-1",
        agent_id: "gap_explorer",
        pid: 99,
        started_at: "2026-05-25T12:00:00.000Z",
        status: "running",
        reason: "runAgent",
      },
    ],
    [
      {
        run_id: "gap_explorer-1",
        agent_id: "gap_explorer",
        started_at: "2026-05-25T12:00:00.000Z",
        status: "running",
        run_trace: {
          version: 1,
          tool_call_count: 2,
          assistant_text: "",
          thinking_text: "",
          deltas: [],
          steps: [],
          file_edits: [],
        },
      },
    ],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.run_trace?.tool_call_count, 2);
  assert.equal(merged[0]!.pid, 99);
});
