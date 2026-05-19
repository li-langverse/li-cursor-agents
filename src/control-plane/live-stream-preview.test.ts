import assert from "node:assert/strict";
import test from "node:test";
import type { AgentRunTrace } from "../agent-run-trace.js";
import { deriveLiveStreamPreview } from "./live-stream-preview.js";

test("deriveLiveStreamPreview prefers tool headline when tools ran", () => {
  const trace = {
    version: 1,
    assistant_text: "done chunk",
    thinking_text: "",
    file_edits: [],
    tool_call_count: 1,
    steps: [
      {
        type: "toolCall",
        message: { type: "readFile", args: { path: "src/foo.ts" } },
      },
    ],
    deltas: [],
  } as unknown as AgentRunTrace;
  const p = deriveLiveStreamPreview({ run_trace: trace });
  assert.match(p.headline, /^Tool:/);
  assert.match(p.detail, /foo/);
  assert.match(p.actionSummary, /tool/);
});

test("deriveLiveStreamPreview uses thinking before generic running", () => {
  const p = deriveLiveStreamPreview({
    run_trace: {
      version: 1,
      assistant_text: "",
      thinking_text: "planning the refactor",
      file_edits: [],
      tool_call_count: 0,
      steps: [],
      deltas: [],
    },
  });
  assert.equal(p.headline, "Thinking");
  assert.match(p.detail, /planning/);
});

test("deriveLiveStreamPreview never returns markdown Running placeholder", () => {
  const p = deriveLiveStreamPreview({});
  assert.notEqual(p.snippet, "_Running…_");
  assert.equal(p.headline, "Starting");
});
