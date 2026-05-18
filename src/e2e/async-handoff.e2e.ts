/**
 * Async handoff flow without supervisor — research session + implement placement gate.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHandoff, listHandoffs, updateHandoff } from "../handoffs/handoff-store.js";
import { pickImplementLaneTarget } from "../lanes/implement-lane.js";
import { extractPackagePlacementFromOutput } from "../handoffs/post-run.js";
import { handoffReadyForImplement } from "../handoffs/placement-validator.js";
import { setupE2eEnv } from "./helpers.js";

describe("async handoff e2e (disk, no supervisor)", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  before(() => {
    env = setupE2eEnv("v1");
  });

  after(() => {
    env?.restoreEnv();
  });

  test("placement gate: architect then implementer", async () => {
    const h = await createHandoff({
      from_agent: "proof_gap_researcher",
      to_agents: ["package_architect", "code_implementer"],
      status: "pending_placement",
      research_goal_id: "provability_holes",
      north_star_fit: "Close G-42 trusted surface; domains: ecosystem; PH-2e",
      work: { summary: "trusted.lean audit step" },
    });
    assert.equal(h.status, "pending_placement");

    const arch = await pickImplementLaneTarget();
    assert.ok(arch);
    assert.equal(arch!.agentId, "package_architect");

    const placement = extractPackagePlacementFromOutput(
      'Decision:\n```json\n{"package_placement":{"action":"extend_existing","target":"lic","rationale":"fix contract in compiler tests"}}\n```',
    );
    assert.ok(placement);
    await updateHandoff(h.handoff_id, { package_placement: placement!, status: "pending" });

    const ready = (await listHandoffs({ status: "pending", toAgent: "code_implementer" }))[0];
    assert.ok(ready);
    assert.equal(handoffReadyForImplement(ready!), true);

    const impl = await pickImplementLaneTarget();
    assert.ok(impl);
    assert.equal(impl!.agentId, "code_implementer");
  });
});
