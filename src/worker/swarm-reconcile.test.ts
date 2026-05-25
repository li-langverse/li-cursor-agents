import assert from "node:assert/strict";
import test from "node:test";

test("envAutoStartSwarm is exported via reconcile module behavior", async () => {
  const prev = process.env.LI_AUTO_START_ASYNC_SWARM;
  process.env.LI_AUTO_START_ASYNC_SWARM = "1";
  const { reconcileSwarmAfterStartup } = await import("./swarm-reconcile.js");
  assert.equal(typeof reconcileSwarmAfterStartup, "function");
  if (prev === undefined) delete process.env.LI_AUTO_START_ASYNC_SWARM;
  else process.env.LI_AUTO_START_ASYNC_SWARM = prev;
});
