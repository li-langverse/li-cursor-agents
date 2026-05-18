import assert from "node:assert/strict";
import test from "node:test";
import { parseStatusResponse } from "./status-payload.js";

test("parseStatusResponse merges top-level async_swarm_running into runtime", () => {
  const p = parseStatusResponse({
    async_swarm_running: true,
    agent_backend: "mock",
    runtime: { active_run_count: 2, store: "supabase" },
  });
  assert.equal(p.runtime?.async_swarm_running, true);
  assert.equal(p.runtime?.store, "supabase");
  assert.equal(p.agent_backend, "mock");
  assert.equal(p.error, undefined);
});
