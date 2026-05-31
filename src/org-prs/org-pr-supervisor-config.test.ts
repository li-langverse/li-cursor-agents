import assert from "node:assert/strict";
import test from "node:test";
import { computeDesiredWorkers } from "./org-pr-supervisor-config.js";

test("computeDesiredWorkers scales 1-3 by backlog", () => {
  assert.equal(computeDesiredWorkers(0, 3), 0);
  assert.equal(computeDesiredWorkers(1, 3), 1);
  assert.equal(computeDesiredWorkers(50, 3), 1);
  assert.equal(computeDesiredWorkers(51, 3), 2);
  assert.equal(computeDesiredWorkers(101, 3), 3);
});
