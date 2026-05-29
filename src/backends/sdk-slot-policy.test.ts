import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SDK_IMPLEMENT_LANE_SLOTS,
  SDK_RESEARCH_LANE_SLOTS,
  sdkSlotPolicySnapshot,
  workerPoolSlotBudget,
} from "./sdk-slot-policy.js";

test("workerPoolSlotBudget reserves research + implement lanes", () => {
  assert.equal(workerPoolSlotBudget(4), 2);
  assert.equal(workerPoolSlotBudget(2), 0);
  assert.equal(SDK_RESEARCH_LANE_SLOTS + SDK_IMPLEMENT_LANE_SLOTS, 2);
});

test("sdkSlotPolicySnapshot exposes policy fields", () => {
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SDK_MAX_CONCURRENT = "4";
  try {
    const snap = sdkSlotPolicySnapshot();
    assert.equal(snap.sdk_max_concurrent, 4);
    assert.equal(snap.research_lane_slots, 1);
    assert.equal(snap.implement_lane_slots, 1);
    assert.ok(snap.worker_pool_agents >= 1);
    assert.equal(snap.worker_pool_slot_budget, 2);
  } finally {
    if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prev;
  }
});
