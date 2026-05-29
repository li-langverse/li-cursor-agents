/**
 * Parallel research agents respect infra + per-goal circuit breakers (no retry storms).
 */
import assert from "node:assert/strict";
import { describe, test, after, before } from "node:test";
import { setAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { researchLaneAgentIds } from "./lane-agent-ids.js";
import type { AgentId } from "../types.js";

const RESEARCH_AGENTS = [...researchLaneAgentIds()];
import { loadLaneState, saveLaneState } from "./lane-state.js";
import { pickResearchWorkForAgent, researchAgentWorkerCycle } from "./research-lane.js";
import { researchLaneInfraBlocked } from "./research-goal-circuit-breaker.js";
import { UNREGISTERED_RUNNING_RECONCILED } from "../db/reconcile-error-categories.js";

describe("research lane circuit breaker — parallel agents", () => {
  const prevRequire = process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM;
  const prevStreak = process.env.LI_RESEARCH_GOAL_RECONCILE_STREAK;
  const prevCadence = process.env.LI_RESEARCH_GOALS_PATH;

  before(() => {
    process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM = "1";
    process.env.LI_RESEARCH_GOAL_RECONCILE_STREAK = "2";
    setAsyncSwarmRunning(false);
    const state = loadLaneState();
    state.research_lane_enabled = true;
    state.goal_last_run_at = {};
    saveLaneState(state);
  });

  after(() => {
    setAsyncSwarmRunning(false);
    if (prevRequire === undefined) delete process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM;
    else process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM = prevRequire;
    if (prevStreak === undefined) delete process.env.LI_RESEARCH_GOAL_RECONCILE_STREAK;
    else process.env.LI_RESEARCH_GOAL_RECONCILE_STREAK = prevStreak;
    if (prevCadence === undefined) delete process.env.LI_RESEARCH_GOALS_PATH;
    else process.env.LI_RESEARCH_GOALS_PATH = prevCadence;
  });

  test("parallel pickResearchWorkForAgent returns null when async swarm is down", async () => {
    const results = await Promise.all(
      RESEARCH_AGENTS.map((agentId: AgentId) => pickResearchWorkForAgent(agentId)),
    );
    assert.ok(results.every((r) => r === null), "expected no work while async swarm is off");
  });

  test("parallel researchAgentWorkerCycle skips with infra reason", async () => {
    const cycles = await Promise.all(
      RESEARCH_AGENTS.map((agentId: AgentId) =>
        researchAgentWorkerCycle(agentId, { mock: true }),
      ),
    );
    assert.equal(cycles.length, RESEARCH_AGENTS.length);
    for (const cycle of cycles) {
      assert.equal(cycle.skipped, true);
      assert.match(cycle.skip_reason ?? "", /async_swarm_running/i);
    }
  });

  test("force bypasses async swarm infra block without starting a run", () => {
    setAsyncSwarmRunning(false);
    assert.equal(researchLaneInfraBlocked().blocked, true);
    assert.equal(researchLaneInfraBlocked({ force: true }).blocked, false);
  });

  test("goal circuit opens after consecutive reconcile errors (pure)", async () => {
    const { researchGoalCircuitOpen } = await import("./research-goal-circuit-breaker.js");
    const runs = [
      { status: "error", error: UNREGISTERED_RUNNING_RECONCILED },
      { status: "error", error: UNREGISTERED_RUNNING_RECONCILED },
    ];
    assert.equal(researchGoalCircuitOpen("provability_holes", runs).blocked, true);
  });
});
