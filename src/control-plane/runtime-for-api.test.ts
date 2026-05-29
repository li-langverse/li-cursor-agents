import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRuntimePeerCache, runtimeForApi } from "./runtime-for-api.js";
import { loadState } from "./state.js";
import { resetSupabaseClient, setSupabaseClientForTest } from "../db/client.js";

test("runtimeForApi uses Supabase worker_status when local swarm is off", async () => {
  const prev = {
    store: process.env.LI_CONTROL_PLANE_STORE,
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
  };

  const dir = mkdtempSync(join(tmpdir(), "li-runtime-peer-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.LI_STACK_SKIP_SUPABASE = "0";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

  setSupabaseClientForTest({
    from(table: string) {
      if (table === "agent_runs") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      }
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
              supervisor_loop_running: false,
              async_swarm_running: true,
              research_lane_running: true,
              implement_lane_running: true,
              maintenance_lane_running: false,
              agent_backend: "cursor-sdk",
              sdk_ready: true,
              sdk_max_concurrent: 4,
              sdk_sessions_active: 0,
              active_runs: [
                {
                  run_id: "live-1",
                  agent_id: "bench_improver",
                  status: "running",
                  pid: 1,
                  started_at: new Date().toISOString(),
                },
              ],
              handoff_run: null,
              last_tick_at: null,
              updated_at: "2026-05-29T03:00:00.000Z",
            },
            error: null,
          });
        },
      };
    },
  } as never);

  clearRuntimePeerCache();
  const rt = await runtimeForApi(loadState());
  assert.equal(rt.async_swarm_running, true);
  assert.equal(rt.lanes?.research_lane_running, true);

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  rmSync(dir, { recursive: true, force: true });
  clearRuntimePeerCache();

  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.planeDir === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
  else process.env.LI_CONTROL_PLANE_DIR = prev.planeDir;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
});
