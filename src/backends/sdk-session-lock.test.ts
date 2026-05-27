import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetSdkSessionLockForTests,
  sdkMaxConcurrent,
  withGlobalSdkSessionLock,
} from "./sdk-session-lock.js";

test("sdkMaxConcurrent respects LI_SDK_MAX_CONCURRENT cap", () => {
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SDK_MAX_CONCURRENT = "4";
  assert.equal(sdkMaxConcurrent(), 4);
  process.env.LI_SDK_MAX_CONCURRENT = "99";
  assert.equal(sdkMaxConcurrent(), 4);
  if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prev;
});

test("withGlobalSdkSessionLock is re-entrant (nested)", async () => {
  resetSdkSessionLockForTests();
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SDK_MAX_CONCURRENT = "1";
  let inner = false;
  await withGlobalSdkSessionLock(async () => {
    await withGlobalSdkSessionLock(async () => {
      inner = true;
    });
  });
  assert.equal(inner, true);
  if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prev;
  resetSdkSessionLockForTests();
});

test("LI_SDK_MAX_CONCURRENT allows parallel top-level sessions", async () => {
  resetSdkSessionLockForTests();
  const prev = process.env.LI_SDK_MAX_CONCURRENT;
  process.env.LI_SDK_MAX_CONCURRENT = "2";
  let active = 0;
  let maxSeen = 0;
  const holdMs = 80;
  const run = () =>
    withGlobalSdkSessionLock(async () => {
      active++;
      maxSeen = Math.max(maxSeen, active);
      await new Promise((r) => setTimeout(r, holdMs));
      active--;
    });
  await Promise.all([run(), run(), run()]);
  assert.ok(maxSeen >= 2, `expected at least 2 concurrent, saw ${maxSeen}`);
  assert.ok(maxSeen <= 2, `expected at most 2 concurrent, saw ${maxSeen}`);
  assert.equal(active, 0);
  if (prev === undefined) delete process.env.LI_SDK_MAX_CONCURRENT;
  else process.env.LI_SDK_MAX_CONCURRENT = prev;
  resetSdkSessionLockForTests();
});
