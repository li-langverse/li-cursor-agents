import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { pickResearchLaneTarget, researchLaneTick } from "./research-lane.js";
import { loadLaneState, saveLaneState } from "./lane-state.js";

test("pickResearchLaneTarget returns highest-priority goal when no session", async () => {
  const state = loadLaneState();
  state.goal_last_run_at = {};
  saveLaneState(state);
  const target = await pickResearchLaneTarget();
  assert.ok(target);
  assert.ok(target.agentId);
  assert.ok(target.extra.includes("Research"));
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
