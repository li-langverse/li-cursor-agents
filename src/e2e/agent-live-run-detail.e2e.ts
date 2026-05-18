/**
 * In-flight run trace: activity lists worker_status runs; db-api must resolve detail without 404.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { allocateRunId } from "../control-plane/run-paths.js";
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
        await saveWorkerStatusToDb({
          active_runs: [
            {
              run_id: runId,
              agent_id: def.id,
              pid: process.pid,
              started_at: new Date().toISOString(),
              status: "running",
              reason: "e2e worker_status live detail",
            },
          ],
        });
        reapplyE2eStore(env);
        const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
        assert.equal(detail.status, 200, `${def.id}: worker_status live detail`);
        assert.equal(detail.body.live, true);
        assert.equal(detail.body.agent_id, def.id);
        await saveWorkerStatusToDb({ active_runs: [] });
      },
    );
  }
});
