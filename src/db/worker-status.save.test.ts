import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetSupabaseClient, setSupabaseClientForTest } from "./client.js";
import { saveWorkerStatusToDb } from "./worker-status.js";

test("saveWorkerStatusToDb writerSwarmAlive prevents false async_swarm in upsert", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-worker-save-guard-"));
  const prev = {
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
    store: process.env.LI_CONTROL_PLANE_STORE,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
  };
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.LI_STACK_SKIP_SUPABASE = "0";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

  let upsertPayload: Record<string, unknown> | null = null;
  setSupabaseClientForTest({
    from(table: string) {
      assert.equal(table, "worker_status");
      return {
        upsert(row: Record<string, unknown>) {
          upsertPayload = row;
          return { then(resolve: (v: { error: null }) => void) { resolve({ error: null }); } };
        },
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
              ...upsertPayload,
              supervisor_loop_running: false,
              implement_lane_running: false,
              maintenance_lane_running: false,
              agent_backend: null,
              sdk_ready: false,
              sdk_max_concurrent: 4,
              sdk_sessions_active: 0,
              active_runs: [],
              handoff_run: null,
              last_tick_at: null,
            },
            error: null,
          });
        },
      };
    },
  } as never);

  await saveWorkerStatusToDb(
    { async_swarm_running: false, research_lane_running: true },
    { writerSwarmAlive: true },
  );
  assert.equal((upsertPayload as { async_swarm_running?: boolean } | null)?.async_swarm_running, true);

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  rmSync(dir, { recursive: true, force: true });
  if (prev.planeDir === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
  else process.env.LI_CONTROL_PLANE_DIR = prev.planeDir;
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
});

test("saveWorkerStatusToDb throws when read-back async_swarm still false", async () => {
  const dir = mkdtempSync(join(tmpdir(), "li-worker-save-readback-"));
  const prev = {
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
    store: process.env.LI_CONTROL_PLANE_STORE,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
  };
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.LI_STACK_SKIP_SUPABASE = "0";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

  setSupabaseClientForTest({
    from(table: string) {
      assert.equal(table, "worker_status");
      return {
        upsert() {
          return { then(resolve: (v: { error: null }) => void) { resolve({ error: null }); } };
        },
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
              async_swarm_running: false,
              supervisor_loop_running: false,
              research_lane_running: false,
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
      };
    },
  } as never);

  await assert.rejects(
    () => saveWorkerStatusToDb({ async_swarm_running: true }),
    /read-back async_swarm_running still false/,
  );

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  rmSync(dir, { recursive: true, force: true });
  if (prev.planeDir === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
  else process.env.LI_CONTROL_PLANE_DIR = prev.planeDir;
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
});
