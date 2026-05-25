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
