import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSwarmRecommendations, swarmRecommendationsFromBriefing } from "./swarm-recommendations.js";

test("swarmRecommendationsFromBriefing suggests architect and implementer", () => {
  const rec = swarmRecommendationsFromBriefing({
    swarm_scorecard: { pending_placement: 2, ready_to_implement: 1 },
    handoff_audit: { missing_north_star_fit: [] },
  });
  assert.ok(rec.some((r) => r.agent === "package_architect"));
  assert.ok(rec.some((r) => r.agent === "code_implementer"));
});

test("mergeSwarmRecommendations prepends without duplicate agents", () => {
  const out = mergeSwarmRecommendations({
    swarm_scorecard: { pending_placement: 1, ready_to_implement: 0 },
    recommended_agents: [{ agent: "package_architect", reason: "existing" }],
  });
  const agents = (out.recommended_agents as Array<{ agent: string }>).map((r) => r.agent);
  assert.equal(agents.filter((a) => a === "package_architect").length, 1);
  assert.ok(out.swarm_recommendations_merged_at);
});
