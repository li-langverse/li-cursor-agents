import { test } from "node:test";
import assert from "node:assert/strict";
import { isTransientSupabaseError, withSupabaseRetry } from "./supabase-retry.js";
import { normalizeSupabaseApiUrl } from "./supabase-url.js";

test("normalizeSupabaseApiUrl maps localhost to 127.0.0.1", () => {
  assert.equal(normalizeSupabaseApiUrl("http://localhost:54321/"), "http://127.0.0.1:54321");
});

test("isTransientSupabaseError detects fetch failed", () => {
  assert.equal(isTransientSupabaseError(new TypeError("fetch failed")), true);
  assert.equal(isTransientSupabaseError(new TypeError("terminated")), true);
  assert.equal(isTransientSupabaseError(Object.assign(new Error("aborted"), { name: "AbortError" })), true);
  assert.equal(isTransientSupabaseError(new Error("saveControlPlaneState: duplicate key")), false);
});

test("withSupabaseRetry retries TypeError terminated", async () => {
  let calls = 0;
  const result = await withSupabaseRetry("testOp", async () => {
    calls++;
    if (calls === 1) throw new TypeError("terminated");
    return "ok";
  }, { attempts: 3, baseDelayMs: 1 });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});

test("withSupabaseRetry succeeds after transient failure", async () => {
  let calls = 0;
  const result = await withSupabaseRetry("testOp", async () => {
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return "ok";
  }, { attempts: 3, baseDelayMs: 1 });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});

test("withSupabaseRetry rethrows non-transient errors immediately", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withSupabaseRetry("testOp", async () => {
        calls++;
        throw new Error("permission denied");
      }, { attempts: 4, baseDelayMs: 1 }),
    /permission denied/,
  );
  assert.equal(calls, 1);
});
