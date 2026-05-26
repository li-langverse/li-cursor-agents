import assert from "node:assert/strict";
import test from "node:test";
import {
  reclaimAllStaleSdkSlots,
  resetSdkSessionLockForTests,
  sdkSlotsInUse,
  withGlobalSdkSessionLock,
} from "../backends/sdk-session-lock.js";
import { mergeActiveRunsForDisplay } from "./merge-active-runs.js";
import { computeInSdkCount } from "./active-run-metrics.js";
import {
  completeSupervisorRun,
  registerSupervisorRun,
  runtimeSnapshot,
} from "./runtime.js";
import { loadState } from "./state.js";
import type { AgentRunHistoryRow } from "../db/runs.js";

test("after supervisor run completes, runtime active_run_count and slots are zero", async () => {
  resetSdkSessionLockForTests();
  reclaimAllStaleSdkSlots();

  const runId = registerSupervisorRun("gap_explorer", "test sigterm path");
  completeSupervisorRun(runId, "error");

  const snap = runtimeSnapshot(loadState());
  assert.equal(snap.active_runs_registered, 0);
  assert.equal(snap.active_run_count, 0);
  assert.equal(snap.sdk_slots_in_use, sdkSlotsInUse());
  assert.equal(sdkSlotsInUse(), 0);
});

test("merged DB running orphans do not inflate in-sdk count after worker loss", () => {
  const dbRunning: AgentRunHistoryRow[] = [
    {
      run_id: "orphan-1",
      agent_id: "code_implementer",
      status: "running",
      started_at: new Date(Date.now() - 7_200_000).toISOString(),
      finished_at: null,
      reason: "worker died",
    },
  ];
  const merged = mergeActiveRunsForDisplay([], dbRunning);
  const inSdk = computeInSdkCount(0, 0, 4);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.status, "running");
  assert.equal(inSdk, 0);
});

test("reclaimed SDK slot after held session ends", async () => {
  resetSdkSessionLockForTests();
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SDK_MAX_CONCURRENT = "1";
  await withGlobalSdkSessionLock(async () => {
    assert.ok(sdkSlotsInUse() >= 1);
  });
  reclaimAllStaleSdkSlots();
  assert.equal(sdkSlotsInUse(), 0);
  const snap = runtimeSnapshot(loadState());
  assert.equal(snap.active_run_count, 0);
  if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prev;
  resetSdkSessionLockForTests();
});
