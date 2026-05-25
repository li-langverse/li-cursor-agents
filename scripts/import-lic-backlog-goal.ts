#!/usr/bin/env node
/**
 * Emit goal markdown for run-agent from a lic backlog todo.
 * Run: npm run build && node scripts/import-lic-backlog-goal.ts --goal-id httpd_parity
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCli = join(root, "dist", "cli", "import-lic-backlog-goal.js");

if (!existsSync(distCli)) {
  const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const run = spawnSync(process.execPath, [distCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
});
process.exit(run.status ?? 1);
