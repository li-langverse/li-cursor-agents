#!/usr/bin/env node
/** Minimal test for scripts/swarm-health-report.sh (LI_DRY_RUN=1). */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "scripts/swarm-health-report.sh");

const REQUIRED_SECTIONS = [
  "## Trend (vs previous snapshot)",
  "## Scores (1–10, heuristic)",
  "## Recommendations",
  "## Research productivity (last 10)",
  "## Errors (1d, deduped)",
  "**Stale reconcile**",
  "**Real errors**",
  "## Self-improvement signals",
];

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
assert.match(healthy.body, /- \*\*Overall:\*\* OK/);
for (const section of REQUIRED_SECTIONS) {
  assert.match(healthy.body, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing: ${section}`);
}

// Trend: seed a prior snapshot, then generate a new report
const trendDir = mkdtempSync(join(tmpdir(), "li-health-trend-"));
const seedPath = join(trendDir, "2026-05-25T12-00.md");
const seedBody = [
  "# Swarm health report",
  "",
  "- **Overall:** OK",
  "",
  "**Real errors:** **2**",
  "",
  "| async_swarm_running | true |",
  "",
].join("\n");
writeFileSync(seedPath, seedBody);
const trendRun = spawnSync("bash", [script], {
  cwd: root,
  env: { ...process.env, LI_DRY_RUN: "1", LI_REPORT_DIR: trendDir },
  encoding: "utf8",
});
assert.equal(trendRun.status, 0, trendRun.stderr);
const trendFiles = readdirSync(trendDir).filter((f) => f.endsWith(".md") && f !== "latest.md");
const latestTrend = readFileSync(
  join(trendDir, trendFiles.sort().at(-1) ?? ""),
  "utf8",
);
assert.match(latestTrend, /Real errors \(1d\):/);
assert.match(latestTrend, /Prior file:/);

const unhealthy = run({ LI_MOCK_UNHEALTHY: "1" });
assert.equal(unhealthy.code, 1, "unhealthy mock should exit 1");
assert.match(unhealthy.body, /UNHEALTHY/);

const apiTimeout = run({ LI_MOCK_RUNTIME_TIMEOUT: "1" });
assert.equal(apiTimeout.code, 1, "runtime timeout mock should exit 1");
assert.match(apiTimeout.body, /`GET \/api\/runtime` timed out while both systemd units are active/);
assert.doesNotMatch(apiTimeout.body, /fix dashboard\/async-swarm before trusting/);

console.log("OK test-swarm-health-report.mjs");
