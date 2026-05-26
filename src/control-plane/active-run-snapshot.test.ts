import assert from "node:assert/strict";
import test from "node:test";
import type { ActiveAgentRun } from "./types.js";
import { compactActiveRunForStatus } from "./active-run-snapshot.js";

test("compactActiveRunForStatus trims hot heartbeat/API payloads", () => {
  const huge = "x".repeat(10_000);
  const run: ActiveAgentRun = {
    run_id: "goal_researcher-1",
    agent_id: "goal_researcher",
    pid: 123,
    started_at: "2026-05-26T10:00:00.000Z",
    status: "running",
    reason: "research",
    run_input: {
      version: 1,
      agent_id: "goal_researcher",
      backend: "cursor-sdk",
      cwd: "/repo",
      dry_run: false,
      mock: false,
      system_prompt: huge,
      user_message: huge,
      extra_instruction: huge,
      research_goal_id: "g1",
      research_vertical: "hpc",
    },
    run_trace: {
      version: 1,
      assistant_text: huge,
      thinking_text: huge,
      steps: Array.from({ length: 20 }, (_, i) => ({
        type: "toolCall",
        message: {
          type: "read",
          args: { path: `/tmp/${i}`, command: huge },
          result: { status: "success", value: { content: huge } },
        },
      })) as never,
      deltas: Array.from({ length: 50 }, (_, i) => ({
        seq: i,
        at: "2026-05-26T10:00:00.000Z",
        kind: "delta",
        type: "text-delta",
        payload: { text: huge },
      })),
      file_edits: [],
      tool_call_count: 20,
    },
  };

  const compact = compactActiveRunForStatus(run);
  assert.equal(compact.run_input?.research_goal_id, "g1");
  assert.match(compact.run_input?.user_message ?? "", /truncated/);
  assert.equal(compact.run_trace?.steps.length, 8);
  assert.equal(compact.run_trace?.deltas.length, 20);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(run).length / 5);
});
