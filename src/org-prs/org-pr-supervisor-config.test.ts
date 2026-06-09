import assert from "node:assert/strict";
import test from "node:test";
import { computeDesiredWorkers } from "./org-pr-supervisor-config.js";

test("computeDesiredWorkers scales by backlog (/25 per worker)", () => {
  assert.equal(computeDesiredWorkers(0, 16), 0);
  assert.equal(computeDesiredWorkers(1, 16), 1);
  assert.equal(computeDesiredWorkers(25, 16), 1);
  assert.equal(computeDesiredWorkers(26, 16), 2);
  assert.equal(computeDesiredWorkers(100, 16), 4);
  assert.equal(computeDesiredWorkers(400, 16), 16);
  assert.equal(computeDesiredWorkers(500, 8), 8);
});
