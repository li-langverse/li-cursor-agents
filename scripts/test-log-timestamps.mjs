#!/usr/bin/env node
/**
 * Regression: supervisor stderr lines include ISO-8601 timestamps (keep-agents.log format).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { hasIsoLogPrefix } from "../dist/agent-log.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  process.execPath,
  [join(root, "dist/cli/supervisor.js"), "--once", "--mock"],
  {
    cwd: root,
    env: {
      ...process.env,
      LI_CONTROL_PLANE_STORE: "disk",
      CURSOR_MOCK: "1",
      LI_SUPERVISOR_FORCE_FIRST_TICK: "1",
      BENCHMARKS_ROOT: join(root, "fixtures/e2e-benchmarks"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

const code = await new Promise((resolve) => child.on("close", resolve));
const operational = stderr
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.includes("[supervisor]") || l.includes("[control-plane]"));

let failed = 0;
for (const line of operational) {
  if (!hasIsoLogPrefix(line)) {
    console.error(`FAIL missing ISO prefix: ${line}`);
    failed++;
  }
}

if (failed) {
  console.error(`test-log-timestamps: ${failed} line(s) without timestamp`);
  process.exit(1);
}

if (operational.length < 2) {
  console.error(`test-log-timestamps: expected supervisor log lines, got ${operational.length}`);
  process.exit(1);
}

console.log(`OK test-log-timestamps: ${operational.length} lines with ISO prefix (exit ${code})`);
process.exit(code === 0 || code === null ? 0 : code);
