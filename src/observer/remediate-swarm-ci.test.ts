import assert from "node:assert/strict";
import test from "node:test";
import { buildRemediations } from "./remediate.js";
import { DEFAULT_STATE } from "../control-plane/types.js";

test("buildRemediations keeps bench ci_red path when benchmarks red (swarm dedupes same agent)", () => {
  const actions = buildRemediations({
    findings: [],
    briefing: {
      ecosystem_audit: { benchmarks: { red: ["bench_a"] } },
      ci_bug_triage: { swarm_work_queue: [{ repo: "lic", number: 1 }] },
    },
    state: { ...DEFAULT_STATE },
    observerState: { retry_counts: {} },
    runs: [],
    needsMetaObserver: false,
  });
  assert.ok(actions.some((a) => a.reason.includes("red benchmarks")));
  assert.equal(actions.filter((a) => a.agentId === "bug_fixer").length, 1);
});

test("buildRemediations dispatches swarm_pr_ci_red when only agent PRs fail", () => {
  const actions = buildRemediations({
    findings: [],
    briefing: {
      ci_bug_triage: { swarm_work_queue: [{ repo: "lic", number: 7, reason: "GHA fail" }] },
    },
    state: { ...DEFAULT_STATE },
    observerState: { retry_counts: {} },
    runs: [],
    needsMetaObserver: false,
  });
  assert.ok(
    actions.some(
      (a) => a.agentId === "bug_fixer" && a.reason.includes("swarm agent PR"),
    ),
  );
});
