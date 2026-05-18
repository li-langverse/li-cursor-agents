import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { controlPlaneRoot } from "../control-plane/paths.js";
import {
  lockPathIsStale,
  reclaimAllStaleSdkSlots,
  reclaimStaleSdkSlot,
  resetSdkSessionLockForTests,
  sdkSlotLikelyAvailable,
  withGlobalSdkSessionLock,
} from "./sdk-session-lock.js";

function lockPath(slot: number): string {
  const root = join(controlPlaneRoot(), "sdk-slots");
  return join(root, slot === 0 ? "sdk-session.lock" : `sdk-session.slot-${slot}.lock`);
}

test("reclaims lock when owner pid is dead", () => {
  resetSdkSessionLockForTests();
  const path = lockPath(0);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ pid: 9_999_999, acquired_at: new Date().toISOString() })}\n`,
  );
  assert.ok(lockPathIsStale(path));
  assert.ok(reclaimStaleSdkSlot(0));
  assert.ok(!existsSync(path));
});

test("reclaimAllStaleSdkSlots clears multiple dead-owner locks", () => {
  resetSdkSessionLockForTests();
  for (const slot of [0, 1, 2]) {
    const path = lockPath(slot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      `${JSON.stringify({ pid: 9_999_990 + slot, acquired_at: new Date().toISOString() })}\n`,
    );
  }
  assert.equal(reclaimAllStaleSdkSlots(), 3);
  assert.ok(!existsSync(lockPath(0)));
  assert.ok(!existsSync(lockPath(1)));
});

test("sdkSlotLikelyAvailable after stale reclaim", () => {
  resetSdkSessionLockForTests();
  const path = lockPath(1);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ pid: 9_999_997, acquired_at: new Date().toISOString() })}\n`,
  );
  assert.ok(reclaimStaleSdkSlot(1));
  assert.ok(sdkSlotLikelyAvailable());
});

test("parallel acquire after stale reclaim does not throw slot timeout", async () => {
  resetSdkSessionLockForTests();
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  const prevWait = process.env.LI_SDK_SLOT_MAX_WAIT_MS;
  process.env.LI_SDK_MAX_CONCURRENT = "2";
  process.env.LI_SDK_SLOT_MAX_WAIT_MS = "5_000";

  const path = lockPath(0);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ pid: 9_999_996, acquired_at: new Date().toISOString() })}\n`,
  );
  reclaimAllStaleSdkSlots();

  let maxSeen = 0;
  let active = 0;
  const holdMs = 200;
  const run = () =>
    withGlobalSdkSessionLock(async () => {
      active++;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((r) => setTimeout(r, holdMs));
      active--;
    });

  await Promise.all([run(), run(), run()]);
  assert.ok(maxSeen >= 2, `expected parallel slots, maxSeen=${maxSeen}`);
  assert.equal(active, 0);

  if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prev;
  if (prevWait === undefined) delete process.env.LI_SDK_SLOT_MAX_WAIT_MS;
  else process.env.LI_SDK_SLOT_MAX_WAIT_MS = prevWait;
  resetSdkSessionLockForTests();
});
