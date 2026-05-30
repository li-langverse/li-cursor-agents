import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  briefingPreflightFailed,
  classifyRunFailure,
  isBriefingStale,
} from "./classify-failure.js";
import type { AgentRunResult } from "../types.js";

function errRun(text: string): AgentRunResult {
  return {
    agentId: "bug_fixer",
    backend: "mock",
    status: "error",
    durationMs: 1,
    outputPath: "",
    error: text,
  };
}

describe("classifyRunFailure", () => {
  test("detects SDK auth", () => {
    const c = classifyRunFailure(errRun("CURSOR_API_KEY missing — unauthorized"));
    assert.equal(c?.class, "sdk_auth");
  });

  test("detects preflight script errors", () => {
    const c = classifyRunFailure(errRun("agent-briefing.py AttributeError: NoneType"));
    assert.equal(c?.class, "preflight_script");
  });

  test("detects dirty repo", () => {
    const c = classifyRunFailure(errRun("Please commit your changes or stash them before you merge"));
    assert.equal(c?.class, "repo_dirty");
  });
});

describe("briefingPreflightFailed", () => {
  test("true when a preflight step exited non-zero", () => {
    assert.equal(
      briefingPreflightFailed({
        preflight_runs: { issue_triage: { exit_code: 1 }, explorer: { skipped: true } },
      }),
      true,
    );
  });
});

describe("isBriefingStale", () => {
  test("flags old generated_at", () => {
    const old = new Date(Date.now() - 8 * 60 * 60_000).toISOString();
    assert.equal(isBriefingStale({ generated_at: old }), true);
  });
});
