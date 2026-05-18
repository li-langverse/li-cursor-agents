/**
 * Every leaf agent: mock run → disk/DB catalog → db-api activity + run trace.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY } from "../agents/registry.js";
import { runAgent } from "../runner.js";
import { handleDbApiRequest } from "../db-api/index.js";
import { leafAgentIds, setupE2eEnv } from "./helpers.js";

const LEAVES = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");

async function dbGet(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await handleDbApiRequest(new Request(`http://localhost${path}`), path);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

/** db-api calls loadRuntimeEnv once; re-apply isolated e2e store after that. */
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

describe("agent activity pipeline (all leaves)", () => {
  let env: ReturnType<typeof setupE2eEnv>;

  before(() => {
    process.env.LI_PERSIST_MOCK_RUNS = "1";
    env = setupE2eEnv("v1");
    const ids = leafAgentIds();
    assert.equal(LEAVES.length, ids.length);
  });

  after(() => {
    delete process.env.LI_PERSIST_MOCK_RUNS;
    env?.restoreEnv();
  });

  for (const def of LEAVES) {
    test(
      `activity + trace: ${def.id}`,
      { timeout: def.id === "workspace_sweeper" ? 120_000 : 90_000 },
      async () => {
        const result = await runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        });
        assert.ok(result.outputPath.endsWith(".md"), def.id);
        assert.ok(result.runInput, `${def.id}: runInput`);
        assert.ok(result.trace, `${def.id}: trace`);

        const runId = result.outputPath.split("/").pop()!.replace(/\.md$/, "");
        reapplyE2eStore(env);
        const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
        assert.equal(detail.status, 200, `${def.id} run detail`);
        const trace = detail.body.run_trace as { steps?: unknown[] } | undefined;
        const input = detail.body.run_input as { user_message?: string } | undefined;
        assert.ok(input?.user_message, `${def.id}: run_input in API`);
        assert.ok(trace?.steps && trace.steps.length >= 1, `${def.id}: run_trace in API`);

        reapplyE2eStore(env);
        const activity = await dbGet("/api/activity/recent?limit=50");
        assert.equal(activity.status, 200);
        const items = activity.body.items as Array<{ run_id: string; has_trace: boolean }>;
        const row = items.find((i) => i.run_id === runId);
        assert.ok(row, `${def.id} must appear in /api/activity/recent`);
        assert.equal(row!.has_trace, true, `${def.id}: activity has_trace`);
      },
    );
  }
});
