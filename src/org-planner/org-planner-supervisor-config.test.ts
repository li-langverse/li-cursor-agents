import test from "node:test";
import assert from "node:assert/strict";
import { computeDesiredWorkers, researchPlanRef, parseResearchPlanRef } from "./org-planner-supervisor-config.js";

test("computeDesiredWorkers scales by 12 items per worker", () => {
  assert.equal(computeDesiredWorkers(0, 3), 0);
  assert.equal(computeDesiredWorkers(1, 3), 1);
  assert.equal(computeDesiredWorkers(12, 3), 1);
  assert.equal(computeDesiredWorkers(13, 3), 2);
  assert.equal(computeDesiredWorkers(100, 3), 3);
});

test("researchPlanRef round-trips", () => {
  const ref = researchPlanRef("numerics_sota", "sess-abc");
  assert.equal(parseResearchPlanRef(ref)?.goalId, "numerics_sota");
  assert.equal(parseResearchPlanRef(ref)?.sessionId, "sess-abc");
});
