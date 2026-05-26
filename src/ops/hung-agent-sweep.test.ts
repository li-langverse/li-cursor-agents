import assert from "node:assert/strict";
import { test } from "node:test";
import { sweepLogIdleMs, sweepMaxRunAgeMs } from "./hung-agent-sweep.js";

test("sweepMaxRunAgeMs defaults to 2h", () => {
  const prev = process.env.LI_AGENT_MAX_RUN_AGE_MS;
  delete process.env.LI_AGENT_MAX_RUN_AGE_MS;
  assert.equal(sweepMaxRunAgeMs(), 7_200_000);
  if (prev === undefined) delete process.env.LI_AGENT_MAX_RUN_AGE_MS;
  else process.env.LI_AGENT_MAX_RUN_AGE_MS = prev;
});

test("sweepLogIdleMs defaults to 30m", () => {
  const prev = process.env.LI_SWEEP_GRACE_MS;
  delete process.env.LI_SWEEP_GRACE_MS;
  assert.equal(sweepLogIdleMs(), 1_800_000);
  if (prev === undefined) delete process.env.LI_SWEEP_GRACE_MS;
  else process.env.LI_SWEEP_GRACE_MS = prev;
});
