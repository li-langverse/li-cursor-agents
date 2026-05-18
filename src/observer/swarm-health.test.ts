import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { scanSwarmHealth } from "./swarm-health.js";
import { DEFAULT_STATE } from "../control-plane/types.js";
import type { AgentRunResult } from "../types.js";

function run(agentId: string, status: AgentRunResult["status"]): AgentRunResult {
  return {
    agentId: agentId as AgentRunResult["agentId"],
    backend: "mock",
    status,
    durationMs: 1,
    outputPath: "",
  };
}

describe("scanSwarmHealth", () => {
  test("flags error streak and schedules retry", () => {
    const runs = [run("bug_fixer", "error"), run("bug_fixer", "error"), run("gap_explorer", "finished")];
    const health = scanSwarmHealth({
      state: { ...DEFAULT_STATE },
      briefing: { recommended_agents: [{ agent: "gap_explorer", reason: "explore" }] },
      observerState: { retry_counts: {} },
      recentRuns: runs,
    });
    assert.ok(health.findings.some((f) => f.kind === "agent_error_streak"));
    assert.ok(health.remediations.some((r) => r.agentId === "bug_fixer" && r.kind === "retry_agent"));
  });

  test("schedules swarm_observer when error rate high", () => {
    const runs = [
      run("bug_fixer", "error"),
      run("ci_maintainer", "error"),
      run("docs_maintainer", "error"),
      run("pr_alignment", "error"),
    ];
    const health = scanSwarmHealth({
      state: { ...DEFAULT_STATE },
      briefing: {},
      observerState: { retry_counts: {} },
      recentRuns: runs,
    });
    assert.equal(health.needs_meta_observer, true);
    assert.ok(health.remediations.some((r) => r.agentId === "swarm_observer"));
  });
});
