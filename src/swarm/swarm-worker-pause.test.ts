import assert from "node:assert/strict";
import test from "node:test";
import { swarmWorkersPaused } from "./swarm-worker-pause.js";

test("swarmWorkersPaused respects LI_SWARM_PAUSE_WORKERS", () => {
  const prev = process.env.LI_SWARM_PAUSE_WORKERS;
  delete process.env.LI_SWARM_PAUSE_WORKERS;
  assert.equal(swarmWorkersPaused(), false);
  process.env.LI_SWARM_PAUSE_WORKERS = "1";
  assert.equal(swarmWorkersPaused(), true);
  process.env.LI_SWARM_PAUSE_WORKERS = "true";
  assert.equal(swarmWorkersPaused(), true);
  if (prev === undefined) delete process.env.LI_SWARM_PAUSE_WORKERS;
  else process.env.LI_SWARM_PAUSE_WORKERS = prev;
});
