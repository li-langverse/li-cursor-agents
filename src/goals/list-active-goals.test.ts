import assert from "node:assert/strict";
import test from "node:test";
import { listActiveGoals } from "./list-active-goals.js";

test("listActiveGoals includes research and implement lanes", () => {
  const snap = listActiveGoals();
  assert.ok(snap.research.length >= 5);
  assert.ok(snap.implement.length >= 1);
  assert.equal(snap.count, snap.research.length + snap.implement.length);
  const httpd = snap.implement.find((g) => g.id === "httpd_parity");
  assert.ok(httpd);
  assert.equal(httpd.lane, "implement");
  assert.equal(httpd.agent, "code_implementer");
});
