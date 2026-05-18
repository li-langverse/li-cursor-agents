import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultProactiveAgentIds,
  isProactiveEligibleAgent,
  pickProactiveWorkForAgent,
  proactiveAllPoolWorkersEnabled,
} from "./proactive-agent-work.js";

test("defaultProactiveAgentIds includes orchestrator", () => {
  assert.ok(defaultProactiveAgentIds().includes("orchestrator"));
});

test("pickProactiveWorkForAgent skips research lane agents", () => {
  assert.equal(pickProactiveWorkForAgent("proof_gap_researcher"), null);
});

test("isProactiveEligibleAgent includes worker-pool maintainer when LI_PROACTIVE_ALL_POOL_WORKERS=1", () => {
  const prev = process.env.LI_PROACTIVE_ALL_POOL_WORKERS;
  process.env.LI_PROACTIVE_ALL_POOL_WORKERS = "1";
  try {
    assert.ok(isProactiveEligibleAgent("bug_fixer"));
    assert.ok(isProactiveEligibleAgent("ci_maintainer"));
    assert.equal(isProactiveEligibleAgent("proof_gap_researcher"), false);
    assert.equal(isProactiveEligibleAgent("code_implementer"), false);
  } finally {
    if (prev === undefined) delete process.env.LI_PROACTIVE_ALL_POOL_WORKERS;
    else process.env.LI_PROACTIVE_ALL_POOL_WORKERS = prev;
  }
});

test("proactiveAllPoolWorkersEnabled respects explicit off", () => {
  const prev = process.env.LI_PROACTIVE_ALL_POOL_WORKERS;
  process.env.LI_PROACTIVE_ALL_POOL_WORKERS = "0";
  try {
    assert.equal(proactiveAllPoolWorkersEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.LI_PROACTIVE_ALL_POOL_WORKERS;
    else process.env.LI_PROACTIVE_ALL_POOL_WORKERS = prev;
  }
});
