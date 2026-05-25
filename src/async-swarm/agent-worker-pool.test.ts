import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPLEMENT_LANE_AGENTS,
  agentWorkerCycle,
  startAgentWorkerPool,
  stopAgentWorkerPool,
  asyncWorkerAgentIds,
  researchLaneAgentIds,
} from "./agent-worker-pool.js";

test("asyncWorkerAgentIds excludes implement lane and research goal agents", () => {
  const research = researchLaneAgentIds();
  const workers = asyncWorkerAgentIds();
  for (const id of IMPLEMENT_LANE_AGENTS) {
    assert.ok(!workers.includes(id), `implement lane agent ${id} should not be in worker pool`);
  }
  for (const id of research) {
    assert.ok(!workers.includes(id), `research agent ${id} should not be in worker pool`);
  }
  assert.ok(workers.includes("pr_merger"));
  assert.ok(workers.includes("bug_fixer"));
  assert.ok(!workers.includes("orchestrator"));
});

test("startAgentWorkerPool and agentWorkerCycle no-op when LI_SWARM_PAUSE_WORKERS", async () => {
  const prev = process.env.LI_SWARM_PAUSE_WORKERS;
  process.env.LI_SWARM_PAUSE_WORKERS = "1";
  try {
    const start = startAgentWorkerPool({ mock: true });
    assert.equal(start.started, false);
    assert.match(start.message, /paused/i);
    const cycle = await agentWorkerCycle("bug_fixer", { mock: true });
    assert.equal(cycle.skipped, true);
    assert.match(cycle.skip_reason ?? "", /paused/i);
  } finally {
    stopAgentWorkerPool();
    if (prev === undefined) delete process.env.LI_SWARM_PAUSE_WORKERS;
    else process.env.LI_SWARM_PAUSE_WORKERS = prev;
  }
});
