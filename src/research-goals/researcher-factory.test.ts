import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESEARCH_VERTICALS,
  buildResearchGoalsFromFactory,
  listVerticalSlugs,
  researchLaneAgentsFromFactory,
  researchLongRunAgentIds,
  NUMERICS_VERTICAL_SLUGS,
  whitepaperPathForGoal,
} from "./researcher-factory.js";
import { resolveGoalAgent } from "./load-goals.js";
import { researchLaneAgentIds } from "../lanes/lane-agent-ids.js";

const USER_VERTICALS = [
  "numerics",
  "physics",
  "md",
  "chemistry",
  "biology",
  "bioengineering",
  "engineering",
  "additive",
  "robotics",
  "gaming",
  "database",
  "server",
  "machine_learning",
  "deep_learning",
  "reinforcement_learning",
  "simulation_science",
  "scientific_distributed_computing",
  "ai",
  "agentic_ai",
] as const;

test("factory defines exactly 19 user verticals", () => {
  assert.equal(RESEARCH_VERTICALS.length, 19);
  assert.equal(listVerticalSlugs().length, 19);
  const slugs = new Set(listVerticalSlugs());
  assert.equal(slugs.size, 19, "duplicate vertical slugs");
  for (const v of USER_VERTICALS) {
    assert.ok(slugs.has(v), `missing vertical: ${v}`);
  }
});

test("every vertical goal has unique goalId and publish path", () => {
  const goals = buildResearchGoalsFromFactory().filter((g) => g.vertical);
  const ids = new Set<string>();
  for (const g of goals) {
    assert.ok(!ids.has(g.id), `duplicate goal id: ${g.id}`);
    ids.add(g.id);
    assert.equal(g.publish_repo, "research-findings");
    assert.ok(g.whitepaper_root?.includes("research-findings"));
    const path = whitepaperPathForGoal(g.id);
    assert.match(path, new RegExp(`${g.id}/$`));
  }
});

test("numerics vertical slugs use numerics_researcher", () => {
  for (const spec of RESEARCH_VERTICALS) {
    const expected = NUMERICS_VERTICAL_SLUGS.has(spec.slug)
      ? "numerics_researcher"
      : "goal_researcher";
    assert.equal(spec.agentId, expected, `agent mismatch for ${spec.slug}`);
  }
});

test("autoresearch is not a vertical goal", () => {
  const goals = buildResearchGoalsFromFactory();
  assert.ok(!goals.some((g) => g.agent === "autoresearch"));
  const longRun = researchLongRunAgentIds();
  assert.ok(longRun.includes("autoresearch"));
  assert.equal(
    goals.filter((g) => g.vertical).length,
    19,
  );
});

test("researchLongRunAgentIds includes gap_explorer and both researcher agents", () => {
  const ids = researchLongRunAgentIds();
  assert.ok(ids.includes("gap_explorer"));
  assert.ok(ids.includes("numerics_researcher"));
  assert.ok(ids.includes("goal_researcher"));
  assert.ok(ids.includes("autoresearch"));
});

test("researchLaneAgentIds matches factory union", () => {
  const fromLane = researchLaneAgentIds();
  const fromFactory = researchLaneAgentsFromFactory();
  for (const id of fromFactory) {
    assert.ok(fromLane.has(id), `lane missing agent ${id}`);
  }
  assert.ok(fromLane.has("numerics_researcher"));
  assert.ok(fromLane.has("goal_researcher"));
  assert.ok(fromLane.has("gap_explorer"));
});

test("physics and md factory goals use numerics_researcher", () => {
  const goals = buildResearchGoalsFromFactory();
  assert.equal(goals.find((g) => g.id === "physics_sim")?.agent, "numerics_researcher");
  assert.equal(goals.find((g) => g.id === "md_sim_algorithms")?.agent, "numerics_researcher");
  assert.equal(resolveGoalAgent(goals.find((g) => g.id === "biology_systems")!), "goal_researcher");
});
