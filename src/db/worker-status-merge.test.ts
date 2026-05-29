import assert from "node:assert/strict";
import test from "node:test";
import { applyAsyncSwarmWriterGuard } from "./worker-status-merge.js";

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
