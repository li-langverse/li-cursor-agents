import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentStatusMap } from "./agent-status.js";

test("buildAgentStatusMap marks in_progress queue items as running", () => {
  const map = buildAgentStatusMap(
    {
      total: 1,
      roster: [{ id: "proof_gap_researcher", name: "P", description: "", role: "leaf" }],
    },
    {},
    { runtime: { async_swarm_running: true, active_runs: [] } },
    {
      queue: [
        {
          id: "r1",
          agent_id: "proof_gap_researcher",
          source: "research_focus",
          priority: 70,
          reason: "focus",
          status: "in_progress",
        },
      ],
      by_agent: {},
    },
  );
  assert.equal(map.get("proof_gap_researcher")?.status, "running");
});
