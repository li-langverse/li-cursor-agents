import assert from "node:assert/strict";
import test from "node:test";
import { enrichActiveRunsWithRecentEvents } from "./enrich-active-runs.js";
import type { ActiveAgentRun } from "./types.js";

test("enrichActiveRunsWithRecentEvents no-ops when run events persist is off", async () => {
  const prev = process.env.LI_RUN_EVENTS_DB;
  process.env.LI_RUN_EVENTS_DB = "0";
  const runs: ActiveAgentRun[] = [
    {
      run_id: "a-1",
      agent_id: "bench_improver",
      pid: 1,
      started_at: new Date().toISOString(),
      status: "running",
    },
  ];
  const out = await enrichActiveRunsWithRecentEvents(runs);
  assert.deepEqual(out, runs);
  if (prev === undefined) delete process.env.LI_RUN_EVENTS_DB;
  else process.env.LI_RUN_EVENTS_DB = prev;
});

test("enrichActiveRunsWithRecentEvents adds last_event from run_trace when events empty", async () => {
  const prev = process.env.LI_RUN_EVENTS_DB;
  process.env.LI_RUN_EVENTS_DB = "0";
  const runs: ActiveAgentRun[] = [
    {
      run_id: "bench_improver-1",
      agent_id: "bench_improver",
      pid: 1,
      started_at: new Date().toISOString(),
      status: "running",
      run_trace: {
        version: 1,
        tool_call_count: 1,
        assistant_text: "done",
        thinking_text: "planning bench pass",
        deltas: [],
        steps: [
          {
            type: "toolCall",
            message: { type: "read", args: { path: "benchmarks/foo.md" } },
          },
        ],
        file_edits: [],
      },
    },
  ];
  const out = await enrichActiveRunsWithRecentEvents(runs);
  assert.ok(out[0]!.last_event?.message);
  assert.match(String(out[0]!.last_event?.message), /benchmarks\/foo|read/i);
  if (prev === undefined) delete process.env.LI_RUN_EVENTS_DB;
  else process.env.LI_RUN_EVENTS_DB = prev;
});
