import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchSwarmAuditRefresh, resolveBenchmarksDispatchToken } from "./dispatch-swarm-audit.js";

test("dispatchSwarmAuditRefresh skips without token", () => {
  const prev = process.env.LI_BENCHMARKS_DISPATCH_TOKEN;
  delete process.env.LI_BENCHMARKS_DISPATCH_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  const r = dispatchSwarmAuditRefresh();
  assert.equal(r.skipped, true);
  if (prev) process.env.LI_BENCHMARKS_DISPATCH_TOKEN = prev;
});

test("dispatchSwarmAuditRefresh dry-run does not call gh", () => {
  const r = dispatchSwarmAuditRefresh({
    dryRun: true,
    token: "test-token",
    ref: "abc123",
    source: "unit-test",
  });
  assert.equal(r.ok, true);
  assert.match(String(r.skip_reason), /dry-run/);
});

test("resolveBenchmarksDispatchToken prefers LI_BENCHMARKS_DISPATCH_TOKEN", () => {
  const prev = process.env.LI_BENCHMARKS_DISPATCH_TOKEN;
  process.env.LI_BENCHMARKS_DISPATCH_TOKEN = "dispatch-only";
  assert.equal(resolveBenchmarksDispatchToken(), "dispatch-only");
  if (prev === undefined) delete process.env.LI_BENCHMARKS_DISPATCH_TOKEN;
  else process.env.LI_BENCHMARKS_DISPATCH_TOKEN = prev;
});
