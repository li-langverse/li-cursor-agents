import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { isMergeQueueFresh, readMergeQueueMeta } from "./org-pr-coordination.js";

test("readMergeQueueMeta prefers updatedAt over file mtime", () => {
  const root = mkdtempSync(join(tmpdir(), "li-pr-queue-"));
  const dir = join(root, "data", "goal-directed-sprints");
  mkdirSync(dir, { recursive: true });
  const recent = new Date().toISOString();
  writeFileSync(
    join(dir, "org-pr-merge-queue.json"),
    JSON.stringify({ updatedAt: recent, report: { total: 42 } }),
    "utf8",
  );
  const meta = readMergeQueueMeta(root);
  assert.equal(meta.total, 42);
  assert.equal(meta.exists, true);
  assert.ok(isMergeQueueFresh(root, 60_000));
  rmSync(root, { recursive: true, force: true });
});

test("isMergeQueueFresh returns false when queue missing", () => {
  const root = mkdtempSync(join(tmpdir(), "li-pr-queue-"));
  assert.equal(isMergeQueueFresh(root, 60_000), false);
  rmSync(root, { recursive: true, force: true });
});
