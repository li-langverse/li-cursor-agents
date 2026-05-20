import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRunCompletion } from "./run-completion.js";

const DIGEST = [
  "## Executive summary",
  "- Bullet one about lic master plan path",
  "- Bullet two about benchmarks catalog.toml",
  "- Bullet three deferred to human review",
  "",
  "## Deliverable",
  "| Repo | Finding |",
  "| lic | docs gap |",
  "",
  "## Deferred",
  "- Item A",
  "- Item B",
].join("\n");

test("verify mode: repo-workflow without PR is not premature when digest is substantive", () => {
  const c = auditRunCompletion({
    agentId: "ci_maintainer",
    outputText: DIGEST,
    backend: "cursor-sdk",
    auditContext: { mode: "verify", skipPush: true, smokeRun: false },
  });
  assert.equal(c.premature, false);
  assert.equal(c.completion_mode, "verify");
  assert.ok(
    c.evidence.some((e) => e.includes("digest_only") || e.includes("verify")),
    `expected verify evidence, got ${c.evidence.join(",")}`,
  );
});

test("production: repo-workflow without PR stays premature", () => {
  const c = auditRunCompletion({
    agentId: "ci_maintainer",
    outputText: DIGEST,
    backend: "cursor-sdk",
    auditContext: { mode: "production", skipPush: false, smokeRun: false },
  });
  assert.equal(c.premature, true);
  assert.ok(c.gaps.some((g) => g.includes("PR URL")));
});

test("post-hook push failure is a hard gap in production", () => {
  const c = auditRunCompletion({
    agentId: "docs_maintainer",
    outputText: DIGEST,
    backend: "cursor-sdk",
    auditContext: {
      mode: "production",
      skipPush: false,
      smokeRun: false,
      postHookPushFailed: true,
      postHookError: "[git_auth_cursor_bot] denied",
    },
  });
  assert.equal(c.premature, true);
  assert.ok(c.gaps.some((g) => g.includes("post-hook push failed")));
});
