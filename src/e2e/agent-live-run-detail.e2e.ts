/**
 * In-flight run trace: activity lists worker_status runs; db-api must resolve detail without 404.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { buildMockTrace, buildRunInput } from "../agent-run-trace.js";
import { publishLiveTraceSnapshot, publishRunInputLive } from "../control-plane/live-run-trace.js";
import { allocateRunId, runOutputPath } from "../control-plane/run-paths.js";
import {
  completeSupervisorRun,
  registerSupervisorRun,
} from "../control-plane/runtime.js";
import { handleDbApiRequest } from "../db-api/index.js";
import { dbEnabled } from "../db/client.js";
import { saveWorkerStatusToDb } from "../db/worker-status.js";
import { leafAgentIds, setupE2eEnv } from "./helpers.js";

const LEAVES = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");

async function dbGet(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const pathname = path.split("?")[0]!;
  const res = await handleDbApiRequest(new Request(`http://localhost${path}`), pathname);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function reapplyE2eStore(env: ReturnType<typeof setupE2eEnv>): void {
  process.env.LI_CONTROL_PLANE_DIR = env.controlPlaneDir;
  process.env.LI_RUNS_DIR = env.runsDir;
  process.env.LI_HANDOFFS_DIR = env.handoffsDir;
  process.env.LI_RESEARCH_SESSIONS_DIR = env.researchSessionsDir;
  if (process.env.LI_E2E_USE_SUPABASE !== "1") {
    process.env.LI_CONTROL_PLANE_STORE = "disk";
    process.env.LI_STACK_SKIP_SUPABASE = "1";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

describe("live run detail (all leaves)", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const useSupabase = process.env.LI_E2E_USE_SUPABASE === "1";

  before(() => {
    env = setupE2eEnv(useSupabase ? "v1" : "v1");
    if (useSupabase) {
      process.env.LI_CONTROL_PLANE_STORE = "supabase";
      delete process.env.LI_STACK_SKIP_SUPABASE;
    }
    const ids = leafAgentIds();
    assert.equal(LEAVES.length, ids.length);
  });

  after(async () => {
    if (dbEnabled()) {
      await saveWorkerStatusToDb({ active_runs: [] }).catch(() => {});
    }
    env?.restoreEnv();
  });

  for (const def of LEAVES) {
    test(`in-process live detail: ${def.id}`, async () => {
      const runId = registerSupervisorRun(def.id, "e2e-live-detail");
      reapplyE2eStore(env);
      const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
      assert.equal(detail.status, 200, `${def.id}: live detail status`);
      assert.equal(detail.body.run_id, runId);
      assert.equal(detail.body.live, true, `${def.id}: live flag`);
      assert.equal(detail.body.agent_id, def.id);

      const outPath = runOutputPath(def.id, runId, true);
      publishRunInputLive(
        runId,
        buildRunInput({
          agentId: def.id,
          backend: "mock",
          systemPrompt: "system prompt for e2e",
          userMessage: `user message for ${def.id}`,
          cwd: env.benchmarksRoot,
          dryRun: false,
          mock: true,
        }),
        outPath,
      );
      publishLiveTraceSnapshot(
        runId,
        outPath,
        buildMockTrace({
          definitionId: def.id,
          assistantText: "partial assistant output",
          userMessage: "live trace e2e",
          cwd: env.benchmarksRoot,
        }),
      );
      reapplyE2eStore(env);
      const liveTrace = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
      assert.equal(liveTrace.status, 200);
      const input = liveTrace.body.run_input as { user_message?: string; system_prompt?: string };
      const trace = liveTrace.body.run_trace as { thinking_text?: string; steps?: unknown[] };
      assert.ok(input?.user_message?.includes(def.id), `${def.id}: live run_input`);
      assert.ok(input?.system_prompt?.length, `${def.id}: live system_prompt`);
      assert.ok(trace?.thinking_text?.length, `${def.id}: live thinking_text`);
      assert.ok((trace?.steps?.length ?? 0) >= 1, `${def.id}: live trace steps`);

      const activity = await dbGet("/api/activity/recent?limit=50");
      assert.equal(activity.status, 200);
      const items = activity.body.items as Array<{ run_id: string }>;
      assert.ok(items.some((i) => i.run_id === runId), `${def.id}: in activity while live`);

      completeSupervisorRun(runId, "finished");
    });

    test(
      `worker_status-only live detail: ${def.id}`,
      { skip: !useSupabase || !dbEnabled() },
      async () => {
        const runId = allocateRunId(def.id);
        const outPath = runOutputPath(def.id, runId, false);
        const runInput = buildRunInput({
          agentId: def.id,
          backend: "cursor-sdk",
          systemPrompt: "live worker_status system",
          userMessage: `live worker_status user ${def.id}`,
          cwd: env.benchmarksRoot,
          dryRun: false,
          mock: false,
        });
        const runTrace = buildMockTrace({
          definitionId: def.id,
          assistantText: "streaming…",
          userMessage: runInput.user_message,
          cwd: env.benchmarksRoot,
        });
        await saveWorkerStatusToDb({
          active_runs: [
            {
              run_id: runId,
              agent_id: def.id,
              pid: process.pid,
              started_at: new Date().toISOString(),
              status: "running",
              reason: "e2e worker_status live detail",
              output_path: outPath,
              run_input: runInput,
              run_trace: runTrace,
            },
          ],
        });
        reapplyE2eStore(env);
        const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
        assert.equal(detail.status, 200, `${def.id}: worker_status live detail`);
        assert.equal(detail.body.live, true);
        assert.equal(detail.body.agent_id, def.id);
        const input = detail.body.run_input as { user_message?: string };
        const trace = detail.body.run_trace as { thinking_text?: string };
        assert.ok(input?.user_message?.includes(def.id), `${def.id}: worker_status run_input`);
        assert.ok(trace?.thinking_text?.length, `${def.id}: worker_status thinking`);
        await saveWorkerStatusToDb({ active_runs: [] });
      },
    );
  }
});
