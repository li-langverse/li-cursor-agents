import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCmd } from "./git.js";
import { discoverDirtyRepos, safeChangedPaths } from "./discover-dirty-repos.js";
import { runWorkspaceDirtySweep } from "./workspace-sweep.js";

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  runCmd("git", ["init"], dir, false);
  runCmd("git", ["config", "user.email", "sweep@test.local"], dir, false);
  runCmd("git", ["config", "user.name", "workspace-sweeper-test"], dir, false);
  writeFileSync(join(dir, "README.md"), "# test\n", "utf8");
  runCmd("git", ["add", "README.md"], dir, false);
  runCmd("git", ["commit", "-m", "init"], dir, false);
}

test("safeChangedPaths skips secret files", () => {
  const paths = safeChangedPaths(" M README.md\n M .env\n?? credentials.json");
  assert.deepEqual(paths, ["README.md"]);
});

test("safeChangedPaths preserves data/ prefix on first porcelain line", () => {
  const paths = safeChangedPaths(" M data/latest/agent-briefing.json\n M data/other.json");
  assert.deepEqual(paths, ["data/latest/agent-briefing.json", "data/other.json"]);
});

test("discoverDirtyRepos finds uncommitted sibling clone", () => {
  const root = mkdtempSync(join(tmpdir(), "li-sweep-"));
  const repo = join(root, "li-demo-sweep");
  initRepo(repo);
  writeFileSync(join(repo, "notes.txt"), "dirty\n", "utf8");

  const found = discoverDirtyRepos([repo]);
  assert.equal(found.length, 1);
  assert.equal(found[0].repo, "li-demo-sweep");
  assert.ok(found[0].changed_files >= 1);
});

test("runWorkspaceDirtySweep commits with skipPush", async () => {
  const root = mkdtempSync(join(tmpdir(), "li-sweep-run-"));
  const repo = join(root, "li-demo-sweep");
  initRepo(repo);
  writeFileSync(join(repo, "work.txt"), "save me\n", "utf8");

  const report = await runWorkspaceDirtySweep({
    roots: [repo],
    maxRepos: 1,
    skipPush: true,
    restart: false,
  });
  assert.equal(report.dirty_found, 1);
  assert.equal(report.sweeps.length, 1);
  assert.equal(report.sweeps[0].push.committed, true);
  assert.equal(report.sweeps[0].push.pushed, false);
  const status = runCmd("git", ["status", "--porcelain"], repo, false);
  assert.equal(status.stdout.trim(), "");
});
