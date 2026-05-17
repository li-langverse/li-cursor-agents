import { test } from "node:test";
import assert from "node:assert/strict";
import { loadResearchGoals, pickNextGoal, resolveGoalAgent } from "./load-goals.js";

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

test("resolveGoalAgent defaults to goal_researcher", () => {
  const goals = loadResearchGoals();
  const sim = goals.find((g) => g.id === "simulation_techniques");
  assert.ok(sim);
  assert.equal(resolveGoalAgent(sim!), "goal_researcher");
});
