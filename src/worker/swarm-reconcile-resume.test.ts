import assert from "node:assert/strict";
import test from "node:test";
import { shouldResumeAsyncSwarmAfterRestart } from "./swarm-reconcile.js";

test("shouldResumeAsyncSwarmAfterRestart when worker_status was running", () => {
  assert.equal(
    shouldResumeAsyncSwarmAfterRestart({
      swarmActiveOnHost: false,
      envAutoStart: false,
      workerAsyncSwarmRunning: true,
    }),
    true,
  );
});

test("shouldResumeAsyncSwarmAfterRestart false when swarm already on host", () => {
  assert.equal(
    shouldResumeAsyncSwarmAfterRestart({
      swarmActiveOnHost: true,
      envAutoStart: true,
      workerAsyncSwarmRunning: true,
    }),
    false,
  );
});

test("shouldResumeAsyncSwarmAfterRestart when LI_AUTO_START_ASYNC_SWARM", () => {
  assert.equal(
    shouldResumeAsyncSwarmAfterRestart({
      swarmActiveOnHost: false,
      envAutoStart: true,
      workerAsyncSwarmRunning: false,
    }),
    true,
  );
});

test("shouldResumeAsyncSwarmAfterRestart false when idle and no env auto-start", () => {
  assert.equal(
    shouldResumeAsyncSwarmAfterRestart({
      swarmActiveOnHost: false,
      envAutoStart: false,
      workerAsyncSwarmRunning: false,
    }),
    false,
  );
});
