import test from "node:test";
import assert from "node:assert/strict";
import {
  activateGitHubToken,
  ghToken,
  ghTokenCandidates,
  isGitHubRateLimitResponse,
  withGitHubTokenFailover,
} from "./github-token-pool.js";

test("ghTokenCandidates prefers primary then backup (deduped)", () => {
  process.env.GH_SWARM_TOKEN = "primary";
  process.env.GH_SWARM_TOKEN_BACKUP = "backup";
  process.env.GH_TOKEN = "primary";
  process.env.GITHUB_TOKEN = "github";
  assert.deepEqual(ghTokenCandidates(), ["primary", "backup", "github"]);
  assert.equal(ghToken(), "primary");
  delete process.env.GH_SWARM_TOKEN;
  delete process.env.GH_SWARM_TOKEN_BACKUP;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

test("isGitHubRateLimitResponse detects 403 rate limit body", () => {
  assert.equal(
    isGitHubRateLimitResponse(403, "API rate limit exceeded for user ID 1"),
    true,
  );
  assert.equal(isGitHubRateLimitResponse(404, "Not Found"), false);
});

test("withGitHubTokenFailover switches to backup on rate limit", async () => {
  process.env.GH_SWARM_TOKEN = "primary";
  process.env.GH_SWARM_TOKEN_BACKUP = "backup";
  const calls: string[] = [];
  const res = await withGitHubTokenFailover(async (token) => {
    calls.push(token);
    if (token === "primary") {
      return {
        status: 403,
        data: null,
        raw: "API rate limit exceeded",
        headers: { "x-ratelimit-reset": "9999999999" },
      };
    }
    return { status: 200, data: { ok: true }, raw: "{}", headers: {} };
  });
  assert.deepEqual(calls, ["primary", "backup"]);
  assert.equal(res.status, 200);
  assert.equal(process.env.GH_TOKEN, "backup");
  delete process.env.GH_SWARM_TOKEN;
  delete process.env.GH_SWARM_TOKEN_BACKUP;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
});

test("activateGitHubToken updates GH_TOKEN for gh CLI", () => {
  process.env.GH_SWARM_TOKEN_BACKUP = "backup-pat";
  activateGitHubToken("backup-pat");
  assert.equal(process.env.GH_TOKEN, "backup-pat");
  delete process.env.GH_SWARM_TOKEN_BACKUP;
  delete process.env.GH_TOKEN;
});
