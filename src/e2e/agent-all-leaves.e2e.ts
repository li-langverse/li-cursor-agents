/**
 * Every leaf agent: mock run, live streaming (collector + runAgent path), activity API, parallel.
 * Default CI — CURSOR_MOCK=1, disk store.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { buildMockTrace, buildRunInput } from "../agent-run-trace.js";
import { createLiveTraceCollector, liveTraceFlushMs } from "../control-plane/live-run-trace.js";
import { runOutputPath } from "../control-plane/run-paths.js";
import {
  completeSupervisorRun,
  listActiveRuns,
  registerSupervisorRun,
} from "../control-plane/runtime.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";
import { dbEnabled } from "../db/client.js";
import { saveWorkerStatusToDb } from "../db/worker-status.js";
import { isSdkSlotLockError } from "../backends/sdk-session-lock.js";
import {
  ALL_LEAF_AGENTS,
  assertAllLeavesRegistered,
  dbGet,
  pollRunDetailUntil,
  reapplyE2eStore,
} from "./all-leaves-shared.js";
import { auditAgentRun, assertAgentAudit } from "./agent-role-audit.js";
import { setupE2eEnv } from "./helpers.js";

describe("all leaf agents — mock run + live stream + parallel", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevFlush = process.env.LI_LIVE_TRACE_FLUSH_MS;
  const prevMockStream = process.env.LI_MOCK_LIVE_STREAM;
  const prevMockDelay = process.env.LI_MOCK_RUN_DELAY_MS;
  const prevPersist = process.env.LI_PERSIST_MOCK_RUNS;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.LI_PERSIST_MOCK_RUNS = "1";
    process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
    process.env.LI_MOCK_LIVE_STREAM = "1";
    process.env.LI_MOCK_RUN_DELAY_MS = "250";
    assert.equal(liveTraceFlushMs(), 0);
    assertAllLeavesRegistered();
  });

  after(async () => {
    if (dbEnabled()) {
      await saveWorkerStatusToDb({ active_runs: [] }).catch(() => {});
    }
    if (prevFlush === undefined) delete process.env.LI_LIVE_TRACE_FLUSH_MS;
    else process.env.LI_LIVE_TRACE_FLUSH_MS = prevFlush;
    if (prevMockStream === undefined) delete process.env.LI_MOCK_LIVE_STREAM;
    else process.env.LI_MOCK_LIVE_STREAM = prevMockStream;
    if (prevMockDelay === undefined) delete process.env.LI_MOCK_RUN_DELAY_MS;
    else process.env.LI_MOCK_RUN_DELAY_MS = prevMockDelay;
    if (prevPersist === undefined) delete process.env.LI_PERSIST_MOCK_RUNS;
    else process.env.LI_PERSIST_MOCK_RUNS = prevPersist;
    env?.restoreEnv();
  });

  for (const def of ALL_LEAF_AGENTS) {
    test(
      `mock run completes: ${def.id}`,
      { timeout: def.id === "workspace_sweeper" ? 120_000 : 90_000 },
      async () => {
        reapplyE2eStore(env);
        const result = await runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        });
        assert.equal(result.agentId, def.id);
        assert.equal(result.backend, "mock");
        assert.notEqual(result.status, "error", result.error);
        assert.ok(!String(result.error ?? "").includes("sdk-session.lock"), result.error);
        assert.ok(result.outputPath.endsWith(".md"));
        assert.ok(result.runInput, `${def.id}: runInput`);
        assert.ok(result.trace, `${def.id}: trace`);
        assertAgentAudit(
          auditAgentRun(def.id, result, { benchmarksRoot: env.benchmarksRoot }),
          `all-leaves ${def.id}`,
        );

        reapplyE2eStore(env);
        const runId = result.outputPath.split("/").pop()!.replace(/\.md$/, "");
        const detail = await dbGet(`/api/runs/${encodeURIComponent(runId)}`);
        assert.equal(detail.status, 200, `${def.id}: history detail`);
        const trace = detail.body.run_trace as { steps?: unknown[] } | undefined;
        assert.ok(trace?.steps && trace.steps.length >= 1, `${def.id}: persisted trace`);
      },
    );

    test(`live stream (collector → db-api): ${def.id}`, async () => {
      const runId = registerSupervisorRun(def.id, "e2e-all-leaves-stream");
      const outPath = runOutputPath(def.id, runId, true);
      const token = `stream-${def.id}-${Date.now()}`;
      const collector = createLiveTraceCollector(
        runId,
        outPath,
        buildRunInput({
          agentId: def.id,
          backend: "mock",
          systemPrompt: "system",
          userMessage: `user ${def.id}`,
          cwd: env.benchmarksRoot,
          dryRun: false,
          mock: true,
        }),
      );

      const t0 = Date.now();
      collector.onDelta({
        update: { type: "text-delta", text: token } as { type: "text-delta"; text: string },
      });

      reapplyE2eStore(env);
      const body = await pollRunDetailUntil(
        runId,
        (b) => {
          const trace = b.run_trace as { assistant_text?: string } | undefined;
          return Boolean(trace?.assistant_text?.includes(token));
        },
        { maxMs: 1_000 },
      );
      assert.ok(
        Date.now() - t0 < 900,
        `${def.id}: stream should be immediate with LI_LIVE_TRACE_FLUSH_MS=0`,
      );
      assert.equal(body.agent_id, def.id);
      assert.equal(body.live, true);

      reapplyE2eStore(env);
      const activity = await dbGet("/api/activity/recent?limit=80");
      assert.equal(activity.status, 200);
      const items = activity.body.items as Array<{
        run_id: string;
        live?: boolean;
        output_preview?: string;
        output_snippet?: string;
        action_summary?: string;
      }>;
      const row = items.find((i) => i.run_id === runId);
      assert.ok(row?.live, `${def.id}: live row in activity`);
      const preview = row?.output_snippet || row?.output_preview || "";
      assert.ok(
        preview.includes(token),
        `${def.id}: activity preview should include stream token, got ${preview.slice(0, 80)}`,
      );
      assert.ok(
        !/_Running/i.test(preview),
        `${def.id}: activity must not show generic Running placeholder`,
      );
      assert.notEqual(row?.action_summary, "—", `${def.id}: live action_summary`);

      completeSupervisorRun(runId, "finished");
    });

    test(
      `live stream during mock runAgent: ${def.id}`,
      { timeout: def.id === "workspace_sweeper" ? 120_000 : 90_000 },
      async () => {
        reapplyE2eStore(env);
        const streamMarker = `mock-stream-${def.id}`;
        const runPromise = runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        });

        let sawMidStream = false;
        let liveRunId: string | undefined;
        const pollStart = Date.now();
        while (Date.now() - pollStart < 15_000) {
          const running = listActiveRuns().filter(
            (r) => r.agent_id === def.id && r.status === "running",
          );
          if (running.length > 0) {
            liveRunId = running[0]!.run_id;
            const text = running[0]!.run_trace?.assistant_text ?? "";
            if (text.includes(streamMarker) || text.includes("start-")) {
              sawMidStream = true;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 30));
        }

        const result = await runPromise;
        assert.notEqual(result.status, "error", result.error);
        assert.ok(
          sawMidStream,
          `${def.id}: expected live partial trace while runAgent in flight (LI_MOCK_LIVE_STREAM)`,
        );

        if (liveRunId) {
          reapplyE2eStore(env);
          const detail = await dbGet(`/api/runs/${encodeURIComponent(liveRunId)}`);
          assert.equal(detail.status, 200);
          const finalText =
            (detail.body.run_trace as { assistant_text?: string })?.assistant_text ?? "";
          assert.ok(
            finalText.includes(streamMarker) || finalText.includes(def.id),
            `${def.id}: final trace should include mock stream markers`,
          );
        }

        const runId = result.outputPath.split("/").pop()!.replace(/\.md$/, "");
        reapplyE2eStore(env);
        const activity = await dbGet("/api/activity/recent?limit=80");
        assert.equal(activity.status, 200);
        const items = activity.body.items as Array<{ run_id: string; agent_id: string }>;
        assert.ok(
          items.some((i) => i.run_id === runId && i.agent_id === def.id),
          `${def.id}: completed run in activity`,
        );
      },
    );
  }

  test("all leaf agents run in parallel (mock, no sdk slot errors)", async () => {
    reapplyE2eStore(env);
    const pkg = agentsPackageRoot();
    const results = await Promise.all(
      ALL_LEAF_AGENTS.map((def) =>
        runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot ?? pkg,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: true,
        }),
      ),
    );
    assert.equal(results.length, ALL_LEAF_AGENTS.length);
    for (const r of results) {
      assert.notEqual(r.status, "error", `${r.agentId}: ${r.error}`);
      assert.ok(
        !String(r.error ?? "").includes("sdk-session.lock"),
        `${r.agentId}: ${r.error}`,
      );
    }
  });

  test("all leaf agents run in parallel (mock full run, concurrent)", async () => {
    reapplyE2eStore(env);
    const pkg = agentsPackageRoot();
    const results = await Promise.allSettled(
      ALL_LEAF_AGENTS.map((def) =>
        runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot ?? pkg,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        }),
      ),
    );
    const errors = results.filter(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" &&
        !isSdkSlotLockError((r as PromiseRejectedResult).reason),
    );
    const slotFails = results.filter(
      (r) =>
        r.status === "rejected" &&
        isSdkSlotLockError((r as PromiseRejectedResult).reason),
    );
    assert.equal(slotFails.length, 0, `slot lock under mock: ${slotFails.length}`);
    assert.equal(errors.length, 0, `unexpected rejections: ${errors.length}`);
    const fulfilled = results.filter((r) => r.status === "fulfilled") as Array<
      PromiseFulfilledResult<Awaited<ReturnType<typeof runAgent>>>
    >;
    assert.equal(
      fulfilled.length,
      ALL_LEAF_AGENTS.length,
      `expected all parallel mock runs ok, got ${fulfilled.length}/${ALL_LEAF_AGENTS.length}`,
    );
    for (const r of fulfilled) {
      assertAgentAudit(
        auditAgentRun(r.value.agentId as (typeof ALL_LEAF_AGENTS)[number]["id"], r.value, {
          benchmarksRoot: env.benchmarksRoot,
        }),
        "all-leaves parallel",
      );
    }
  });
});
