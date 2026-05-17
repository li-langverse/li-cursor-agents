import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentRunTrace } from "../agent-run-trace.js";
import { aggregateRunTraceStats } from "./swarm-statistics.js";

test("aggregateRunTraceStats sums tools and line deltas", () => {
  const trace: AgentRunTrace = {
    version: 1,
    assistant_text: "",
    thinking_text: "",
    steps: [],
    deltas: [],
    tool_call_count: 5,
    file_edits: [
      { path: "src/a.li", tool: "edit", lines_added: 10, lines_removed: 2 },
      { path: "packages/li-std-foo/lip.toml", tool: "write", lines_added: 40, lines_removed: 0 },
    ],
  };
  const a = aggregateRunTraceStats(trace);
  assert.equal(a.tools, 5);
  assert.equal(a.edits, 2);
  assert.equal(a.lines_added, 50);
  assert.equal(a.lines_deleted, 2);
  assert.equal(a.packageRoots.has("li-std-foo"), true);
});
