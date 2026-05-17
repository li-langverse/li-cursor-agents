import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ConversationStep } from "@cursor/sdk";
import {
  buildMockTrace,
  buildRunInput,
  extractFileEdits,
  createTraceCollector,
} from "./agent-run-trace.js";

describe("agent-run-trace", () => {
  it("buildRunInput captures prompts", () => {
    const input = buildRunInput({
      agentId: "gap_explorer",
      backend: "mock",
      systemPrompt: "sys",
      userMessage: "user",
      cwd: "/tmp",
      dryRun: false,
      mock: true,
    });
    assert.equal(input.system_prompt, "sys");
    assert.equal(input.user_message, "user");
    assert.equal(input.agent_id, "gap_explorer");
  });

  it("extractFileEdits finds edit and write paths", () => {
    const steps = [
      {
        type: "toolCall",
        message: {
          type: "edit",
          args: { path: "src/foo.ts" },
          result: { status: "success", value: { linesAdded: 1 } },
        },
      },
      {
        type: "toolCall",
        message: {
          type: "write",
          args: { path: "README.md" },
          result: { status: "success" },
        },
      },
    ] as ConversationStep[];
    const edits = extractFileEdits(steps);
    assert.equal(edits.length, 2);
    assert.equal(edits[0].path, "src/foo.ts");
    assert.equal(edits[0].tool, "edit");
  });

  it("mock trace includes thinking and file edits", () => {
    const trace = buildMockTrace({
      definitionId: "gap_explorer",
      assistantText: "done",
      userMessage: "run",
      cwd: "/bench",
    });
    assert.ok(trace.thinking_text.includes("mock"));
    assert.ok(trace.file_edits.length >= 1);
    assert.ok(trace.steps.length >= 3);
  });

  it("collector records deltas and steps", () => {
    const c = createTraceCollector();
    c.onDelta({
      update: { type: "text-delta", text: "hello" } as import("@cursor/sdk").InteractionUpdate,
    });
    c.onStep({
      step: {
        type: "assistantMessage",
        message: { text: "hello" },
      } as ConversationStep,
    });
    const trace = c.finalize("hello");
    assert.equal(trace.assistant_text, "hello");
    assert.equal(trace.deltas.length, 1);
    assert.equal(trace.steps.length, 1);
  });
});
