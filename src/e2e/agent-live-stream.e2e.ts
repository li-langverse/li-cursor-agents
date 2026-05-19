/**
 * Live SDK trace must reach db-api immediately (LI_LIVE_TRACE_FLUSH_MS=0), not batched at 1.5s.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { listActiveRuns } from "../control-plane/runtime.js";
import { createLiveTraceCollector, liveTraceFlushMs } from "../control-plane/live-run-trace.js";
import { allocateRunId, runOutputPath } from "../control-plane/run-paths.js";
import {
  completeSupervisorRun,
  registerSupervisorRun,
} from "../control-plane/runtime.js";
import { handleDbApiRequest } from "../db-api/index.js";
import { buildRunInput } from "../agent-run-trace.js";
import { setupE2eEnv } from "./helpers.js";

async function dbGet(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const pathname = path.split("?")[0]!;
  const res = await handleDbApiRequest(new Request(`http://localhost${path}`), pathname);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("live trace streaming to frontend", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevFlush = process.env.LI_LIVE_TRACE_FLUSH_MS;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
    assert.equal(liveTraceFlushMs(), 0);
  });

  after(() => {
    if (prevFlush === undefined) delete process.env.LI_LIVE_TRACE_FLUSH_MS;
    else process.env.LI_LIVE_TRACE_FLUSH_MS = prevFlush;
    env?.restoreEnv();
  });

  test("text-delta is visible via db-api within 200ms (not 1.5s batch)", async () => {
    const agentId = "bug_fixer";
    const runId = registerSupervisorRun(agentId, "e2e-live-stream");
    const outPath = runOutputPath(agentId, runId, true);
    const runInput = buildRunInput({
      agentId,
      backend: "mock",
      systemPrompt: "sys",
      userMessage: "stream test",
      cwd: env.benchmarksRoot,
      dryRun: false,
      mock: true,
    });

    const collector = createLiveTraceCollector(runId, outPath, runInput);
    const token = `stream-token-${Date.now()}`;
    const t0 = Date.now();
    collector.onDelta({
      update: { type: "text-delta", text: token } as { type: "text-delta"; text: string },
    });

    let assistant = "";
    for (let i = 0; i < 20; i++) {
      const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
      assert.equal(detail.status, 200);
      const trace = detail.body.run_trace as { assistant_text?: string } | undefined;
      assistant = trace?.assistant_text ?? "";
      if (assistant.includes(token)) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    const elapsed = Date.now() - t0;
    assert.ok(
      assistant.includes(token),
      `expected assistant_text to include delta within polls; got "${assistant.slice(0, 80)}"`,
    );
    assert.ok(
      elapsed < 800,
      `stream should be immediate (LI_LIVE_TRACE_FLUSH_MS=0); took ${elapsed}ms — batched flush likely still active`,
    );

    const active = listActiveRuns().find((r) => r.run_id === runId);
    assert.ok(active?.run_trace, "in-process active_runs should carry trace");

    const activity = await dbGet("/api/activity/recent?limit=40");
    assert.equal(activity.status, 200);
    const items = activity.body.items as Array<{
      run_id: string;
      live?: boolean;
      output_snippet?: string;
      action_summary?: string;
    }>;
    const row = items.find((i) => i.run_id === runId);
    assert.ok(row?.live, "activity list should include live run");
    assert.ok(
      row?.output_snippet?.includes(token),
      `activity output_snippet should stream token, got: ${row?.output_snippet?.slice(0, 80)}`,
    );
    assert.notEqual(row?.action_summary, "—");

    completeSupervisorRun(runId, "finished");
  });

  test("successive deltas accumulate in live trace without waiting for finalize", async () => {
    const agentId = "ci_maintainer";
    const runId = registerSupervisorRun(agentId, "e2e-live-stream-accum");
    const outPath = runOutputPath(agentId, runId, true);
    const collector = createLiveTraceCollector(runId, outPath);

    collector.onDelta({
      update: { type: "text-delta", text: "alpha-" } as { type: "text-delta"; text: string },
    });
    collector.onDelta({
      update: { type: "text-delta", text: "beta" } as { type: "text-delta"; text: string },
    });

    const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
    const trace = detail.body.run_trace as { assistant_text?: string };
    assert.ok(trace?.assistant_text?.includes("alpha-beta"), trace?.assistant_text);
    completeSupervisorRun(runId, "finished");
  });
});
