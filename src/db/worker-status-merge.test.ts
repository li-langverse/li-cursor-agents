import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAsyncSwarmWriterGuard,
  pickFreshestWorkerStatus,
} from "./worker-status-merge.js";
import { defaultWorkerStatus } from "./worker-status.js";

test("pickFreshestWorkerStatus chooses latest updated_at", () => {
  const older = { ...defaultWorkerStatus(), async_swarm_running: false, updated_at: "2026-05-28T20:00:00.000Z" };
  const newer = { ...defaultWorkerStatus(), async_swarm_running: true, updated_at: "2026-05-28T21:00:00.000Z" };
  const picked = pickFreshestWorkerStatus(older, null, newer);
  assert.equal(picked?.async_swarm_running, true);
});

test("applyAsyncSwarmWriterGuard blocks false while swarm writer is alive", () => {
  const patch = applyAsyncSwarmWriterGuard(
    { async_swarm_running: false, research_lane_running: false },
    true,
  );
  assert.equal(patch.async_swarm_running, true);
  assert.equal(patch.research_lane_running, false);
});

test("applyAsyncSwarmWriterGuard allows explicit stop when writer is not alive", () => {
  const patch = applyAsyncSwarmWriterGuard({ async_swarm_running: false }, false);
  assert.equal(patch.async_swarm_running, false);
});
