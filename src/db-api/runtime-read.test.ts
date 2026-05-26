import assert from "node:assert/strict";
import test from "node:test";
import { runtimeSnapshotFromDb, runtimeStoreFields } from "./runtime-read.js";

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
  assert.equal(snap.active_runs_registered, 1);
  assert.equal(typeof snap.sdk_slots_in_use, "number");
  assert.equal(typeof snap.workers_paused, "boolean");
  assert.equal(snap.sdk_max_concurrent, 2);
});

test("runtimeStoreFields exposes store, db_enabled, control_plane_store for /api/runtime", () => {
  const prev = {
    store: process.env.LI_CONTROL_PLANE_STORE,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  process.env.LI_STACK_SKIP_SUPABASE = "1";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const fields = runtimeStoreFields();
  assert.equal(fields.store, "disk");
  assert.equal(fields.control_plane_store, "disk");
  assert.equal(fields.db_enabled, false);

  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
  if (prev.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prev.url;
  if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
});

test("runtimeSnapshotFromDb merges DB-only running rows into active_runs but not in-sdk count", () => {
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
      async_swarm_running: false,
      research_lane_running: false,
      implement_lane_running: false,
      maintenance_lane_running: false,
      agent_backend: "mock",
      sdk_ready: true,
      sdk_max_concurrent: 4,
      sdk_sessions_active: 0,
      active_runs: [],
      handoff_run: null,
      last_tick_at: null,
      updated_at: new Date(0).toISOString(),
    },
    [
      {
        run_id: "stale-db-only",
        agent_id: "code_implementer",
        status: "running",
        started_at: new Date(Date.now() - 7_200_000).toISOString(),
        finished_at: null,
        reason: "orphan after worker loss",
      },
    ],
  );
  assert.equal(snap.active_run_count, 0);
  assert.equal(snap.active_runs_registered, 0);
  assert.equal(snap.active_runs.length, 1);
  assert.equal(snap.active_runs[0]!.run_id, "stale-db-only");
  assert.equal(snap.store, "disk");
  assert.equal(snap.db_enabled, false);
});
