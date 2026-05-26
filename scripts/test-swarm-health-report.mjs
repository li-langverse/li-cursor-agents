#!/usr/bin/env node
/** Minimal test for scripts/swarm-health-report.sh (LI_DRY_RUN=1). */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/swarm-health-report.sh");

function run(envExtra = {}) {
  const reportDir = mkdtempSync(join(tmpdir(), "li-health-report-"));
  const r = spawnSync("bash", [script], {
    cwd: root,
    env: {
      ...process.env,
      LI_DRY_RUN: "1",
      LI_REPORT_DIR: reportDir,
      ...envExtra,
    },
    encoding: "utf8",
  });
  const files = readdirSync(reportDir).filter((f) => f.endsWith(".md") && f !== "latest.md");
  const body = files.length ? readFileSync(join(reportDir, files[0]), "utf8") : "";
  return { code: r.status ?? 1, reportDir, body, stderr: r.stderr };
}

const healthy = run();
assert.equal(healthy.code, 0, `healthy dry-run exit: ${healthy.stderr}`);
assert.match(healthy.body, /## systemd \(user\)/);
assert.match(healthy.body, /async_swarm_running \| true/);
assert.match(healthy.body, /## Research runs/);
assert.match(healthy.body, /Overall:\*\* OK/);

const unhealthy = run({ LI_MOCK_UNHEALTHY: "1" });
assert.equal(unhealthy.code, 1, "unhealthy mock should exit 1");
assert.match(unhealthy.body, /UNHEALTHY/);

console.log("OK test-swarm-health-report.mjs");
