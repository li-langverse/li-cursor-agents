import { test } from "node:test";
import assert from "node:assert/strict";
import { handoffReadyForImplement } from "../handoffs/placement-validator.js";
import type { AgentHandoff } from "../handoffs/types.js";

test("implement lane accepts research scaffold handoff without package_placement", () => {
  const h: AgentHandoff = {
    handoff_id: "x",
    from_agent: "goal_researcher",
    to_agents: ["code_implementer"],
    status: "pending",
    north_star_fit: "CAD/geometry — kernels, packages, and Li std gaps",
    work: {
      kind: "goal_implementation",
      goal_scaffold_path: "config/goal-scaffolds/cad_fundamentals.md",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  assert.equal(handoffReadyForImplement(h), true);
});
