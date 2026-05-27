import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState } from "../control-plane/state.js";
import { resetSupabaseClient, setSupabaseClientForTest } from "../db/client.js";
import { defaultWorkerStatus } from "../db/worker-status.js";
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

  writeFileSync(
    join(dir, "worker-status.json"),
    `${JSON.stringify({ async_swarm_running: true, active_runs: [{ run_id: "live", status: "running" }] })}\n`,
    "utf8",
  );

  await persistWorkerHeartbeat(loadState());
  assert.equal(upsertCalled, false);

  const disk = readFileSync(join(dir, "worker-status.json"), "utf8");
  const parsed = JSON.parse(disk) as { async_swarm_running?: boolean; active_runs?: unknown[] };
  assert.equal(parsed.async_swarm_running, true);
  assert.equal(parsed.active_runs?.length, 1);

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

test("persistWorkerHeartbeat writes when async swarm runs in-process", async () => {
  const prev = {
    external: process.env.LI_SWARM_EXTERNAL,
    detached: process.env.LI_SWARM_DETACHED,
    store: process.env.LI_CONTROL_PLANE_STORE,
    planeDir: process.env.LI_CONTROL_PLANE_DIR,
  };

  const dir = mkdtempSync(join(tmpdir(), "li-heartbeat-write-"));
  process.env.LI_CONTROL_PLANE_DIR = dir;
  process.env.LI_CONTROL_PLANE_STORE = "disk";
  process.env.LI_STACK_SKIP_SUPABASE = "1";
  delete process.env.LI_SWARM_EXTERNAL;
  delete process.env.LI_SWARM_DETACHED;

  const { setAsyncSwarmRunning } = await import("../async-swarm/async-swarm-state.js");
  setAsyncSwarmRunning(true);
  try {
    await persistWorkerHeartbeat(loadState());
    const disk = readFileSync(join(dir, "worker-status.json"), "utf8");
    const parsed = JSON.parse(disk) as { async_swarm_running?: boolean };
    assert.equal(parsed.async_swarm_running, true);
  } finally {
    setAsyncSwarmRunning(false);
  }

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
