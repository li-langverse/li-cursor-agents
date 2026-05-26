import { test } from "node:test";
import assert from "node:assert/strict";
import { runImplementerPreflightGate } from "./implementer-preflight-gate.js";

test("runImplementerPreflightGate skips non-implement agents", () => {
  const r = runImplementerPreflightGate("orchestrator");
  assert.equal(r.skipped, true);
  assert.equal(r.ok, true);
});
