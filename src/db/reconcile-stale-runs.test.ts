import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileStaleRunningAgentRuns,
  reconcileUnregisteredRunningAgentRuns,
  staleRunningRunMaxAgeMs,
  unregisteredReconcileFreshMs,
} from "./reconcile-stale-runs.js";
import {
  createAgentRunsSupabaseMock,
  type AgentRunMockRow,
} from "./test/supabase-agent-runs-mock.js";
import { resetSupabaseClient, setSupabaseClientForTest } from "./client.js";
import { defaultWorkerStatus } from "./worker-status.js";

test("staleRunningRunMaxAgeMs defaults to 30m and respects bounded env", () => {
  const prev = process.env.LI_STALE_RUNNING_RUN_MS;
  delete process.env.LI_STALE_RUNNING_RUN_MS;
  assert.equal(staleRunningRunMaxAgeMs(), 1_800_000);

  process.env.LI_STALE_RUNNING_RUN_MS = "120000";
  assert.equal(staleRunningRunMaxAgeMs(), 120_000);

  process.env.LI_STALE_RUNNING_RUN_MS = "30";
  assert.equal(staleRunningRunMaxAgeMs(), 1_800_000);

  process.env.LI_STALE_RUNNING_RUN_MS = String(8 * 24 * 3_600_000);
  assert.equal(staleRunningRunMaxAgeMs(), 7 * 24 * 3_600_000);

  if (prev === undefined) delete process.env.LI_STALE_RUNNING_RUN_MS;
  else process.env.LI_STALE_RUNNING_RUN_MS = prev;
});

test("reconcileStaleRunningAgentRuns no-ops when control plane store is disk", async () => {
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

  assert.equal(await reconcileStaleRunningAgentRuns(), 0);

  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
  if (prev.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prev.url;
  if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
});

function runningRow(id: string, ageMs: number): AgentRunMockRow {
  const t = new Date(Date.now() - ageMs).toISOString();
  return {
    run_id: id,
    agent_id: "gap_explorer",
    status: "running",
    started_at: t,
    updated_at: t,
    finished_at: null,
    error: null,
  };
}

test("reconcileUnregisteredRunningAgentRuns marks DB-only running rows not in heartbeat", async () => {
  const prev = {
    store: process.env.LI_CONTROL_PLANE_STORE,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  delete process.env.LI_STACK_SKIP_SUPABASE;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

  const rows = [
    runningRow("live-1", 5_000),
    runningRow("orphan-1", 5_000),
    runningRow("orphan-2", 5_000),
  ];
  setSupabaseClientForTest(createAgentRunsSupabaseMock(rows));

  const worker = {
    ...defaultWorkerStatus(),
    async_swarm_running: true,
    active_runs: [
      {
        run_id: "live-1",
        agent_id: "gap_explorer" as const,
        pid: 123,
        started_at: new Date().toISOString(),
        status: "running" as const,
      },
    ],
    updated_at: new Date().toISOString(),
  };

  const n = await reconcileUnregisteredRunningAgentRuns(["live-1"], { worker, force: true });
  assert.equal(n, 2);
  assert.equal(rows.find((r) => r.run_id === "orphan-1")!.status, "error");
  assert.equal(rows.find((r) => r.run_id === "orphan-1")!.error, "unregistered_running_reconciled");
  assert.equal(rows.find((r) => r.run_id === "live-1")!.status, "running");

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
  if (prev.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prev.url;
  if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
});

test("reconcileUnregisteredRunningAgentRuns skips when heartbeat is stale unless force", async () => {
  const prev = { store: process.env.LI_CONTROL_PLANE_STORE, testMode: process.env.LI_TEST_MODE };
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  process.env.LI_TEST_MODE = "1";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  delete process.env.LI_STACK_SKIP_SUPABASE;

  const rows = [runningRow("orphan-1", 5_000)];
  setSupabaseClientForTest(createAgentRunsSupabaseMock(rows));

  const staleWorker = {
    ...defaultWorkerStatus(),
    async_swarm_running: true,
    updated_at: new Date(Date.now() - unregisteredReconcileFreshMs() - 1_000).toISOString(),
  };

  assert.equal(await reconcileUnregisteredRunningAgentRuns([], { worker: staleWorker }), 0);
  assert.equal(
    await reconcileUnregisteredRunningAgentRuns([], { worker: staleWorker, force: true }),
    1,
  );

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.testMode === undefined) delete process.env.LI_TEST_MODE;
  else process.env.LI_TEST_MODE = prev.testMode;
});
