/**
 * Goal implementation handoffs use lic workflow clone in mock mode.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { createHandoff } from "../handoffs/handoff-store.js";
import { implementLaneTick } from "../lanes/implement-lane.js";
import { loadLaneState, saveLaneState } from "../lanes/lane-state.js";

describe("goal lic workflow (mock)", () => {
  test("implement lane uses lic fixture workspace for goal_implementation", async () => {
    const root = agentsPackageRoot();
    const dir = join(root, "data", "handoffs");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pending.jsonl"), "", "utf8");

    saveLaneState({
      research_lane_enabled: false,
      implement_lane_enabled: true,
      goal_last_run_at: {},
    });

    await createHandoff({
      from_agent: "goal_researcher",
      to_agents: ["code_implementer"],
      status: "pending",
      research_goal_id: "game_engine_ux",
      research_session_id: "sess-e2e-game",
      north_star_fit: "Easy game engine + AI integration; domains: gaming, ai",
      work: {
        kind: "goal_implementation",
        target_repo: "lic",
        summary: "e2e lic workflow",
        goal_scaffold_path: "config/goal-scaffolds/game_engine_ux.md",
      },
    });

    const tick = await implementLaneTick({ mock: true });
    assert.equal(tick.skipped, false, JSON.stringify(tick));
    assert.equal(tick.agentId, "code_implementer");
    assert.equal(process.env.LI_REPO_WORKFLOW_REPO, "lic");
    const ws = process.env.LI_REPO_WORKFLOW_WORKSPACE ?? "";
    assert.ok(ws.includes("/lic/"), `expected lic workspace path, got ${ws}`);
  });
});
