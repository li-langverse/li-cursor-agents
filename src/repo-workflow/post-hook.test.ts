import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgent } from "../agents/registry.js";
import {
  applyPostHookToRunResult,
  commitPushOpenPrAfterAgentRun,
} from "./post-hook.js";
import { runCmd } from "./git.js";
import { beginRepoWorkflowSession } from "./workspace-session.js";

test("post-hook commits li-demo fixture workspace (push skipped)", () => {
  const def = getAgent("docs_maintainer");
  assert.ok(def);

  const session = beginRepoWorkflowSession({
    agentId: "docs_maintainer",
    repo: "li-demo",
    useFixture: true,
    skipPush: true,
    dryRun: false,
  });
  assert.ok(session.ok, session.error);
  assert.ok(existsSync(session.cloneDir));

  const docsDir = join(session.cloneDir, "docs");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, "agent-touch.md"), "# touch\n", "utf8");

  const push = commitPushOpenPrAfterAgentRun(session, def, {
    agentId: def.id,
    backend: "mock",
    status: "finished",
    durationMs: 1,
    outputPath: join(session.cloneDir, "out.md"),
    reason: "fixture test",
  });

  assert.equal(push.committed, true, push.error ?? push.skip_reason);
  assert.equal(push.pushed, false);
  assert.equal(push.skipped, undefined);

  const log = runCmd("git", ["log", "-1", "--oneline"], session.cloneDir, false);
  assert.ok(log.ok && log.stdout.includes("post-hook"));
});

test("post-hook dry-run reports synthetic push for dirty workspace", () => {
  const def = getAgent("ci_maintainer");
  assert.ok(def);

  const session = beginRepoWorkflowSession({
    agentId: "ci_maintainer",
    repo: "li-demo",
    useFixture: true,
    dryRun: true,
    skipPush: false,
  });
  writeFileSync(join(session.cloneDir, "ci-touch.txt"), "x\n", "utf8");

  const push = commitPushOpenPrAfterAgentRun(session, def!, {
    agentId: def!.id,
    backend: "mock",
    status: "finished",
    durationMs: 0,
    outputPath: "/tmp/out.md",
  });

  assert.equal(push.committed, true);
  assert.equal(push.pushed, true);
  assert.ok(push.pr_url?.includes("github.com") || push.pr_url?.includes("dry-run"));
});

test("post-hook skips clean workspace", () => {
  const def = getAgent("docs_maintainer")!;
  const session = beginRepoWorkflowSession({
    agentId: "docs_maintainer",
    useFixture: true,
    skipPush: true,
  });
  const push = commitPushOpenPrAfterAgentRun(session, def, {
    agentId: def.id,
    backend: "mock",
    status: "finished",
    durationMs: 0,
    outputPath: "/tmp/out.md",
  });
  assert.equal(push.skipped, true);
  assert.match(push.skip_reason ?? "", /no uncommitted/i);
});

test("applyPostHookToRunResult appends PR URL to completion", () => {
  const updated = applyPostHookToRunResult(
    {
      agentId: "docs_maintainer",
      backend: "mock",
      status: "finished",
      durationMs: 0,
      outputPath: "/tmp/x.md",
      completion: { complete: true, premature: false, pr_urls: [], deliverable_checked: true, gaps: [], evidence: [] },
    },
    {
      ok: true,
      workspace: "/tmp/ws",
      repo: "li-demo",
      committed: true,
      pushed: true,
      branch: "chore/test",
      pr_url: "https://github.com/li-langverse/li-demo/pull/99",
    },
  );
  assert.ok(updated.completion?.pr_urls.includes("https://github.com/li-langverse/li-demo/pull/99"));
  assert.match(updated.outputText ?? "", /post-hook/i);
});
