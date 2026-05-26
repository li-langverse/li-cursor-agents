import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { pickResearchLaneTarget, pickResearchWorkForAgent, researchLaneTick } from "./research-lane.js";
import { loadResearchGoals, pickNextGoalForAgent } from "../research-goals/load-goals.js";
import { loadLaneState, saveLaneState } from "./lane-state.js";

test("pickResearchLaneTarget returns highest-priority goal when no session", async () => {
  const sessionsDir = join(agentsPackageRoot(), "data", "research-sessions");
  rmSync(sessionsDir, { recursive: true, force: true });
  const state = loadLaneState();
  state.goal_last_run_at = {};
  saveLaneState(state);
  const target = await pickResearchLaneTarget();
  assert.ok(target);
  assert.ok(target.agentId);
  assert.ok(
    target.extra.includes("Research goal") || target.extra.includes("Continue session"),
  );
});

test("pickResearchWorkForAgent includes factory publish subdir for vertical goal", async () => {
  const sessionsDir = join(agentsPackageRoot(), "data", "research-sessions");
  rmSync(sessionsDir, { recursive: true, force: true });
  const state = loadLaneState();
  state.goal_last_run_at = {};
  saveLaneState(state);
  const goals = loadResearchGoals();
  const numerics = pickNextGoalForAgent("numerics_researcher", goals, {});
  assert.ok(numerics?.vertical);
  const work = await pickResearchWorkForAgent("numerics_researcher");
  assert.ok(work);
  assert.ok(work!.factoryContext?.publish_subdir?.includes(numerics!.id));
  assert.ok(work!.extra.includes("Publish subdir"));
});

test("researchLaneTick mock run completes", async () => {
  const lanesDir = join(agentsPackageRoot(), "data", "lanes");
  mkdirSync(lanesDir, { recursive: true });
  saveLaneState({
    research_lane_enabled: true,
    implement_lane_enabled: true,
    goal_last_run_at: {},
  });
  const tick = await researchLaneTick({ mock: true });
  assert.equal(tick.skipped, false);
  assert.ok(tick.agentId);
  rmSync(join(agentsPackageRoot(), "data", "handoffs"), { recursive: true, force: true });
});
