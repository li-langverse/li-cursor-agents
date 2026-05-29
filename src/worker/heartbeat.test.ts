import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState } from "../control-plane/state.js";
import { resetSupabaseClient, setSupabaseClientForTest } from "../db/client.js";
import { persistWorkerHeartbeat } from "./heartbeat.js";

test("persistWorkerHeartbeat skips when external swarm runner owns worker_status", async () => {
  const prev = {
    external: process.env.LI_SWARM_EXTERNAL,
    detached: process.env.LI_SWARM_DETACHED,
    store: process.env.LI_CONTROL_PLANE_STORE,
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
  };

  const dir = mkdtempSync(join(tmpdir(), "li-heartbeat-skip-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.LI_SWARM_EXTERNAL = "1";
  process.env.LI_SWARM_DETACHED = "0";
  delete process.env.LI_STACK_SKIP_SUPABASE;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

  let upsertCalled = false;
  setSupabaseClientForTest({
    from(table: string) {
      assert.equal(table, "worker_status");
      return {
        upsert() {
          upsertCalled = true;
          return { then(resolve: (v: { error: null }) => void) { resolve({ error: null }); } };
        },
      };
    },
  } as never);

  await persistWorkerHeartbeat(loadState());
  assert.equal(upsertCalled, false);

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  rmSync(dir, { recursive: true, force: true });

  if (prev.external === undefined) delete process.env.LI_SWARM_EXTERNAL;
  else process.env.LI_SWARM_EXTERNAL = prev.external;
  if (prev.detached === undefined) delete process.env.LI_SWARM_DETACHED;
  else process.env.LI_SWARM_DETACHED = prev.detached;
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.planeDir === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
  else process.env.LI_CONTROL_PLANE_DIR = prev.planeDir;
});

test("persistWorkerHeartbeat writes to Supabase when async swarm runs in-process", async () => {
  const prev = {
    external: process.env.LI_SWARM_EXTERNAL,
    detached: process.env.LI_SWARM_DETACHED,
    store: process.env.LI_CONTROL_PLANE_STORE,
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
  };

  const dir = mkdtempSync(join(tmpdir(), "li-heartbeat-write-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.LI_STACK_SKIP_SUPABASE = "0";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  delete process.env.LI_SWARM_EXTERNAL;
  delete process.env.LI_SWARM_DETACHED;

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
            data: { id: 1, ...upsertPayload, async_swarm_running: true },
            error: null,
          });
        },
      };
    },
  } as never);

  const { setAsyncSwarmRunning } = await import("../async-swarm/async-swarm-state.js");
  setAsyncSwarmRunning(true);
  try {
    await persistWorkerHeartbeat(loadState());
    assert.equal((upsertPayload as { async_swarm_running?: boolean } | null)?.async_swarm_running, true);
  } finally {
    setAsyncSwarmRunning(false);
  }

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  rmSync(dir, { recursive: true, force: true });
  if (prev.external === undefined) delete process.env.LI_SWARM_EXTERNAL;
  else process.env.LI_SWARM_EXTERNAL = prev.external;
  if (prev.detached === undefined) delete process.env.LI_SWARM_DETACHED;
  else process.env.LI_SWARM_DETACHED = prev.detached;
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.planeDir === undefined) delete process.env.LI_CONTROL_PLANE_DIR;
  else process.env.LI_CONTROL_PLANE_DIR = prev.planeDir;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
});
