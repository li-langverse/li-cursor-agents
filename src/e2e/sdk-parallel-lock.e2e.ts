/**
 * E2E: cross-process SDK slot locks — parallel sessions, stale reclaim, worker skip.
 * Runs on mock timing (no CURSOR_API_KEY). Included in default npm test.
 */
import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  reclaimAllStaleSdkSlots,
  resetSdkSessionLockForTests,
  sdkSessionInProcessActive,
  sdkSlotLikelyAvailable,
  withGlobalSdkSessionLock,
} from "../backends/sdk-session-lock.js";
import { controlPlaneRoot } from "../control-plane/paths.js";
import { setupE2eEnv } from "./helpers.js";

function lockPath(slot: number): string {
  const root = join(controlPlaneRoot(), "sdk-slots");
  return join(root, slot === 0 ? "sdk-session.lock" : `sdk-session.slot-${slot}.lock`);
}

describe("sdk parallel lock e2e", () => {
  let env: ReturnType<typeof setupE2eEnv>;
  const prevConcurrent = process.env.LI_SDK_MAX_CONCURRENT;
  const prevWait = process.env.LI_SDK_SLOT_MAX_WAIT_MS;
  const prevMock = process.env.CURSOR_MOCK;

  before(() => {
    env = setupE2eEnv("v1");
    process.env.LI_SDK_MAX_CONCURRENT = "2";
    process.env.LI_SDK_SLOT_MAX_WAIT_MS = "8_000";
    process.env.CURSOR_MOCK = "1";
    resetSdkSessionLockForTests();
  });

  after(() => {
    resetSdkSessionLockForTests();
    env?.restoreEnv();
    if (prevConcurrent === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
    else process.env.LI_SDK_MAX_CONCURRENT = prevConcurrent;
    if (prevWait === undefined) delete process.env.LI_SDK_SLOT_MAX_WAIT_MS;
    else process.env.LI_SDK_SLOT_MAX_WAIT_MS = prevWait;
    if (prevMock === undefined) delete process.env.CURSOR_MOCK;
    else process.env.CURSOR_MOCK = prevMock;
  });

  test("stale dead-pid lock files are reclaimed on startup path", () => {
    resetSdkSessionLockForTests();
    const path = lockPath(0);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ pid: 9_999_991, acquired_at: new Date().toISOString() })}\n`,
    );
    assert.ok(existsSync(path));
    const n = reclaimAllStaleSdkSlots();
    assert.ok(n >= 1);
    assert.ok(!existsSync(path));
  });

  test("LI_SDK_MAX_CONCURRENT=2 allows two overlapping slot holders", async () => {
    resetSdkSessionLockForTests();
    let active = 0;
    let maxSeen = 0;
    const holdMs = 250;
    const run = () =>
      withGlobalSdkSessionLock(async () => {
        active++;
        maxSeen = Math.max(maxSeen, active);
        await new Promise((r) => setTimeout(r, holdMs));
        active--;
      });
    await Promise.all([run(), run(), run()]);
    assert.ok(maxSeen >= 2, `expected 2 concurrent holders, saw ${maxSeen}`);
    assert.ok(maxSeen <= 2, `expected at most 2 concurrent, saw ${maxSeen}`);
    assert.equal(active, 0);
    assert.equal(sdkSessionInProcessActive(), 0);
  });

  test("sdkSlotLikelyAvailable is false when all slots are held (worker fast-skip path)", async () => {
    resetSdkSessionLockForTests();
    const holdMs = 2_000;
    const blockers = [
      withGlobalSdkSessionLock(() => new Promise((r) => setTimeout(r, holdMs))),
      withGlobalSdkSessionLock(() => new Promise((r) => setTimeout(r, holdMs))),
    ];
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(sdkSlotLikelyAvailable(), false);
    await Promise.all(blockers);
    assert.ok(sdkSlotLikelyAvailable());
  });
});
