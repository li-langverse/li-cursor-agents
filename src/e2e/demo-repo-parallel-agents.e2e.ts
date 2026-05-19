/**
 * Demo repo (fixtures/e2e-benchmarks): each agent uses its own work on the shared
 * benchmarks tree; research agents run in parallel (not one serial lane).
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AGENT_REGISTRY, getAgent } from "../agents/registry.js";
import type { AgentRunResult } from "../types.js";
import {
  researchAgentWorkerCycle,
  pickResearchWorkForAgent,
} from "../lanes/research-lane.js";
import { researchLaneAgentIds } from "../lanes/lane-agent-ids.js";
import { loadLaneState, saveLaneState } from "../lanes/lane-state.js";
import { researchParallelEnabled } from "../lanes/research-parallel.js";
import {
  researchAgentWorkerPoolSnapshot,
  startResearchAgentWorkerPool,
  stopResearchAgentWorkerPoolAsync,
} from "../async-swarm/research-agent-worker-pool.js";
import { NUMERICS_EVIDENCE_AGENT_IDS } from "../control-plane/run-completion.js";
import { listActiveRuns } from "../control-plane/runtime.js";
import { runAgent } from "../runner.js";
import { resetSdkSessionLockForTests } from "../backends/sdk-session-lock.js";
import { setupE2eEnv, leafAgentIds } from "./helpers.js";

const RESEARCH_AGENTS = [...researchLaneAgentIds()];

/** Repo-workflow agents use isolated clones; others use the shared demo benchmarks root. */
function assertDemoRepoCwd(
  result: AgentRunResult,
  benchmarksRoot: string,
  options?: { allowRepoWorkflowClone?: boolean },
): void {
  const cwd = result.runInput?.cwd ?? "";
  const def = getAgent(result.agentId);
  const isolatedClone =
    def?.repoWorkflow || NUMERICS_EVIDENCE_AGENT_IDS.has(result.agentId as never);
  if (isolatedClone) {
    if (options?.allowRepoWorkflowClone !== false) {
      assert.ok(cwd.length > 0, `${result.agentId}: missing cwd`);
      assert.ok(
        cwd.includes("workspaces") || cwd.includes(benchmarksRoot),
        `${result.agentId}: expected demo or isolated clone cwd, got ${cwd}`,
      );
      return;
    }
    assert.ok(cwd.length > 0, `${result.agentId}: missing cwd`);
    return;
  }
  assert.equal(
    cwd,
    benchmarksRoot,
    `${result.agentId}: expected demo repo cwd, got ${cwd}`,
  );
}

function enableResearchLaneForE2e(): void {
  const state = loadLaneState();
  state.research_lane_enabled = true;
  state.goal_last_run_at = {};
  saveLaneState(state);
}

