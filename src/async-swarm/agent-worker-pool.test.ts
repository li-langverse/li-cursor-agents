import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPLEMENT_LANE_AGENTS,
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
