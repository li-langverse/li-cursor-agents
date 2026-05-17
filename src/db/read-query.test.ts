import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReadOnlySql } from "./read-query.js";

test("validateReadOnlySql accepts SELECT", () => {
  const r = validateReadOnlySql("SELECT run_id, status FROM agent_runs LIMIT 5");
  assert.equal(r.ok, true);
});

test("validateReadOnlySql rejects INSERT", () => {
  const r = validateReadOnlySql("INSERT INTO agent_runs VALUES ('x')");
  assert.equal(r.ok, false);
});

test("validateReadOnlySql rejects multiple statements", () => {
  const r = validateReadOnlySql("SELECT 1; SELECT 2");
  assert.equal(r.ok, false);
});
