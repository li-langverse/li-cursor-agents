import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentWorkQueue,
  peekAgentWorkQueueSnapshot,
  resetAgentWorkQueueCacheForTests,
} from "./agent-work-queue.js";
import type { ControlPlaneState } from "./types.js";

const state: ControlPlaneState = {
  version: 1,
  runs_total: 0,
  updated_at: "2026-01-01T00:00:00.000Z",
  last_tick_at: "",
  recent_tasks: [],
  stopped_agents: [],
  last_preflight_at: "",
};

test("peekAgentWorkQueueSnapshot returns cache after build", async () => {
  resetAgentWorkQueueCacheForTests();
  assert.equal(peekAgentWorkQueueSnapshot(state, { light: true }), null);
  await buildAgentWorkQueue(state, { light: true });
  const peek = peekAgentWorkQueueSnapshot(state, { light: true });
  assert.ok(peek);
  assert.ok(Array.isArray(peek.items));
});
