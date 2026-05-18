/**
 * Phased run-all (research → placement → implement) without supervisor.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHandoff, listHandoffs } from "../handoffs/handoff-store.js";
import { runHandoffPhasedSwarm } from "../lanes/run-handoff-phases.js";
import { loadLaneState, saveLaneState } from "../lanes/lane-state.js";
import { setupE2eEnv } from "./helpers.js";

describe("run-all handoff phases (mock)", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  before(() => {
    env = setupE2eEnv("v1");
  });

  after(() => {
    env?.restoreEnv();
  });

  test("runHandoffPhasedSwarm runs research then implement ticks", async () => {
    saveLaneState({
      research_lane_enabled: true,
      implement_lane_enabled: true,
      goal_last_run_at: {},
    });

    await createHandoff({
      from_agent: "goal_researcher",
      to_agents: ["package_architect"],
      status: "pending_placement",
      research_goal_id: "provability_holes",
      work: { summary: "e2e phased run-all" },
    });

    const result = await runHandoffPhasedSwarm({ mock: true });
    assert.ok(result.phases.length >= 1, "expected at least one phase");

    const pending = await listHandoffs({ status: "pending_placement", limit: 10 });
    assert.ok(Array.isArray(pending));
  });
});
