import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunResult } from "@cursor/sdk";
import {
  formatSdkRunError,
  shouldRetrySdkRun,
  sdkMaxAttempts,
} from "./cursor-sdk-backend.js";
import type { AgentRunTrace } from "../agent-run-trace.js";

test("shouldRetrySdkRun on instant error with zero tools", () => {
  const result = { id: "r1", status: "error" as const };
  const trace = {
    version: 1 as const,
    assistant_text: "",
    thinking_text: "",
    steps: [],
    deltas: [],
    file_edits: [],
    tool_call_count: 0,
  };
  assert.equal(shouldRetrySdkRun(result, trace, 1800), true);
});

test("shouldRetrySdkRun false when finished", () => {
  const result = { id: "r1", status: "finished" as const, result: "ok" };
  const trace: AgentRunTrace = {
    version: 1,
    assistant_text: "ok",
    thinking_text: "",
    steps: [],
    deltas: [],
    file_edits: [],
    tool_call_count: 2,
  };
  assert.equal(shouldRetrySdkRun(result, trace, 30_000), false);
});

test("formatSdkRunError includes attempt metadata", () => {
  const result: RunResult = { id: "bc-abc", status: "error" };
  const msg = formatSdkRunError(result, {
    attempt: 2,
    force: true,
    modelId: "default",
    durationMs: 1500,
    toolCalls: 0,
    status: "error",
    runId: "bc-abc",
  });
  assert.match(msg, /attempt=2/);
  assert.match(msg, /force=true/);
  assert.match(msg, /run_id=bc-abc/);
});

test("sdkMaxAttempts respects env cap", () => {
  const prev = process.env.LI_SDK_MAX_ATTEMPTS;
  process.env.LI_SDK_MAX_ATTEMPTS = "2";
  assert.equal(sdkMaxAttempts(), 2);
  process.env.LI_SDK_MAX_ATTEMPTS = prev;
});
