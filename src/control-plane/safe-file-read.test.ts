import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { agentsPackageRoot } from "../runner.js";
import { readFileSafe } from "./safe-file-read.js";

test("readFileSafe reads under package root", () => {
  const pkg = agentsPackageRoot();
  const rel = "package.json";
  const out = readFileSafe(rel, pkg);
  assert.ok(out);
  assert.match(out.content, /"name"/);
  assert.ok(out.resolved_path.endsWith("package.json"));
});

test("readFileSafe rejects path traversal", () => {
  const pkg = agentsPackageRoot();
  assert.equal(readFileSafe("../../../etc/passwd", pkg), null);
  assert.equal(readFileSafe(join(pkg, "..", "..", "etc", "passwd")), null);
});

test("readFileSafe reads temp file under runs dir", () => {
  const runs = join(agentsPackageRoot(), "data", "runs");
  mkdirSync(runs, { recursive: true });
  const name = `.safe-read-test-${Date.now()}.txt`;
  const full = join(runs, name);
  writeFileSync(full, "hello-safe-read", "utf8");
  try {
    const out = readFileSafe(name);
    assert.ok(out);
    assert.equal(out.content, "hello-safe-read");
  } finally {
    rmSync(full, { force: true });
  }
});
