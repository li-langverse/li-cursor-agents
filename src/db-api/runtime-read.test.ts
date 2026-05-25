import assert from "node:assert/strict";
import test from "node:test";
import { runtimeSnapshotFromDb } from "./runtime-read.js";

test("runtimeSnapshotFromDb active_run_count reflects running rows and sdk slots", () => {
  const snap = runtimeSnapshotFromDb(
    {
      version: 1,
      updated_at: "",
      last_briefing_hash: "",
      last_preflight_at: "",
      last_tick_at: "",
      supervisor_status: "idle",
      stopped_agents: [],
      recent_tasks: [],
      runs_total: 0,
    },
    {
      supervisor_loop_running: false,
      async_swarm_running: true,
      research_lane_running: false,
      implement_lane_running: false,
      maintenance_lane_running: false,
      agent_backend: "mock",
      sdk_ready: true,
      sdk_max_concurrent: 2,
      sdk_sessions_active: 1,
      active_runs: [
        {
          run_id: "done",
          agent_id: "orchestrator",
          pid: 1,
          started_at: new Date().toISOString(),
          status: "finished",
        },
        {
          run_id: "live",
          agent_id: "code_implementer",
          pid: 2,
          started_at: new Date().toISOString(),
          status: "running",
        },
      ],
      handoff_run: null,
      last_tick_at: null,
      updated_at: new Date(0).toISOString(),
    },
  );
  assert.equal(snap.active_run_count, 1);
  assert.equal(typeof snap.sdk_slots_in_use, "number");
  assert.equal(typeof snap.workers_paused, "boolean");
  assert.equal(snap.sdk_max_concurrent, 2);
});
