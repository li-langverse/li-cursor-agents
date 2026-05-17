import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import {
  enqueueImplementationHandoff,
  goalAllowsImplementation,
  loadGoalScaffold,
} from "./implementation-handoff.js";
import { listHandoffs } from "./handoff-store.js";
import { handoffReadyForImplement } from "./placement-validator.js";

test("goalAllowsImplementation true for game_engine_ux", () => {
  assert.equal(goalAllowsImplementation("game_engine_ux"), true);
  assert.equal(goalAllowsImplementation("numerics_sota"), false);
});

test("loadGoalScaffold returns markdown", () => {
  const text = loadGoalScaffold("game_engine_ux");
  assert.ok(text?.includes("proof"));
});

test("enqueueImplementationHandoff dedupes and skips non-allow goals", async () => {
  rmSync(join(agentsPackageRoot(), "data", "handoffs"), { recursive: true, force: true });
  const first = await enqueueImplementationHandoff({
    goalId: "cad_fundamentals",
    sessionId: "sess-1",
    fromAgent: "goal_researcher",
  });
  assert.ok(first?.handoff_id);
  assert.equal(handoffReadyForImplement(first!), true);
  const second = await enqueueImplementationHandoff({
    goalId: "cad_fundamentals",
    sessionId: "sess-1",
    fromAgent: "goal_researcher",
  });
  assert.equal(second, null);
  const rows = await listHandoffs({ status: "pending", toAgent: "code_implementer", limit: 5 });
  assert.equal(rows.length, 1);
});
