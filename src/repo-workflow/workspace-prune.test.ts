import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCmd } from "./git.js";
import {
  parseRunTimestamp,
  pruneWorkspaces,
  resetWorkspacePruneThrottle,
  runDirAgeMs,
} from "./workspace-prune.js";

test("parseRunTimestamp reads trailing millis", () => {
  assert.equal(parseRunTimestamp("bug_fixer-1779179855931"), 1779179855931);
  assert.equal(parseRunTimestamp("no-timestamp"), null);
});

test("pruneWorkspaces keeps newest N and deletes old runs", () => {
  const root = mkdtempSync(join(tmpdir(), "li-ws-prune-"));
  const repoPath = join(root, "li-langverse", "li-demo");
  const now = Date.now();
  const oldTs = now - 10 * 86_400_000;

  for (let i = 0; i < 8; i++) {
    const ts = i < 3 ? oldTs + i : now - i * 1000;
    const runId = `agent-${ts}`;
    const runDir = join(repoPath, runId, "repo");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "README.md"), `run ${i}\n`, "utf8");
  }

  const report = pruneWorkspaces({
    workspaceRoot: root,
    org: "li-langverse",
    maxAgeDays: 7,
    keepPerRepo: 2,
    maxRunsPerRepo: 5,
    skipThrottle: true,
  });

  assert.equal(report.runs_found, 8);
  assert.equal(report.runs_deleted, 3);
  assert.equal(report.runs_skipped_protected, 2);
  assert.equal(report.runs_skipped_young, 3);

  const remaining = existsSync(repoPath)
    ? readdirSync(repoPath).filter((n) => existsSync(join(repoPath, n, "repo")))
    : [];
  assert.equal(remaining.length, 5);
});

test("pruneWorkspaces skips dirty clones unless force", () => {
  const root = mkdtempSync(join(tmpdir(), "li-ws-prune-dirty-"));
  const repoPath = join(root, "li-langverse", "li-demo");
  const oldTs = Date.now() - 10 * 86_400_000;
  const runDir = join(repoPath, `agent-${oldTs}`, "repo");
  mkdirSync(runDir, { recursive: true });
  runCmd("git", ["init"], runDir, false);
  writeFileSync(join(runDir, "dirty.txt"), "x\n", "utf8");

  const withoutForce = pruneWorkspaces({
    workspaceRoot: root,
    maxAgeDays: 1,
    keepPerRepo: 0,
    skipThrottle: true,
  });
  assert.equal(withoutForce.runs_skipped_dirty, 1);
  assert.ok(existsSync(join(repoPath, `agent-${oldTs}`)));

  const withForce = pruneWorkspaces({
    workspaceRoot: root,
    maxAgeDays: 1,
    keepPerRepo: 0,
    force: true,
    skipThrottle: true,
  });
  assert.equal(withForce.runs_deleted, 1);
  assert.ok(!existsSync(join(repoPath, `agent-${oldTs}`)));
});

test("runDirAgeMs falls back to mtime", () => {
  const root = mkdtempSync(join(tmpdir(), "li-ws-age-"));
  const runDir = join(root, "custom-run-id");
  mkdirSync(runDir, { recursive: true });
  const age = runDirAgeMs(runDir, "custom-run-id");
  assert.ok(age >= 0 && age < 5000);
  resetWorkspacePruneThrottle();
});
