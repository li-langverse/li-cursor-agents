import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markDetachedSwarmStopped } from "./swarm-watchdog-core.js";
import { resetSupabaseClient, setSupabaseClientForTest } from "../db/client.js";

test("markDetachedSwarmStopped skips when li-agents-async-swarm systemd unit is active", async () => {
  const prev = {
    store: process.env.LI_CONTROL_PLANE_STORE,
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
  };

  const dir = mkdtempSync(join(tmpdir(), "li-watchdog-skip-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

  let upsertCalled = false;
  setSupabaseClientForTest({
    from(table: string) {
      assert.equal(table, "worker_status");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              id: 1,
              async_swarm_running: true,
              supervisor_loop_running: false,
              research_lane_running: true,
              implement_lane_running: false,
              maintenance_lane_running: false,
              agent_backend: null,
              sdk_ready: false,
              sdk_max_concurrent: 4,
              sdk_sessions_active: 0,
              active_runs: [],
              handoff_run: null,
              last_tick_at: null,
              updated_at: new Date().toISOString(),
            },
            error: null,
          });
        },
        upsert() {
          upsertCalled = true;
          return { then(resolve: (v: { error: null }) => void) { resolve({ error: null }); } };
        },
      };
    },
  } as never);

  await markDetachedSwarmStopped("test: unit running", {
    systemdUnitActive: async () => true,
  });
  assert.equal(upsertCalled, false);

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  rmSync(dir, { recursive: true, force: true });
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.planeDir === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
  else process.env.LI_CONTROL_PLANE_DIR = prev.planeDir;
});
