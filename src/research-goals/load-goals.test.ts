import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadResearchGoals,
  pickNextGoal,
  pickNextGoalForAgent,
  resolveGoalAgent,
} from "./load-goals.js";

test("loadResearchGoals reads committed yaml", () => {
  const goals = loadResearchGoals();
  assert.ok(goals.length >= 5);
  const proof = goals.find((g) => g.id === "provability_holes");
  assert.ok(proof);
  assert.equal(proof?.agent, "proof_gap_researcher");
});

test("pickNextGoal respects cadence", () => {
  const goals = loadResearchGoals();
  const now = Date.now();
  const picked = pickNextGoal(goals, { provability_holes: new Date(now).toISOString() }, now);
  assert.ok(picked);
  assert.notEqual(picked?.id, "provability_holes");
});

test("pickNextGoalForAgent scopes goals to one agent", () => {
  const goals = loadResearchGoals();
  const now = Date.now();
  const numericsLastRun: Record<string, string> = {};
  for (const g of goals) {
    if (resolveGoalAgent(g) === "numerics_researcher" && g.id !== "numerics_sota") {
      numericsLastRun[g.id] = new Date(now).toISOString();
    }
  }
  const numerics = pickNextGoalForAgent("numerics_researcher", goals, numericsLastRun, now);
  const proof = pickNextGoalForAgent("proof_gap_researcher", goals, {});
  assert.equal(numerics?.id, "numerics_sota");
  assert.equal(proof?.id, "provability_holes");
});

test("simulation_science goal uses numerics_researcher", () => {
  const goals = loadResearchGoals();
  const sim = goals.find((g) => g.id === "simulation_techniques");
  assert.ok(sim);
  assert.equal(sim?.vertical, "simulation_science");
  assert.equal(resolveGoalAgent(sim!), "numerics_researcher");
});

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

test("every user vertical has an enabled goal with vertical slug", () => {
  const goals = loadResearchGoals();
  const byVertical = new Map(goals.filter((g) => g.vertical).map((g) => [g.vertical!, g]));
  assert.equal(byVertical.size, USER_VERTICALS.length, "unexpected duplicate vertical slugs");
  for (const v of USER_VERTICALS) {
    const g = byVertical.get(v);
    assert.ok(g, `missing goal for vertical: ${v}`);
    assert.notEqual(g?.enabled, false);
    assert.equal(g?.publish_repo, "research-findings");
  }
});

test("research lane includes goal_researcher and numerics_researcher from vertical goals", () => {
  const goals = loadResearchGoals().filter((g) => g.vertical);
  const agents = new Set(goals.map((g) => resolveGoalAgent(g)));
  assert.ok(agents.has("numerics_researcher"));
  assert.ok(agents.has("goal_researcher"));
});

test("physics and md goals use numerics_researcher", () => {
  const goals = loadResearchGoals();
  assert.equal(goals.find((g) => g.id === "physics_sim")?.agent, "numerics_researcher");
  assert.equal(goals.find((g) => g.id === "md_sim_algorithms")?.agent, "numerics_researcher");
});
