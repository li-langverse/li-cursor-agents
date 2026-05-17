import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAgentLogLine, hasIsoLogPrefix } from "./agent-log.js";

test("formatAgentLogLine prefixes ISO-8601 timestamp", () => {
  const line = formatAgentLogLine("supervisor", "tick", "executed=2", '{"tasks_executed":2}');
  assert.match(
    line,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[supervisor\] tick: executed=2 \{"tasks_executed":2\}$/,
  );
  assert.equal(hasIsoLogPrefix(line), true);
});

test("hasIsoLogPrefix rejects legacy lines without timestamp", () => {
  assert.equal(hasIsoLogPrefix("[supervisor] tick: executed=2"), false);
  assert.equal(hasIsoLogPrefix("2026-05-17T12:00:00.000Z [supervisor] info: ok"), true);
});
