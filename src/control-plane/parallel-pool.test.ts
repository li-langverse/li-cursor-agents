import assert from "node:assert/strict";
import test from "node:test";
import { runWithConcurrencyLimit, swarmMaxParallelFromEnv } from "./parallel-pool.js";

test("runWithConcurrencyLimit respects cap", async () => {
  let inFlight = 0;
  let peak = 0;
  const items = [1, 2, 3, 4, 5, 6];
  await runWithConcurrencyLimit(items, 2, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
  });
  assert.equal(peak, 2);
});

test("swarmMaxParallelFromEnv re-exports capped parser", () => {
  const prevParallel = process.env.LI_SWARM_MAX_PARALLEL;
  const prevSdk = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SWARM_MAX_PARALLEL = "8";
  assert.equal(swarmMaxParallelFromEnv(), 8);
  delete process.env.LI_SWARM_MAX_PARALLEL;
  delete process.env.LI_SDK_MAX_CONCURRENT;
  assert.equal(swarmMaxParallelFromEnv(), 4);
  if (prevParallel != null) process.env.LI_SWARM_MAX_PARALLEL = prevParallel;
  else delete process.env.LI_SWARM_MAX_PARALLEL;
  if (prevSdk != null) process.env.LI_SDK_MAX_CONCURRENT = prevSdk;
  else delete process.env.LI_SDK_MAX_CONCURRENT;
});
