import { test } from "node:test";
import assert from "node:assert/strict";
import { liveTraceFlushMs } from "./live-run-trace.js";

test("liveTraceFlushMs: 0 and immediate mean no batching delay", () => {
  const prev = process.env.LI_LIVE_TRACE_FLUSH_MS;
  process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
  assert.equal(liveTraceFlushMs(), 0);
  process.env.LI_LIVE_TRACE_FLUSH_MS = "immediate";
  assert.equal(liveTraceFlushMs(), 0);
  if (prev === undefined) delete process.env.LI_LIVE_TRACE_FLUSH_MS;
  else process.env.LI_LIVE_TRACE_FLUSH_MS = prev;
});
