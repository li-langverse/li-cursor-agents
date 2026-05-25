/**
 * All async worker-pool agents can run concurrently (mock + SDK slot queue, no tick slot-timeout errors).
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { AGENT_REGISTRY } from "../agents/registry.js";
import {
  agentWorkerCycle,
  asyncWorkerAgentIds,
} from "../async-swarm/agent-worker-pool.js";
import {
  resetSdkSessionLockForTests,
  sdkMaxConcurrent,
  withGlobalSdkSessionLock,
} from "../backends/sdk-session-lock.js";
import { runAgent } from "../runner.js";
import { agentsPackageRoot } from "../runner.js";
import { leafAgentIds, setupE2eEnv } from "./helpers.js";

const POOL = asyncWorkerAgentIds();

describe("parallel agent pool", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;
  const prevWait = process.env.LI_SDK_SLOT_MAX_WAIT_MS;
  const prevProactive = process.env.LI_PROACTIVE_ALL_POOL_WORKERS;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.CURSOR_MOCK = "1";
    process.env.LI_PROACTIVE_ALL_POOL_WORKERS = "1";
    process.env.LI_SDK_MAX_CONCURRENT = String(Math.min(16, Math.max(6, POOL.length)));
    process.env.LI_SDK_SLOT_MAX_WAIT_MS = "120000";
    resetSdkSessionLockForTests();
    assert.ok(POOL.length >= 10, `expected large worker pool, got ${POOL.length}`);
    const leaves = leafAgentIds();
    for (const id of POOL) {
      assert.ok(leaves.includes(id), `pool agent ${id} should be a leaf`);
    }
  });

  after(() => {
    resetSdkSessionLockForTests();
    env?.restoreEnv();
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
    if (prevWait === undefined) delete process.env.LI_SDK_SLOT_MAX_WAIT_MS;
    else process.env.LI_SDK_SLOT_MAX_WAIT_MS = prevWait;
    if (prevProactive === undefined) delete process.env.LI_PROACTIVE_ALL_POOL_WORKERS;
    else process.env.LI_PROACTIVE_ALL_POOL_WORKERS = prevProactive;
  });

  test("all pool agents run runAgent in parallel (mock, no slot lock errors)", async () => {
    const pkg = agentsPackageRoot();
    const results = await Promise.all(
      POOL.map((agentId) =>
        runAgent({
          agentId,
          cwd: pkg,
          mock: true,
          dryRun: true,
        }),
      ),
    );
    assert.equal(results.length, POOL.length);
    for (const r of results) {
      assert.notEqual(r.status, "error", `${r.agentId}: ${r.error}`);
      assert.ok(
        !String(r.error ?? "").includes("sdk-session.lock"),
        `${r.agentId} hit slot lock: ${r.error}`,
      );
    }
  });

  test("agentWorkerCycle parallel: no slot-timeout errors when slots available (mock)", async () => {
    process.env.LI_PROACTIVE_AGENT_CADENCE_MS = "0";
    const results = await Promise.all(POOL.map((agentId) => agentWorkerCycle(agentId, { mock: true })));
    const errors = results.filter((r) => r.status === "error");
    const slotSkips = results.filter((r) =>
      r.skip_reason?.includes("sdk session slots busy"),
    );
    assert.equal(errors.length, 0, `errors: ${JSON.stringify(errors)}`);
    assert.equal(slotSkips.length, 0, `slot skips under mock: ${slotSkips.length}`);
  });

  test("all registry leaves run runAgent in parallel without sdk-session.lock timeout", async () => {
    const leaves = AGENT_REGISTRY.filter((a) => a.id !== "orchestrator");
    const pkg = agentsPackageRoot();
    const results = await Promise.all(
      leaves.map((def) =>
        runAgent({
          agentId: def.id,
          cwd: pkg,
          mock: true,
          dryRun: true,
        }),
      ),
    );
    assert.equal(results.length, leaves.length);
    for (const r of results) {
      assert.notEqual(r.status, "error", `${r.agentId}: ${r.error}`);
      assert.ok(
        !String(r.error ?? "").includes("sdk-session.lock"),
        `${r.agentId} hit slot lock: ${r.error}`,
      );
    }
  });

  test(`${sdkMaxConcurrent()} SDK slots allow overlapping holders (simulates parallel agents)`, async () => {
    resetSdkSessionLockForTests();
    const max = sdkMaxConcurrent();
    let active = 0;
    let maxSeen = 0;
    const holdMs = 120;
    const runners = Array.from({ length: max + 2 }, () =>
      withGlobalSdkSessionLock(async () => {
        active++;
        maxSeen = Math.max(maxSeen, active);
        await new Promise((r) => setTimeout(r, holdMs));
        active--;
      }),
    );
    await Promise.all(runners);
    assert.ok(maxSeen >= 2, `expected parallel overlap, maxSeen=${maxSeen}`);
    assert.ok(maxSeen <= max, `expected at most ${max} concurrent, saw ${maxSeen}`);
    assert.equal(active, 0);
  });
});
