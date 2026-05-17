import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGoalScaffoldBlock } from "./goal-scaffold-prompt.js";
import type { AgentHandoff } from "./types.js";

const base: AgentHandoff = {
  handoff_id: "h1",
  from_agent: "goal_researcher",
  to_agents: ["code_implementer"],
  status: "pending",
  north_star_fit: "Easy game engine — domains: gaming, ai",
  work: { goal_scaffold_path: "config/goal-scaffolds/game_engine_ux.md" },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

test("buildGoalScaffoldBlock includes scaffold heading", () => {
  const block = buildGoalScaffoldBlock(base);
  assert.ok(block.includes("Goal scaffold"));
  assert.ok(block.includes("proof"));
});
