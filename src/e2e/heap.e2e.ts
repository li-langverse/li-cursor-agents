import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { buildHeapPlan } from "../heap/plan.js";
import { MAX_AGENTS_PER_COORDINATOR, MAX_COORDINATORS_PER_ROOT } from "../heap/constants.js";
import { COORDINATOR_REGISTRY } from "../heap/coordinators.js";

describe("heap planner (Agentron-style)", () => {
  test("all leaf agents map to a coordinator", () => {
    const leaves = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");
    const recommended = leaves.map((a) => ({ agent: a.id, reason: `e2e: ${a.id}` }));
    const plan = buildHeapPlan(recommended);
    assert.equal(plan.validation_errors.length, 0);
    assert.equal(plan.flat_tasks.length, leaves.length);
    for (const c of COORDINATOR_REGISTRY) {
      assert.ok(c.leafAgents.length <= MAX_AGENTS_PER_COORDINATOR);
    }
    assert.ok(plan.priority_order.length <= MAX_COORDINATORS_PER_ROOT);
  });

  test("13 agents fit under coordinator caps", () => {
    const rec = [
      { agent: "pr_alignment", reason: "a" },
      { agent: "pr_reviewer", reason: "b" },
      { agent: "pr_merger", reason: "c" },
      { agent: "numerics_researcher", reason: "d" },
      { agent: "bench_improver", reason: "e" },
      { agent: "autoresearch", reason: "f" },
      { agent: "plan_verifier", reason: "g" },
      { agent: "implementation_gaps", reason: "h" },
      { agent: "issue_planner", reason: "i" },
      { agent: "gap_explorer", reason: "j" },
      { agent: "docs_maintainer", reason: "k" },
      { agent: "ci_maintainer", reason: "l" },
    ];
    const plan = buildHeapPlan(rec);
    assert.equal(plan.validation_errors.length, 0);
    assert.equal(plan.layers.length, 5);
    for (const layer of plan.layers) {
      assert.ok(layer.agents.length <= MAX_AGENTS_PER_COORDINATOR);
    }
  });
});
