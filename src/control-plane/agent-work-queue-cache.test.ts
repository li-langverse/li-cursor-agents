import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentWorkQueue,
  peekAgentWorkQueueSnapshot,
  resetAgentWorkQueueCacheForTests,
} from "./agent-work-queue.js";
import { DEFAULT_STATE } from "./types.js";

const state = { ...DEFAULT_STATE, updated_at: "2026-01-01T00:00:00.000Z" };

test("peekAgentWorkQueueSnapshot returns cache after build", async () => {
  resetAgentWorkQueueCacheForTests();
  assert.equal(peekAgentWorkQueueSnapshot(state, { light: true }), null);
  await buildAgentWorkQueue(state, { light: true });
  const peek = peekAgentWorkQueueSnapshot(state, { light: true });
  assert.ok(peek);
  assert.ok(Array.isArray(peek.items));
});
