import assert from "node:assert/strict";
import test from "node:test";
import {
  SWARM_TOPICS,
  isLimqEnabled,
  legacyEnqueue,
  legacyDequeue,
  swarmPublish,
} from "./swarm-transport.js";

test("isLimqEnabled false without LI_MQ_URL", () => {
  const prev = process.env.LI_MQ_URL;
  delete process.env.LI_MQ_URL;
  try {
    assert.equal(isLimqEnabled(), false);
  } finally {
    if (prev !== undefined) process.env.LI_MQ_URL = prev;
  }
});

test("legacy fallback enqueue/dequeue", async () => {
  const prev = process.env.LI_MQ_URL;
  delete process.env.LI_MQ_URL;
  try {
    await swarmPublish(SWARM_TOPICS.events, '{"ok":true}');
    const row = legacyDequeue(SWARM_TOPICS.events);
    assert.ok(row);
    assert.equal(row.body, '{"ok":true}');
  } finally {
    if (prev !== undefined) process.env.LI_MQ_URL = prev;
  }
});
