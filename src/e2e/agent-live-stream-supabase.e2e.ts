/**
 * Finest-grain live stream must reach the test Supabase (not prod) and db-api reads it
 * while the run is still in progress (simulates Next.js UI polling).
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { createLiveTraceCollector } from "../control-plane/live-run-trace.js";
import { runOutputPath } from "../control-plane/run-paths.js";
import {
  completeSupervisorRun,
  registerSupervisorRun,
} from "../control-plane/runtime.js";
import { handleDbApiRequest } from "../db-api/index.js";
import { buildRunInput } from "../agent-run-trace.js";
import { getRunEvents, getRunningRunById } from "../db/runs.js";
import { liveStreamDbEnabled } from "../db/live-stream-persist.js";
import { setupE2eEnv } from "./helpers.js";

async function dbGet(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const pathname = path.split("?")[0]!;
  const res = await handleDbApiRequest(new Request(`http://localhost${path}`), pathname);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

const useSupabase = process.env.LI_E2E_USE_SUPABASE === "1";
const describeLiveDb = useSupabase ? describe : describe.skip;

describeLiveDb("live stream → test Supabase → frontend API", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  before(() => {
    env = setupE2eEnv("v1");
    assert.ok(liveStreamDbEnabled(), "LI_LIVE_STREAM_DB must be enabled for this test");
  });

  after(() => {
    env?.restoreEnv();
  });

  test("tool events persist to agent_runs + agent_run_events and appear in GET /api/runs/:id/events", async () => {
    const agentId = "bug_fixer";
    const runId = registerSupervisorRun(agentId, "e2e-supabase-live-stream");
    const outPath = runOutputPath(agentId, runId, true);
    const runInput = buildRunInput({
      agentId,
      backend: "mock",
      systemPrompt: "sys",
      userMessage: "supabase stream test",
      cwd: env.benchmarksRoot,
      dryRun: false,
      mock: true,
    });

    const collector = createLiveTraceCollector(runId, outPath, runInput);
    const toolPath = `e2e-stream-${Date.now()}.ts`;
    collector.onDelta({
      update: {
        type: "tool-call-started",
        tool: "edit",
        args: { path: toolPath },
      } as { type: "tool-call-started"; tool: string; args: { path: string } },
    });
    collector.onDelta({
      update: {
        type: "tool-call-completed",
        tool: "edit",
        args: { path: toolPath },
        result: { status: "success" },
      } as {
        type: "tool-call-completed";
        tool: string;
        args: { path: string };
        result: { status: string };
      },
    });

    let events: Array<{ event_type: string }> = [];
    for (let i = 0; i < 40; i++) {
      events = await getRunEvents(runId);
      if (events.some((e) => e.event_type === "tool_call_started")) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.ok(
      events.some((e) => e.event_type === "tool_call_started"),
      `expected tool_call_started in agent_run_events, got: ${events.map((e) => e.event_type).join(", ")}`,
    );
    assert.ok(
      !events.some((e) => e.event_type.startsWith("stream_text-delta")),
      "token/text deltas should not be persisted when LI_SDK_LOG_SKIP_TOKEN_DELTAS=1",
    );

    const row = await getRunningRunById(runId);
    assert.ok(row, "running row should exist in agent_runs");

    const eventsApi = await dbGet(`/api/runs/${encodeURIComponent(runId)}/events?limit=50`);
    assert.equal(eventsApi.status, 200);
    const apiEvents = (eventsApi.body.events as Array<{ event_type: string }>) ?? [];
    assert.ok(apiEvents.some((e) => e.event_type === "tool_call_started"), "events API should list tool start");

    const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.live, true);
    assert.ok(
      (detail.body.trace_events as unknown[])?.length || detail.body.run_trace,
      "db-api run detail should expose trace_events or run_trace",
    );

    completeSupervisorRun(runId, "finished");
  });
});
