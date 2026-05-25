import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  eventFromConversationStep,
  eventFromInteractionUpdate,
  skipTokenStreamDeltas,
} from "./run-events.js";

describe("run-events", () => {
  it("skipTokenStreamDeltas defaults on", () => {
    const prev = process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS;
    delete process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS;
    assert.equal(skipTokenStreamDeltas(), true);
    process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS = "0";
    assert.equal(skipTokenStreamDeltas(), false);
    if (prev === undefined) delete process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS;
    else process.env.LI_SDK_LOG_SKIP_TOKEN_DELTAS = prev;
  });

  it("skips token deltas for persistence", () => {
    assert.equal(
      eventFromInteractionUpdate({ type: "text-delta", text: "x" } as { type: "text-delta"; text: string }),
      null,
    );
    assert.equal(
      eventFromInteractionUpdate({ type: "thinking-delta", text: "t" } as {
        type: "thinking-delta";
        text: string;
      }),
      null,
    );
  });

  it("maps tool-call-started to structured event", () => {
    const row = eventFromInteractionUpdate({
      type: "tool-call-started",
      tool: "edit",
      args: { path: "src/foo.ts" },
    } as { type: "tool-call-started"; tool: string; args: { path: string } });
    assert.ok(row);
    assert.equal(row!.event_type, "tool_call_started");
    assert.equal(row!.payload.tool_name, "edit");
    assert.equal(row!.payload.path, "src/foo.ts");
  });

  it("maps toolCall step to file_edit", () => {
    const row = eventFromConversationStep({
      type: "toolCall",
      message: {
        type: "edit",
        args: { path: "a.md" },
        result: { status: "success" },
      },
    } as import("@cursor/sdk").ConversationStep);
    assert.ok(row);
    assert.equal(row!.event_type, "file_edit");
    assert.match(row!.payload.message, /✓/);
  });
});
