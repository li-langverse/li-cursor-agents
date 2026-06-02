import assert from "node:assert/strict";
import test from "node:test";
import { computeDesiredWorkers } from "./org-issue-supervisor-config.js";

test("computeDesiredWorkers scales 1-3 by implement backlog", () => {
  assert.equal(computeDesiredWorkers(0, 3), 0);
  assert.equal(computeDesiredWorkers(1, 3), 1);
  assert.equal(computeDesiredWorkers(10, 3), 1);
  assert.equal(computeDesiredWorkers(11, 3), 2);
  assert.equal(computeDesiredWorkers(20, 3), 2);
  assert.equal(computeDesiredWorkers(21, 3), 3);
  assert.equal(computeDesiredWorkers(500, 3), 3);
});
