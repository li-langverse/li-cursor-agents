import assert from "node:assert/strict";
import test from "node:test";
import {
  consecutiveStaleReconcileStreak,
  researchGoalCircuitOpen,
  researchLaneInfraBlocked,
} from "./research-goal-circuit-breaker.js";
import { setAsyncSwarmRunning } from "../async-swarm/async-swarm-state.js";
import { UNREGISTERED_RUNNING_RECONCILED } from "../db/reconcile-error-categories.js";

test("consecutiveStaleReconcileStreak counts only leading reconcile errors", () => {
  const streak = consecutiveStaleReconcileStreak([
    { status: "error", error: UNREGISTERED_RUNNING_RECONCILED },
    { status: "error", error: "stale_running_reconciled" },
    { status: "finished" },
    { status: "error", error: UNREGISTERED_RUNNING_RECONCILED },
  ]);
  assert.equal(streak, 2);
});

test("researchGoalCircuitOpen trips after threshold reconcile errors", () => {
  const runs = Array.from({ length: 3 }, () => ({
    status: "error",
    error: UNREGISTERED_RUNNING_RECONCILED,
  }));
  const open = researchGoalCircuitOpen("provability_holes", runs);
  assert.equal(open.blocked, true);
  assert.match(open.reason ?? "", /provability_holes/);
});

test("researchGoalCircuitOpen allows dispatch when streak below threshold", () => {
  const runs = [
    { status: "error", error: UNREGISTERED_RUNNING_RECONCILED },
    { status: "finished" },
  ];
  assert.equal(researchGoalCircuitOpen("g1", runs).blocked, false);
});

test("researchLaneInfraBlocked when async swarm required but not running", () => {
  const prev = process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM;
  process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM = "1";
  setAsyncSwarmRunning(false);
  try {
    assert.equal(researchLaneInfraBlocked().blocked, true);
    setAsyncSwarmRunning(true);
    assert.equal(researchLaneInfraBlocked().blocked, false);
  } finally {
    setAsyncSwarmRunning(false);
    if (prev === undefined) delete process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM;
    else process.env.LI_RESEARCH_REQUIRE_ASYNC_SWARM = prev;
  }
});
