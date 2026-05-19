/**
 * Optional live SDK E2E — one minimal run per leaf agent (requires CURSOR_API_KEY).
 *
 *   LI_E2E_SDK=1 LI_E2E_SDK_ALL_LEAVES=1 npm run test:e2e:all-leaves-sdk
 *
 * Not part of default CI (slow + billed).
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { loadDotEnv, resolveCursorApiKey } from "../env.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";
import { listActiveRuns } from "../control-plane/runtime.js";
import { liveTraceFlushMs } from "../control-plane/live-run-trace.js";
import { isSdkSlotLockError } from "../backends/sdk-session-lock.js";
import { ALL_LEAF_AGENTS, assertAllLeavesRegistered } from "./all-leaves-shared.js";
import { setupE2eEnv } from "./helpers.js";

const RUN_SDK =
  (process.env.LI_E2E_SDK === "1" || process.env.LI_E2E_SDK === "true") &&
  (process.env.LI_E2E_SDK_ALL_LEAVES === "1" || process.env.LI_E2E_SDK_ALL_LEAVES === "true");

loadDotEnv();
const apiKey = resolveCursorApiKey();
const skipReason = !RUN_SDK ? "set LI_E2E_SDK=1 LI_E2E_SDK_ALL_LEAVES=1" : !apiKey ? "CURSOR_API_KEY" : "";

describe("all leaf agents — optional live SDK", { skip: skipReason || false }, () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;

  before(() => {
    env = setupE2eEnv("v1");
    delete process.env.CURSOR_MOCK;
    process.env.LI_LIVE_TRACE_FLUSH_MS = "0";
    process.env.LI_SDK_MAX_CONCURRENT = process.env.LI_SDK_MAX_CONCURRENT ?? "6";
    process.env.LI_SDK_SLOT_MAX_WAIT_MS = process.env.LI_SDK_SLOT_MAX_WAIT_MS ?? "0";
    assert.equal(liveTraceFlushMs(), 0);
    assertAllLeavesRegistered();
  });

  after(() => {
    env?.restoreEnv();
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
  });

  for (const def of ALL_LEAF_AGENTS) {
    test(
      `sdk run: ${def.id}`,
      { timeout: 600_000 },
      async () => {
        const pkg = agentsPackageRoot();
        const runPromise = runAgent({
          agentId: def.id,
          cwd: pkg,
          mock: false,
          dryRun: false,
          extraInstruction:
            "Reply with exactly one short line starting with OK-. No tools unless required. Do not open PRs.",
        });

        let sawRunning = false;
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          const active = listActiveRuns().filter(
            (r) => r.agent_id === def.id && r.status === "running",
          );
          if (active.length > 0) {
            sawRunning = true;
            if (active[0]!.run_input) break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        const result = await runPromise;
        assert.equal(result.backend, "cursor-sdk", def.id);
        assert.ok(
          result.status === "finished" || result.status === "error",
          `${def.id}: status=${result.status}`,
        );
        if (result.status === "error") {
          assert.ok(
            !isSdkSlotLockError(result.error),
            `${def.id}: slot lock: ${result.error}`,
          );
        }
        assert.ok(sawRunning, `${def.id}: should register active run while SDK in flight`);
        assert.ok(result.runInput, `${def.id}: runInput`);
      },
    );
  }
});
