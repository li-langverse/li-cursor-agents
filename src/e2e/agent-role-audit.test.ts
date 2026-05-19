import assert from "node:assert/strict";
import test from "node:test";
import { auditAgentRun } from "./agent-role-audit.js";
import type { AgentRunResult } from "../types.js";

function mockResult(
  agentId: string,
  outputText: string,
  overrides?: Partial<AgentRunResult>,
): AgentRunResult {
  return {
    agentId,
    backend: "mock",
    status: "finished",
    durationMs: 1,
    outputPath: `/tmp/${agentId}-1.md`,
    outputText,
    runInput: {
      version: 1,
      agent_id: agentId,
      backend: "mock",
      system_prompt: "sys",
      user_message: "user",
      cwd: "/bench",
      dry_run: false,
      mock: true,
    },
    trace: {
      version: 1,
      assistant_text: outputText,
      thinking_text: "",
      file_edits: [],
      tool_call_count: 0,
      steps: [{ type: "assistantMessage", message: { text: "ok" } }],
      deltas: [],
    },
    ...overrides,
  };
}

test("auditAgentRun accepts plan_verifier mock shape", () => {
  const r = mockResult(
    "plan_verifier",
    "## Executive summary\n- audit\n## Tracker review\n- PH-1\n<!-- li-agent-role: plan_verifier -->",
  );
  const a = auditAgentRun("plan_verifier", r, { benchmarksRoot: "/bench" });
  assert.equal(a.ok, true, a.violations.join(", "));
});

test("auditAgentRun rejects wrong role content", () => {
  const r = mockResult(
    "plan_verifier",
    "## Executive summary\n- only merge queue\n<!-- li-agent-role: plan_verifier -->",
  );
  const a = auditAgentRun("plan_verifier", r);
  assert.equal(a.ok, false);
  assert.ok(a.violations.some((v) => v.includes("role-specific")));
});

test("auditAgentRun accepts numerics_researcher markers", () => {
  const r = mockResult(
    "numerics_researcher",
    "## Executive summary\n- numerics bench tier-1\n<!-- li-agent-role: numerics_researcher -->",
  );
  assert.ok(auditAgentRun("numerics_researcher", r).ok);
});
