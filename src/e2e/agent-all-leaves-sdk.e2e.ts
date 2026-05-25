/**
 * Optional live SDK E2E — one run per leaf agent with live stream assertions (requires CURSOR_API_KEY).
 *
 *   LI_E2E_SDK=1 LI_E2E_SDK_ALL_LEAVES=1 npm run test:e2e:all-leaves-sdk
 *
 * Verifies @cursor/sdk onDelta/onStep reach active_runs + GET /api/runs/:id (same as dashboard polling).
 * Not part of default CI (slow + billed).
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { loadDotEnv, resolveCursorApiKey } from "../env.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";
import { listActiveRuns } from "../control-plane/runtime.js";
import { liveTraceFlushMs } from "../control-plane/live-run-trace.js";
import {
  isSdkSlotLockError,
  reclaimAllStaleSdkSlots,
  resetSdkSessionLockForTests,
} from "../backends/sdk-session-lock.js";
import {
  ALL_LEAF_AGENTS,
  assertAllLeavesRegistered,
  assertSdkStreamingTrace,
  dbGet,
  logSdkMatrixRun,
  recordSdkMatrixTiming,
  pollUntilLiveStreamVisible,
  reapplyE2eStore,
  runDetailHasLiveStream,
  sdkMatrixExtraInstruction,
  sdkMatrixLogDir,
  traceHasLiveStream,
} from "./all-leaves-shared.js";
import { setupE2eEnv } from "./helpers.js";

const RUN_SDK =
  (process.env.LI_E2E_SDK === "1" || process.env.LI_E2E_SDK === "true") &&
  (process.env.LI_E2E_SDK_ALL_LEAVES === "1" || process.env.LI_E2E_SDK_ALL_LEAVES === "true");

loadDotEnv();
const apiKey = resolveCursorApiKey();
const skipReason = !RUN_SDK ? "set LI_E2E_SDK=1 LI_E2E_SDK_ALL_LEAVES=1" : !apiKey ? "CURSOR_API_KEY" : "";

describe("all leaf agents — live SDK + streaming", { skip: skipReason || false }, () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;
  const prevSlotWait = process.env.LI_SDK_SLOT_MAX_WAIT_MS;
  const prevFlush = process.env.LI_LIVE_TRACE_FLUSH_MS;
  const prevLiveDb = process.env.LI_LIVE_STREAM_DB;

  before(() => {
    env = setupE2eEnv("v1");
    delete process.env.CURSOR_MOCK;
    process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
    process.env.LI_LIVE_STREAM_DB = process.env.LI_E2E_USE_SUPABASE === "1" ? "1" : "0";
    process.env.LI_SDK_MAX_CONCURRENT = process.env.LI_SDK_MAX_CONCURRENT ?? "1";
    process.env.LI_SDK_SLOT_MAX_WAIT_MS = process.env.LI_SDK_SLOT_MAX_WAIT_MS ?? "600_000";
    // workspace_sweeper otherwise exits before SDK; stream must be exercised for every leaf.
    process.env.LI_WORKSPACE_SWEEP_FORCE_LLM = "1";
    resetSdkSessionLockForTests();
    const reclaimed = reclaimAllStaleSdkSlots();
    if (reclaimed > 0) {
      console.log(`[sdk-matrix] reclaimed ${reclaimed} stale SDK lock file(s)`);
    }
    assert.equal(liveTraceFlushMs(), 0);
    assertAllLeavesRegistered();
    console.log(
      `[sdk-matrix] setup ok — ${ALL_LEAF_AGENTS.length} leaf agents, store=${process.env.LI_CONTROL_PLANE_STORE ?? "disk"}`,
    );
    console.log(`[sdk-matrix] output logs → ${sdkMatrixLogDir()}/all.log`);
  });

  after(() => {
    if (prevFlush === undefined) delete process.env.LI_LIVE_TRACE_FLUSH_MS;
    else process.env.LI_LIVE_TRACE_FLUSH_MS = prevFlush;
    if (prevLiveDb === undefined) delete process.env.LI_LIVE_STREAM_DB;
    else process.env.LI_LIVE_STREAM_DB = prevLiveDb;
    env?.restoreEnv();
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
    if (prevSlotWait === undefined) delete process.env.LI_SDK_SLOT_MAX_WAIT_MS;
    else process.env.LI_SDK_SLOT_MAX_WAIT_MS = prevSlotWait;
  });

  for (let leafIndex = 0; leafIndex < ALL_LEAF_AGENTS.length; leafIndex++) {
    const def = ALL_LEAF_AGENTS[leafIndex]!;
    test(
      `sdk run + live stream: ${def.id}`,
      { timeout: 600_000 },
      async () => {
        const label = `[sdk-matrix ${leafIndex + 1}/${ALL_LEAF_AGENTS.length}]`;
        console.log(`${label} >>> START ${def.id}`);
        const startedAt = Date.now();
        reapplyE2eStore(env);
        resetSdkSessionLockForTests();
        reclaimAllStaleSdkSlots();
        const pkg = agentsPackageRoot();
        const streamWaitMs = Number(process.env.LI_E2E_SDK_STREAM_WAIT_MS ?? 180_000);

        const runPromise = runAgent({
          agentId: def.id,
          cwd: pkg,
          benchmarksRoot: env.benchmarksRoot,
          mock: false,
          dryRun: false,
          extraInstruction: sdkMatrixExtraInstruction(def.id),
        });

        let sawRunning = false;
        let streamInfo: { runId: string; fromMemory: boolean; detail?: Record<string, unknown> } | null =
          null;

        const registerDeadline = Date.now() + 120_000;
        while (Date.now() < registerDeadline) {
          const active = listActiveRuns().filter(
            (r) => r.agent_id === def.id && r.status === "running",
          );
          if (active.length > 0) {
            sawRunning = true;
            if (active[0]!.run_input) break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        let streamPollError: unknown;
        try {
          streamInfo = await pollUntilLiveStreamVisible(def.id, {
            maxMs: streamWaitMs,
            intervalMs: 500,
          });
        } catch (streamErr) {
          streamPollError = streamErr;
          const partial = listActiveRuns().find(
            (r) => r.agent_id === def.id && r.status === "running",
          );
          if (partial?.run_trace && traceHasLiveStream(partial.run_trace)) {
            streamInfo = { runId: partial.run_id, fromMemory: true };
          }
        }

        const result = await runPromise;

        if (!streamInfo) {
          const runIdFromPath = result.outputPath.split("/").pop()!.replace(/\.md$/, "");
          if (traceHasLiveStream(result.trace)) {
            streamInfo = { runId: runIdFromPath, fromMemory: false };
          } else {
            reapplyE2eStore(env);
            const detailRes = await dbGet(`/api/runs/${encodeURIComponent(runIdFromPath)}`);
            if (detailRes.status === 200 && runDetailHasLiveStream(detailRes.body)) {
              streamInfo = { runId: runIdFromPath, fromMemory: false, detail: detailRes.body };
            }
          }
        }
        if (!streamInfo) {
          throw streamPollError ?? new Error(`${def.id}: no live stream in memory, API, or final trace`);
        }
        assert.equal(result.backend, "cursor-sdk", def.id);
        logSdkMatrixRun(def.id, result, label);

        if (result.status === "error") {
          assert.ok(
            !isSdkSlotLockError(result.error),
            `${def.id}: slot lock: ${result.error}`,
          );
        }
        assert.equal(
          result.status,
          "finished",
          `${def.id}: expected status=finished (completion audit); gaps=${(result.completion?.gaps ?? []).join("; ") || "none"}`,
        );

        assert.ok(
          sawRunning || traceHasLiveStream(result.trace),
          `${def.id}: should register active run while SDK in flight (or stream in final trace)`,
        );
        assert.ok(result.runInput, `${def.id}: runInput`);
        assert.ok(streamInfo, `${def.id}: stream poll should resolve`);

        reapplyE2eStore(env);
        const detailRes = await dbGet(`/api/runs/${encodeURIComponent(streamInfo.runId)}`);
        assert.equal(detailRes.status, 200, `${def.id}: live run detail while/after run`);
        const detailBody = detailRes.body;

        assertSdkStreamingTrace(def.id, result.trace, detailBody);

        {
          const activity = await dbGet("/api/activity/recent?limit=100");
          assert.equal(activity.status, 200);
          const items = activity.body.items as Array<{
            run_id: string;
            agent_id: string;
            live?: boolean;
            output_snippet?: string;
            action_summary?: string;
          }>;
          const runId = result.outputPath.split("/").pop()!.replace(/\.md$/, "");
          const row =
            items.find((i) => i.run_id === streamInfo!.runId) ??
            items.find((i) => i.run_id === runId);
          assert.ok(row, `${def.id}: run appears in activity feed`);
          assert.ok(
            row!.output_snippet?.trim() || row!.action_summary !== "—",
            `${def.id}: activity should show stream preview, not empty`,
          );
        }

        assert.ok(
          streamInfo.fromMemory || runDetailHasLiveStream(detailBody),
          `${def.id}: stream visible via memory or db-api`,
        );
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        recordSdkMatrixTiming(def.id, result.status, elapsedSec);
        console.log(`${label} <<< DONE ${def.id} status=${result.status} ${elapsedSec}s`);
      },
    );
  }
});
