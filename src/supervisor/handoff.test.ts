import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHandoffInstruction, summarizeRunForHandoff } from "./handoff.js";
import type { AgentRunResult } from "../types.js";

test("buildHandoffInstruction chains prior agents", () => {
  const block = buildHandoffInstruction(
    [
      {
        agentId: "pr_alignment",
        reason: "align open PRs",
        status: "finished",
        summary: "Reviewed benchmarks#47",
        pr_urls: ["https://github.com/li-langverse/benchmarks/pull/47"],
      },
    ],
    { fingerprint: "x", agentId: "pr_reviewer", reason: "review queue", source: "recommended" },
  );
  assert.ok(block?.includes("pr_alignment"));
  assert.ok(block?.includes("pull/47"));
  assert.ok(block?.includes("duplicate"));
});

test("summarizeRunForHandoff prefers executive summary", () => {
  const result = {
    agentId: "gap_explorer",
    outputText: "## Executive summary\n- Found catalog gap in lic.\n\n## Deferred\n- more",
    status: "finished",
  } as AgentRunResult;
  const s = summarizeRunForHandoff(result);
  assert.match(s, /catalog gap/i);
});
