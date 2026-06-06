import assert from "node:assert/strict";
import test from "node:test";
import {
  backoffIsoFromCoreRateLimit,
  isGitHubRateLimitError,
  parseCoreRateLimit,
  rateLimitBackoffUntil,
  rateLimitResetIsoFromHeaders,
  shouldDeferForRateLimit,
} from "./github-rate-limit.js";

test("isGitHubRateLimitError detects GitHub 403 messages", () => {
  assert.equal(isGitHubRateLimitError("API rate limit exceeded for user ID 1"), true);
  assert.equal(isGitHubRateLimitError("secondary rate limit"), true);
  assert.equal(isGitHubRateLimitError("not found"), false);
});

test("rateLimitResetIsoFromHeaders uses X-RateLimit-Reset", () => {
  const now = 1_700_000_000_000;
  const resetSec = Math.floor(now / 1000) + 120;
  const iso = rateLimitResetIsoFromHeaders({ "x-ratelimit-reset": String(resetSec) }, now);
  assert.ok(iso);
  assert.ok(Date.parse(iso!) > now);
});

test("rateLimitBackoffUntil prefers header reset over fixed hour", () => {
  const now = 1_700_000_000_000;
  const resetSec = Math.floor(now / 1000) + 300;
  const until = rateLimitBackoffUntil("API rate limit exceeded", {
    "x-ratelimit-reset": String(resetSec),
  }, now);
  const delta = Date.parse(until) - now;
  assert.ok(delta < 3_600_000);
  assert.ok(delta >= 240_000);
});

test("parseCoreRateLimit reads resources.core", () => {
  const core = parseCoreRateLimit({
    resources: { core: { remaining: 12, reset: 1_700_000_100, limit: 5000 } },
  });
  assert.equal(core?.remaining, 12);
  assert.equal(core?.reset, 1_700_000_100);
});

test("shouldDeferForRateLimit when remaining low", () => {
  assert.equal(shouldDeferForRateLimit({ remaining: 10, reset: 9999999999, limit: 5000 }), true);
  assert.equal(shouldDeferForRateLimit({ remaining: 500, reset: 9999999999, limit: 5000 }), false);
});

test("backoffIsoFromCoreRateLimit adds buffer after reset", () => {
  const now = 1_700_000_000_000;
  const core = { remaining: 0, reset: Math.floor(now / 1000) + 60, limit: 5000 };
  const iso = backoffIsoFromCoreRateLimit(core, now);
  assert.ok(Date.parse(iso) >= now + 55_000);
});
