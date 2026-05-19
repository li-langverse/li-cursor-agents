/**
 * Every leaf agent: function audit in isolation (demo repo) and in parallel.
 * Confirms each agent produces role-appropriate output — not just "run completed".
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { listActiveRuns } from "../control-plane/runtime.js";
import { isSdkSlotLockError } from "../backends/sdk-session-lock.js";
import { resetSdkSessionLockForTests, sdkMaxConcurrent } from "../backends/sdk-session-lock.js";
import { runAgent } from "../runner.js";
import { ALL_LEAF_AGENTS, assertAllLeavesRegistered } from "./all-leaves-shared.js";
import { auditAgentRun, assertAgentAudit } from "./agent-role-audit.js";
import { setupE2eEnv } from "./helpers.js";

describe("agent function audit — isolation and parallel (demo repo, mock)", { concurrency: 1 }, () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;
  const prevMockDelay = process.env.LI_MOCK_RUN_DELAY_MS;
  const prevMockStream = process.env.LI_MOCK_LIVE_STREAM;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.CURSOR_MOCK = "1";
    process.env.LI_MOCK_RUN_DELAY_MS = "300";
    process.env.LI_MOCK_LIVE_STREAM = "1";
    process.env.LI_SDK_MAX_CONCURRENT = String(Math.max(8, ALL_LEAF_AGENTS.length));
    resetSdkSessionLockForTests();
    assertAllLeavesRegistered();
  });

  after(() => {
    resetSdkSessionLockForTests();
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
    if (prevMockDelay === undefined) delete process.env.LI_MOCK_RUN_DELAY_MS;
    else process.env.LI_MOCK_RUN_DELAY_MS = prevMockDelay;
    if (prevMockStream === undefined) delete process.env.LI_MOCK_LIVE_STREAM;
    else process.env.LI_MOCK_LIVE_STREAM = prevMockStream;
    env?.restoreEnv();
  });

  for (const def of ALL_LEAF_AGENTS) {
    test(
      `isolation: ${def.id} fulfills role on demo repo`,
      { timeout: def.id === "workspace_sweeper" ? 120_000 : 90_000 },
      async () => {
        const result = await runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        });
        const audit = auditAgentRun(def.id, result, {
          benchmarksRoot: env.benchmarksRoot,
          requireTrace: true,
        });
        assertAgentAudit(audit, `isolation ${def.id}`);
      },
    );
  }

  test("parallel: every leaf agent fulfills role concurrently", async () => {
    let maxConcurrent = 0;
    const poll = setInterval(() => {
      maxConcurrent = Math.max(maxConcurrent, listActiveRuns().length);
    }, 25);

    const results = await Promise.all(
      ALL_LEAF_AGENTS.map((def) =>
        runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        }),
      ),
    );
    clearInterval(poll);

    assert.equal(results.length, ALL_LEAF_AGENTS.length);
    const audits = results.map((r) => {
      const audit = auditAgentRun(r.agentId as (typeof ALL_LEAF_AGENTS)[number]["id"], r, {
        benchmarksRoot: env.benchmarksRoot,
      });
      return audit;
    });

    const failed = audits.filter((a) => !a.ok);
    assert.equal(
      failed.length,
      0,
      `parallel role audits failed:\n${failed.map((f) => `${f.agentId}: ${f.violations.join("; ")}`).join("\n")}`,
    );

    const minOverlap = Math.min(3, Math.floor(ALL_LEAF_AGENTS.length / 3));
    assert.ok(
      maxConcurrent >= minOverlap,
      `expected ≥${minOverlap} overlapping active runs during parallel audit, saw ${maxConcurrent} (sdk max ${sdkMaxConcurrent()})`,
    );
  });

  test("parallel dry-run: no slot lock errors", async () => {
    const results = await Promise.all(
      ALL_LEAF_AGENTS.map((def) =>
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
      assert.ok(!String(r.error ?? "").includes("sdk-session.lock"));
      assert.equal(r.agentId, r.runInput?.agent_id);
    }
  });

  test("parallel: rejected runs are only slot-lock (none under mock)", async () => {
    const settled = await Promise.allSettled(
      ALL_LEAF_AGENTS.map((def) =>
        runAgent({
          agentId: def.id,
          cwd: env.benchmarksRoot,
          benchmarksRoot: env.benchmarksRoot,
          mock: true,
          dryRun: false,
        }),
      ),
    );
    const slotFails = settled.filter(
      (r) => r.status === "rejected" && isSdkSlotLockError((r as PromiseRejectedResult).reason),
    );
    const otherFails = settled.filter(
      (r) => r.status === "rejected" && !isSdkSlotLockError((r as PromiseRejectedResult).reason),
    );
    assert.equal(slotFails.length, 0, "mock parallel should not hit sdk slot lock");
    assert.equal(otherFails.length, 0, "unexpected parallel rejections");
    const ok = settled.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, ALL_LEAF_AGENTS.length, `expected all ${ALL_LEAF_AGENTS.length} parallel runs ok`);
  });
});
