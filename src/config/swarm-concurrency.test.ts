import assert from "node:assert/strict";
import test from "node:test";
import {
  SWARM_PARALLEL_CEILING,
  SWARM_PARALLEL_DEFAULT,
  clampSwarmParallel,
  parseSwarmParallelEnv,
  sdkMaxConcurrentFromEnv,
  swarmMaxParallelFromEnv,
} from "./swarm-concurrency.js";

test("defaults and ceiling", () => {
  assert.equal(SWARM_PARALLEL_DEFAULT, 4);
  assert.equal(SWARM_PARALLEL_CEILING, 4);
});

test("clampSwarmParallel hard-caps at ceiling", () => {
  assert.equal(clampSwarmParallel(1), 1);
  assert.equal(clampSwarmParallel(4), 4);
  assert.equal(clampSwarmParallel(8), 4);
  assert.equal(clampSwarmParallel(99), 4);
});

test("parseSwarmParallelEnv", () => {
  assert.equal(parseSwarmParallelEnv(undefined), 4);
  assert.equal(parseSwarmParallelEnv(""), 4);
  assert.equal(parseSwarmParallelEnv("3"), 3);
  assert.equal(parseSwarmParallelEnv("8"), 4);
  assert.equal(parseSwarmParallelEnv("0", { allowZero: true }), 0);
  assert.equal(parseSwarmParallelEnv("0"), 4);
});

test("sdkMaxConcurrentFromEnv", () => {
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SDK_MAX_CONCURRENT = "2";
  assert.equal(sdkMaxConcurrentFromEnv(), 2);
  process.env.LI_SDK_MAX_CONCURRENT = "99";
  assert.equal(sdkMaxConcurrentFromEnv(), 4);
  delete process.env.LI_SDK_MAX_CONCURRENT;
  assert.equal(sdkMaxConcurrentFromEnv(), 4);
  if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prev;
});

test("swarmMaxParallelFromEnv", () => {
  const prevParallel = process.env.LI_SWARM_MAX_PARALLEL;
  const prevSdk = process.env.LI_SDK_MAX_CONCURRENT;
  delete process.env.LI_SWARM_MAX_PARALLEL;
  delete process.env.LI_SDK_MAX_CONCURRENT;
  assert.equal(swarmMaxParallelFromEnv(), 4);
  process.env.LI_SWARM_MAX_PARALLEL = "0";
  assert.equal(swarmMaxParallelFromEnv(), 0);
  process.env.LI_SWARM_MAX_PARALLEL = "8";
  assert.equal(swarmMaxParallelFromEnv(), 4);
  if (prevParallel == null) delete process.env.LI_SWARM_MAX_PARALLEL;
  else process.env.LI_SWARM_MAX_PARALLEL = prevParallel;
  if (prevSdk == null) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prevSdk;
});
