import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeltaRows,
  deltaTypeLabel,
  formatDeltaPayload,
  hasLiveTraceContent,
  toolStepTargetLabel,
  toolStepsFromTrace,
} from "./live-stream-display.js";

test("formatDeltaPayload extracts text field", () => {
  assert.equal(formatDeltaPayload({ text: "hello" }), "hello");
});

test("deltaTypeLabel maps SDK types", () => {
  assert.equal(deltaTypeLabel("thinking-delta"), "Thinking");
  assert.equal(deltaTypeLabel("text-delta"), "Assistant");
});

test("hasLiveTraceContent true when thinking present without deltas", () => {
  assert.equal(
    hasLiveTraceContent({ thinking_text: "Planning pass…", deltas: [] }),
    true,
  );
});

test("buildDeltaRows prefers trace deltas over stream events", () => {
  const rows = buildDeltaRows(
    [{ seq: 1, at: "t", type: "text-delta", payload: { text: "x" } }],
    [{ seq: 0, event_type: "stream_other", payload: {} }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.label, "Assistant");
  assert.equal(rows[0]!.body, "x");
});

test("toolStepTargetLabel prefers path then command", () => {
  assert.equal(
    toolStepTargetLabel({ type: "read", args: { path: "data/briefing.json" } }),
    "data/briefing.json",
  );
  assert.equal(toolStepTargetLabel({ type: "shell", args: { command: "npm test" } }), "npm test");
  assert.equal(toolStepTargetLabel({ type: "grep" }), "grep");
});

test("toolStepsFromTrace keeps only toolCall steps", () => {
  const steps = toolStepsFromTrace({
    steps: [
      { type: "toolCall", message: { type: "read", args: { path: "x" } } },
      { type: "thinking", message: { type: "note" } },
    ],
  });
  assert.equal(steps.length, 1);
  assert.equal(toolStepTargetLabel(steps[0]!.message), "x");
});
