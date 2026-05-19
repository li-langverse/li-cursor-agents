import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveAgentRows } from "./live-agents.js";

test("buildLiveAgentRows lists running SDK runs with run id", () => {
  const rows = buildLiveAgentRows(
    { total: 1, roster: [{ id: "orchestrator", name: "Orchestrator", description: "", role: "leaf" }] },
    {
      runtime: {
        active_runs: [
          {
            run_id: "orchestrator-1",
            agent_id: "orchestrator",
            started_at: new Date().toISOString(),
            status: "running",
            reason: "runAgent",
          },
        ],
      },
    },
    { queue: [], by_agent: {} },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.runId, "orchestrator-1");
  assert.equal(rows[0]?.headline, "Starting");
});

test("buildLiveAgentRows uses trace-derived headline when run_trace present", () => {
  const rows = buildLiveAgentRows(
    { total: 1, roster: [{ id: "orchestrator", name: "Orchestrator", description: "", role: "leaf" }] },
    {
      runtime: {
        active_runs: [
          {
            run_id: "orchestrator-1",
            agent_id: "orchestrator",
            started_at: new Date().toISOString(),
            status: "running",
            run_trace: {
              assistant_text: "Checking swarm health",
              tool_call_count: 0,
            },
          },
        ],
      },
    },
    { queue: [], by_agent: {} },
  );
  assert.equal(rows[0]?.headline, "Writing");
  assert.match(rows[0]?.detail ?? "", /swarm/i);
});
