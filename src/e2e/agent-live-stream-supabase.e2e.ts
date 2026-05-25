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

  test("text-delta persists to agent_runs + agent_run_events and appears in GET /api/runs/:id", async () => {
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
    const token = `db-stream-${Date.now()}`;
    collector.onDelta({
      update: { type: "text-delta", text: token } as { type: "text-delta"; text: string },
    });
    collector.onDelta({
      update: { type: "thinking-delta", text: "planning…" } as { type: "thinking-delta"; text: string },
    });

    let assistant = "";
    let events: Array<{ event_type: string }> = [];
    for (let i = 0; i < 40; i++) {
      const row = await getRunningRunById(runId);
      const trace = row?.run_trace as { assistant_text?: string; deltas?: unknown[] } | null | undefined;
      assistant = trace?.assistant_text ?? "";
      events = await getRunEvents(runId);
      if (assistant.includes(token) && events.some((e) => e.event_type.startsWith("stream_"))) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.ok(assistant.includes(token), `DB run_trace should include streamed text; got "${assistant.slice(0, 80)}"`);
    assert.ok(
      events.some((e) => e.event_type === "stream_text-delta"),
      `expected stream_text-delta in agent_run_events, got: ${events.map((e) => e.event_type).join(", ")}`,
    );

    const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.live, true);
    const apiTrace = detail.body.run_trace as { assistant_text?: string; deltas?: Array<{ type: string }> };
    assert.ok(apiTrace?.assistant_text?.includes(token), "db-api run detail should stream assistant_text");
    assert.ok(
      (apiTrace?.deltas?.length ?? 0) > 0 || (detail.body.trace_events as unknown[])?.length,
      "db-api should expose deltas or trace_events for live UI",
    );

    completeSupervisorRun(runId, "finished");
  });
});
