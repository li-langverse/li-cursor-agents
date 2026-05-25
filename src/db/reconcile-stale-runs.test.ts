import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileStaleRunningAgentRuns,
  staleRunningRunMaxAgeMs,
} from "./reconcile-stale-runs.js";

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
