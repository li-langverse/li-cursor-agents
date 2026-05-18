import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY, listAgentsPublic } from "./registry.js";

test("registry lists every leaf agent for dashboard roster", () => {
  const publicIds = new Set(listAgentsPublic().map((a) => a.id));
  for (const def of AGENT_REGISTRY) {
    assert.ok(publicIds.has(def.id), `missing from listAgentsPublic: ${def.id}`);
  }
});

test("orchestrator is only root agent without heap leaf role", () => {
  const orchestrator = AGENT_REGISTRY.find((a) => a.id === "orchestrator");
  assert.ok(orchestrator);
  const leaves = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");
  assert.equal(leaves.length, AGENT_REGISTRY.length - 1);
  assert.ok(leaves.length >= 20, "expected full agent roster");
});
