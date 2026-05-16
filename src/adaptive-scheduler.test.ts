import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAgents } from "./adaptive-scheduler.js";
import type { RunHistory, CycleRecord } from "./history.js";

function makeHistory(cycles: Partial<CycleRecord>[]): RunHistory {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    cycles: cycles.map((c) => ({
      cycleId: c.cycleId ?? `cycle-${Date.now()}`,
      startedAt: c.startedAt ?? new Date().toISOString(),
      agentsRun: c.agentsRun ?? [],
      results: c.results ?? [],
      ...c,
    })),
  };
}

test("decideAgents returns default set on empty history", () => {
  const empty: RunHistory = { version: 1, lastUpdated: "", cycles: [] };
  const decision = decideAgents(empty);
  assert.ok(decision.agents.includes("orchestrator"));
  assert.ok(decision.agents.length >= 3);
  assert.ok(decision.reasoning.length > 0);
});

test("decideAgents always includes orchestrator", () => {
  const h = makeHistory([
    {
      agentsRun: ["ecosystem_explorer"],
      results: [
        {
          agentId: "ecosystem_explorer",
          backend: "mock",
          status: "finished",
          durationMs: 100,
          timestamp: new Date().toISOString(),
          outputPath: "/tmp/test.md",
          findings: ["a", "b", "c", "d"],
        },
      ],
    },
  ]);
  const decision = decideAgents(h, { maxAgents: 2 });
  assert.ok(decision.agents.includes("orchestrator"));
});

test("decideAgents prioritizes agents not recently run", () => {
  const h = makeHistory([
    {
      agentsRun: ["orchestrator", "ecosystem_explorer", "pr_alignment"],
      results: [
        { agentId: "orchestrator", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
        { agentId: "ecosystem_explorer", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
        { agentId: "pr_alignment", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
      ],
    },
  ]);
  const decision = decideAgents(h, { maxAgents: 5 });
  const notRun = ["implementation_gaps", "plan_completion", "issue_planner", "pr_review", "numerics_research", "self_improve"];
  const selectedNotRun = decision.agents.filter((a) => notRun.includes(a));
  assert.ok(selectedNotRun.length >= 2, "Should prioritize agents not recently run");
});

test("decideAgents respects forceInclude", () => {
  const h = makeHistory([
    {
      agentsRun: ["orchestrator"],
      results: [
        { agentId: "orchestrator", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: ["a", "b", "c", "d", "e"] },
      ],
    },
  ]);
  const decision = decideAgents(h, { maxAgents: 3, forceInclude: ["numerics_research"] });
  assert.ok(decision.agents.includes("numerics_research"));
});

test("decideAgents prioritizes errored agents for retry", () => {
  const h = makeHistory([
    {
      agentsRun: ["orchestrator", "pr_review", "ecosystem_explorer", "implementation_gaps", "plan_completion"],
      results: [
        { agentId: "orchestrator", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
        { agentId: "pr_review", backend: "mock", status: "error", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
        { agentId: "ecosystem_explorer", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
        { agentId: "implementation_gaps", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
        { agentId: "plan_completion", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
      ],
    },
  ]);
  const decision = decideAgents(h, { maxAgents: 5 });
  assert.ok(decision.agents.includes("pr_review"), "Should retry errored agents");
});

test("decideAgents uses nextPriorities from last cycle", () => {
  const h = makeHistory([
    {
      agentsRun: ["orchestrator"],
      results: [
        { agentId: "orchestrator", backend: "mock", status: "finished", durationMs: 1, timestamp: new Date().toISOString(), outputPath: "", findings: [] },
      ],
      nextPriorities: ["numerics_research", "implementation_gaps"],
    },
  ]);
  const decision = decideAgents(h, { maxAgents: 4 });
  assert.ok(
    decision.agents.includes("numerics_research") || decision.agents.includes("implementation_gaps"),
    "Should use nextPriorities from last cycle",
  );
});
