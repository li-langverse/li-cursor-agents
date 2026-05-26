import assert from "node:assert/strict";
import test from "node:test";
import { runtimeSnapshotFromDb } from "../db-api/runtime-read.js";
import { defaultWorkerStatus } from "./worker-status.js";
import {
  resetSupabaseClient,
  setSupabaseClientForTest,
} from "./client.js";
import { reconcileStaleRunningAgentRuns } from "./reconcile-stale-runs.js";
import { listRunningAgentRuns } from "./runs.js";
import {
  createAgentRunsSupabaseMock,
  type AgentRunMockRow,
} from "./test/supabase-agent-runs-mock.js";

function supabaseTestEnv(): void {
  process.env.LI_TEST_MODE = "1";
  process.env.LI_CONTROL_PLANE_STORE = "supabase";
  delete process.env.LI_STACK_SKIP_SUPABASE;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
}

function staleRow(id: string, ageMs: number): AgentRunMockRow {
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

test("reconcileStaleRunningAgentRuns marks N stale rows and runtime in-sdk stays 0", async () => {
  const prev = {
    testMode: process.env.LI_TEST_MODE,
    store: process.env.LI_CONTROL_PLANE_STORE,
    skip: process.env.LI_STACK_SKIP_SUPABASE,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  supabaseTestEnv();
  const mock = createAgentRunsSupabaseMock([
    staleRow("stale-1", 3_600_000),
    staleRow("stale-2", 3_600_000),
    staleRow("stale-3", 3_600_000),
    staleRow("fresh-1", 5_000),
  ]);
  setSupabaseClientForTest(mock);

  const n = await reconcileStaleRunningAgentRuns();
  assert.equal(n, 3);

  const stillRunning = await listRunningAgentRuns(30);
  assert.equal(stillRunning.length, 1);
  assert.equal(stillRunning[0]!.run_id, "fresh-1");

  const snapBeforeReconcileStale = runtimeSnapshotFromDb(
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
    defaultWorkerStatus(),
    stillRunning,
  );
  assert.equal(snapBeforeReconcileStale.active_run_count, 0);
  assert.equal(snapBeforeReconcileStale.active_runs_registered, 0);
  assert.equal(snapBeforeReconcileStale.active_runs.length, 1);

  setSupabaseClientForTest(null);
  resetSupabaseClient();

  if (prev.testMode === undefined) delete process.env.LI_TEST_MODE;
  else process.env.LI_TEST_MODE = prev.testMode;
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
  if (prev.skip === undefined) delete process.env.LI_STACK_SKIP_SUPABASE;
  else process.env.LI_STACK_SKIP_SUPABASE = prev.skip;
  if (prev.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prev.url;
  if (prev.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
});

test("reconcileStaleRunningAgentRuns sets stale_running_reconciled on updated rows", async () => {
  const prev = { testMode: process.env.LI_TEST_MODE, store: process.env.LI_CONTROL_PLANE_STORE };
  supabaseTestEnv();
  const rows = [staleRow("x-1", 9_000_000)];
  setSupabaseClientForTest(createAgentRunsSupabaseMock(rows));

  const n = await reconcileStaleRunningAgentRuns();
  assert.equal(n, 1);
  assert.equal(rows[0]!.status, "error");
  assert.equal(rows[0]!.error, "stale_running_reconciled");
  assert.ok(rows[0]!.finished_at);

  setSupabaseClientForTest(null);
  resetSupabaseClient();
  if (prev.testMode === undefined) delete process.env.LI_TEST_MODE;
  else process.env.LI_TEST_MODE = prev.testMode;
  if (prev.store === undefined) delete process.env.LI_CONTROL_PLANE_STORE;
  else process.env.LI_CONTROL_PLANE_STORE = prev.store;
});
