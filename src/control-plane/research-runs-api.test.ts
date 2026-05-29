import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveResearchRunSummary,
  RESEARCH_DASHBOARD_AGENT_IDS,
  researchErrorCategory,
} from "./research-runs-api.js";
import type { AgentRunTrace } from "../agent-run-trace.js";

test("RESEARCH_DASHBOARD_AGENT_IDS includes core researchers", () => {
  for (const id of [
    "numerics_researcher",
    "goal_researcher",
    "gap_explorer",
    "autoresearch",
    "proof_gap_researcher",
    "stdlib_researcher",
  ]) {
    assert.ok(RESEARCH_DASHBOARD_AGENT_IDS.includes(id as (typeof RESEARCH_DASHBOARD_AGENT_IDS)[number]));
  }
});

test("researchErrorCategory normalizes known errors", () => {
  assert.equal(researchErrorCategory("stale_running_reconciled"), "stale_running_reconciled");
  assert.equal(
    researchErrorCategory("unregistered_running_reconciled"),
    "unregistered_running_reconciled",
  );
  assert.equal(researchErrorCategory("sdk-session.lock timeout"), "sdk_slot_timeout");
  assert.equal(researchErrorCategory(""), null);
});

test("deriveResearchRunSummary prefers assistant tail from trace", () => {
  const trace: AgentRunTrace = {
    version: 1,
    assistant_text: "Opened benchmarks. Found gap in PME. Recommend whitepaper update.",
    thinking_text: "",
    steps: [],
    deltas: [],
    file_edits: [],
    tool_call_count: 0,
  };
  const summary = deriveResearchRunSummary({
    status: "finished",
    run_trace: trace,
    run_input: { research_goal_id: "physics_sim", research_vertical: "physics" } as never,
  });
  assert.match(summary, /whitepaper|PME|gap/i);
});

test("deriveResearchRunSummary surfaces error category", () => {
  const summary = deriveResearchRunSummary({
    status: "error",
    error: "stale_running_reconciled",
  });
  assert.match(summary, /stale_running_reconciled/i);
});

test("deriveResearchRunSummary uses markdown heading", () => {
  const summary = deriveResearchRunSummary({
    status: "finished",
    output_md: "# MD integrator SOTA\n\nBody text.",
  });
  assert.equal(summary, "MD integrator SOTA");
});
