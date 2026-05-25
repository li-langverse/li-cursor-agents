/**
 * Live SDK parallel E2E — requires CURSOR_API_KEY. Not run in default CI.
 *
 *   LI_E2E_SDK=1 LI_E2E_SDK_PARALLEL=1 npm run test:e2e:sdk-parallel
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  reclaimAllStaleSdkSlots,
  resetSdkSessionLockForTests,
  sdkSessionInProcessActive,
  withGlobalSdkSessionLock,
} from "../backends/sdk-session-lock.js";
import { loadDotEnv, resolveCursorApiKey } from "../env.js";
import { runAgent, agentsPackageRoot } from "../runner.js";
import { setupE2eEnv } from "./helpers.js";

const RUN =
  (process.env.LI_E2E_SDK === "1" || process.env.LI_E2E_SDK === "true") &&
  (process.env.LI_E2E_SDK_PARALLEL === "1" || process.env.LI_E2E_SDK_PARALLEL === "true");

loadDotEnv();
const key = resolveCursorApiKey();

const PARALLEL_AGENTS = ["gap_explorer", "plan_verifier", "issue_planner"] as const;
const skipLive = !RUN || !key;

describe("sdk parallel live e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;
  const prevGap = process.env.LI_SDK_SESSION_GAP_MS;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.LI_SDK_MAX_CONCURRENT = "2";
    process.env.LI_SDK_SESSION_GAP_MS = "0";
    resetSdkSessionLockForTests();
    reclaimAllStaleSdkSlots();
  });

  after(() => {
    resetSdkSessionLockForTests();
    env?.restoreEnv();
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
    if (prevGap === undefined) delete process.env.LI_SDK_SESSION_GAP_MS;
    else process.env.LI_SDK_SESSION_GAP_MS = prevGap;
  });

  test("lock layer: two SDK sessions overlap with max concurrent 2", { skip: skipLive }, async () => {
    resetSdkSessionLockForTests();
    let active = 0;
    let maxSeen = 0;
    const holdMs = 3_000;
    const run = () =>
      withGlobalSdkSessionLock(async () => {
        active++;
        maxSeen = Math.max(maxSeen, active);
        await new Promise((r) => setTimeout(r, holdMs));
        active--;
      });
    await Promise.all([run(), run(), run()]);
    assert.ok(maxSeen >= 2, `expected overlapping lock holders, maxSeen=${maxSeen}`);
    assert.equal(active, 0);
  });

  test(
    "parallel runAgent (cursor-sdk): all agents finish without slot timeout",
    { skip: skipLive },
    async () => {
    const pkg = agentsPackageRoot();
    const instruction =
      "Reply with exactly one short sentence summarizing your task. No tools, no PRs.";

    const results = await Promise.all(
      PARALLEL_AGENTS.map((agentId) =>
        runAgent({
          agentId,
          cwd: pkg,
          benchmarksRoot: env.benchmarksRoot,
          mock: false,
          dryRun: false,
          extraInstruction: instruction,
        }),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const id = PARALLEL_AGENTS[i]!;
      assert.equal(r.backend, "cursor-sdk", id);
      assert.ok(
        r.status === "finished" || r.status === "incomplete",
        `${id}: status=${r.status}`,
      );
      assert.ok(r.outputText && r.outputText.length > 5, `${id}: output`);
    }
    assert.equal(sdkSessionInProcessActive(), 0, "all in-process slots released");
    },
  );
});