describe("demo repo — per-agent work and parallel research", { timeout: 180_000 }, () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevParallel = process.env.LI_RESEARCH_PARALLEL;
  const prevMockDelay = process.env.LI_MOCK_RUN_DELAY_MS;
  const prevMockStream = process.env.LI_MOCK_LIVE_STREAM;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.CURSOR_MOCK = "1";
    process.env.LI_RESEARCH_PARALLEL = "1";
    process.env.LI_MOCK_RUN_DELAY_MS = "400";
    process.env.LI_MOCK_LIVE_STREAM = "1";
    process.env.LI_SDK_MAX_CONCURRENT = String(Math.max(6, RESEARCH_AGENTS.length));
    resetSdkSessionLockForTests();
    enableResearchLaneForE2e();
    assert.ok(researchParallelEnabled());
    assert.ok(existsSync(join(env.benchmarksRoot, "scripts", "agent-briefing.py")));
  });

  after(async () => {
    await stopResearchAgentWorkerPoolAsync(3_000);
    delete process.env.LI_E2E_RESEARCH_POOL;
    delete process.env.LI_RESEARCH_WORKER_MAX_CYCLES;
    resetSdkSessionLockForTests();
    if (prevParallel === undefined) delete process.env.LI_RESEARCH_PARALLEL;
    else process.env.LI_RESEARCH_PARALLEL = prevParallel;
    if (prevMockDelay === undefined) delete process.env.LI_MOCK_RUN_DELAY_MS;
    else process.env.LI_MOCK_RUN_DELAY_MS = prevMockDelay;
    if (prevMockStream === undefined) delete process.env.LI_MOCK_LIVE_STREAM;
    else process.env.LI_MOCK_LIVE_STREAM = prevMockStream;
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
    env?.restoreEnv();
  });

  test("each research agent picks its own goal (not a global lane mutex)", async () => {
    const numerics = await pickResearchWorkForAgent("numerics_researcher");
    const proof = await pickResearchWorkForAgent("proof_gap_researcher");
    const stdlib = await pickResearchWorkForAgent("stdlib_researcher");
    assert.equal(numerics?.goal?.id, "numerics_sota");
    assert.equal(proof?.goal?.id, "provability_holes");
    assert.equal(stdlib?.goal?.id, "stdlib_ecosystem");
    assert.notEqual(numerics?.goal?.id, proof?.goal?.id);
  });

  for (const agentId of RESEARCH_AGENTS) {
    test(`research agent ${agentId} runs on demo benchmarks root`, async () => {
      enableResearchLaneForE2e();
      const result = await runAgent({
        agentId,
        cwd: env.benchmarksRoot,
        benchmarksRoot: env.benchmarksRoot,
        mock: true,
        dryRun: false,
      });
      assert.equal(result.agentId, agentId);
      assert.notEqual(result.status, "error", result.error);
      assertDemoRepoCwd(result, env.benchmarksRoot);
      assert.ok(
        result.outputText?.includes(agentId) ||
          result.runInput?.agent_id === agentId,
        `${agentId}: expected agent-specific output`,
      );
    });
  }

  test("research agents run in parallel on demo repo (overlapping active runs)", async () => {
    enableResearchLaneForE2e();
    let maxConcurrent = 0;
    const poll = setInterval(() => {
      const active = listActiveRuns().filter((r) =>
        RESEARCH_AGENTS.includes(r.agent_id as (typeof RESEARCH_AGENTS)[number]),
      );
      maxConcurrent = Math.max(maxConcurrent, active.length);
    }, 20);

    const results = await Promise.all(
      RESEARCH_AGENTS.map((agentId) =>
        runAgent({
          agentId,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        }),
      ),
    );
    clearInterval(poll);

    assert.equal(results.length, RESEARCH_AGENTS.length);
    for (const r of results) {
      assert.notEqual(r.status, "error", `${r.agentId}: ${r.error}`);
      assertDemoRepoCwd(r, env.benchmarksRoot);
    }
    assert.ok(
      maxConcurrent >= 2,
      `expected ≥2 concurrent research runs on demo repo, saw max=${maxConcurrent}`,
    );
  });

  test("parallel research worker pool starts one loop per research agent", async () => {
    process.env.LI_E2E_RESEARCH_POOL = "1";
    process.env.LI_RESEARCH_WORKER_MAX_CYCLES = "1";
    process.env.LI_RESEARCH_WORKER_STARTUP_DEFER_MS = "0";
    try {
      const pool = startResearchAgentWorkerPool({ mock: true, allowInTest: true });
      assert.ok(pool.started, pool.message);
      assert.equal(pool.agents.length, RESEARCH_AGENTS.length);
      const snap = researchAgentWorkerPoolSnapshot();
      assert.equal(snap.worker_count, RESEARCH_AGENTS.length);
      await stopResearchAgentWorkerPoolAsync(5_000);
      assert.equal(researchAgentWorkerPoolSnapshot().worker_count, 0);
    } finally {
      await stopResearchAgentWorkerPoolAsync(2_000);
      delete process.env.LI_E2E_RESEARCH_POOL;
      delete process.env.LI_RESEARCH_WORKER_MAX_CYCLES;
      delete process.env.LI_RESEARCH_WORKER_STARTUP_DEFER_MS;
    }
  });

  for (const agentId of RESEARCH_AGENTS) {
    test(`researchAgentWorkerCycle executes for ${agentId}`, async () => {
      enableResearchLaneForE2e();
      const cycle = await researchAgentWorkerCycle(agentId, {
        mock: true,
        benchmarksRoot: env.benchmarksRoot,
      });
      assert.equal(cycle.agentId, agentId);
      assert.equal(cycle.skipped, false, cycle.skip_reason);
      assert.ok(cycle.goalId, `${agentId} should run a goal`);
    });
  }

  test("all leaf agents (pool + research) run on demo repo in parallel", async () => {
    const leaves = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");
    assert.equal(leaves.length, leafAgentIds().length);
    const results = await Promise.all(
      leaves.map((def) =>
        runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: true,
        }),
      ),
    );
    for (const r of results) {
      assert.notEqual(r.status, "error", `${r.agentId}: ${r.error}`);
      assertDemoRepoCwd(r, env.benchmarksRoot);
    }
  });
});
